import { EventEmitter } from 'node:events';
import * as vscode from 'vscode';
import { AcpClient } from '../acp/client';
import type {
  AgentMode,
  AvailableCommand,
  ChatMessage,
  ChatPlan,
  ChatToolCall,
  ContentBlock,
  PermissionOption,
  RequestPermissionResponse,
  SessionConfigOption,
  SessionModeState,
  SessionNotification,
  SessionUpdate,
  ToolCallContent,
  ToolCallUpdate,
  UsageInfo,
} from '../acp/types';
import { getConfig, getWorkspaceCwd } from '../util/config';
import {
  buildHistorySeedTranscript,
  formatUserMessageWithAttachments,
  stripTrailingDecorations,
} from '../util/chatFormat';
import { applyTextWrite } from '../util/fileWriter';
import { getLogger } from '../util/logger';
import {
  formatModelLabel,
  loadModelCatalog,
  sessionModelContextBlock,
} from '../util/modelCatalog';
import type { EditController } from '../edits/editController';
import {
  SessionStore,
  sameCwd,
  type StoredSession,
} from './sessionStore';
import { ContextCollector } from '../context/contextCollector';

/**
 * How much conversation memory the live CLI agent has.
 * UI history can exist independently of agent context.
 */
export type AgentContextStatus =
  | 'new' // empty / fresh agent session
  | 'resumed' // CLI session/resume succeeded — agent should remember
  | 'local-only' // UI shows history, agent started cold
  | 'seeded'; // local history was injected into agent prompt context

export interface SessionState {
  localId: string;
  agentSessionId?: string;
  title: string;
  mode: AgentMode;
  model?: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  toolCalls: ChatToolCall[];
  plan?: ChatPlan;
  usage?: UsageInfo;
  modes?: SessionModeState;
  configOptions?: SessionConfigOption[];
  /** Slash commands from ACP `available_commands_update` (+ local fallbacks) */
  availableCommands: AvailableCommand[];
  busy: boolean;
  status: 'idle' | 'connecting' | 'ready' | 'error';
  lastError?: string;
  /** Context chips attached for the next prompt */
  contextItems: ContextItem[];
  /** Agent memory vs UI history (shown as banner) */
  agentContext: AgentContextStatus;
  /**
   * When true, the next sendPrompt prepends a transcript of local messages
   * so the cold agent can "remember" the restored chat.
   */
  seedHistoryOnNextPrompt?: boolean;
  /** User closed the memory banner for this open */
  contextNoticeDismissed?: boolean;
}

/** Local slash commands always offered (extension UX), even before the agent advertises any. */
export const LOCAL_SLASH_COMMANDS: AvailableCommand[] = [
  {
    name: 'help',
    description: 'List available slash commands',
  },
  {
    name: 'plan',
    description: 'Switch to Plan mode (read-only suggestions)',
  },
  {
    name: 'execute',
    description: 'Switch to Execute mode (full agent)',
  },
  {
    name: 'model',
    description: 'Pick a model (if the agent exposes options)',
  },
  {
    name: 'context',
    description: 'Add file / symbol / git context',
  },
  {
    name: 'clear',
    description: 'Clear the local chat transcript (keeps agent session)',
  },
  {
    name: 'new',
    description: 'Start a new chat session',
  },
];

export interface ContextItem {
  id: string;
  kind: 'file' | 'selection' | 'symbol' | 'git' | 'folder' | 'image';
  label: string;
  path?: string;
  detail?: string;
  text?: string;
  mimeType?: string;
  data?: string;
}

let sessionCounter = 0;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function newLocalId(): string {
  return `local_${Date.now()}_${++sessionCounter}`;
}

function newMsgId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Multi-session manager for the hybrid architecture:
 * each UI session owns its own `grok agent stdio` process (AcpClient).
 * Agent intelligence stays in the official CLI; we only orchestrate UI + ACP.
 */
export class SessionManager extends EventEmitter {
  private sessions = new Map<string, SessionState>();
  /** One ACP process (CLI subprocess) per local session id */
  private clients = new Map<string, AcpClient>();
  private activeLocalId: string | null = null;
  private readonly log = getLogger();
  private readonly contextCollector = new ContextCollector();
  private persistTimer: NodeJS.Timeout | null = null;
  /** Prevents parallel bootstrap sessions from sidebar + editor webviews */
  private bootstrapInFlight: Promise<SessionState> | null = null;

  constructor(
    readonly store: SessionStore,
    private readonly editController: EditController
  ) {
    super();
    // Shared apply path for pending diffs (not tied to a single process)
    editController.setApplyWrite((filePath, content) =>
      applyTextWrite(filePath, content)
    );
  }

  /** Active session's ACP client (if any). Prefer getClient(localId). */
  get acp(): AcpClient | undefined {
    const id = this.activeLocalId;
    return id ? this.clients.get(id) : undefined;
  }

  getClient(localId: string): AcpClient | undefined {
    return this.clients.get(localId);
  }

  getActive(): SessionState | undefined {
    return this.activeLocalId
      ? this.sessions.get(this.activeLocalId)
      : undefined;
  }

  getSession(localId: string): SessionState | undefined {
    return this.sessions.get(localId);
  }

  listSessions(): SessionState[] {
    return [...this.sessions.values()].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  }

  /** Number of live CLI agent processes */
  get processCount(): number {
    return this.clients.size;
  }

  setActive(localId: string): void {
    if (this.sessions.has(localId)) {
      this.activeLocalId = localId;
      const s = this.sessions.get(localId);
      if (s) {
        void this.store.setLastActiveLocalId(s.cwd, localId);
      }
      this.emit('activeChanged', localId);
      this.emitChange(localId);
    }
  }

  /**
   * Ensure at least one session exists (safe under concurrent webview listeners).
   * Claude Code–style: reopen the last chat for this workspace (full text history).
   */
  async ensureBootstrapSession(): Promise<SessionState | undefined> {
    if (this.sessions.size > 0) {
      return this.getActive() ?? this.listSessions()[0];
    }
    if (this.bootstrapInFlight) {
      return this.bootstrapInFlight;
    }
    this.bootstrapInFlight = this.bootstrapForWorkspace().finally(() => {
      this.bootstrapInFlight = null;
    });
    return this.bootstrapInFlight;
  }

  /**
   * Restore last session for the open folder, or start a fresh chat.
   */
  private async bootstrapForWorkspace(): Promise<SessionState> {
    const cwd = getWorkspaceCwd();
    const stored = this.store.findResumeTarget(cwd);
    if (stored) {
      this.log.info(
        `Restoring session ${stored.localId} for workspace (${stored.messages.length} messages)`
      );
      return this.openStored(stored, true);
    }
    return this.createSession();
  }

  /** History entries for the current project (webview / QuickPick). */
  listHistoryForWorkspace(limit = 40): Array<{
    localId: string;
    title: string;
    preview?: string;
    updatedAt: number;
    messageCount: number;
    mode: string;
    model?: string;
    isOpen: boolean;
    isActive: boolean;
  }> {
    const cwd = getWorkspaceCwd();
    return this.store
      .listMetaForCwd(cwd)
      .slice(0, limit)
      .map((m) => ({
        localId: m.localId,
        title: m.title || 'Chat',
        preview: m.preview,
        updatedAt: m.updatedAt,
        messageCount: m.messageCount,
        mode: m.mode,
        model: m.model,
        isOpen: this.sessions.has(m.localId),
        isActive: this.activeLocalId === m.localId,
      }));
  }

  async createSession(options?: { mode?: AgentMode }): Promise<SessionState> {
    const cfg = getConfig();
    const mode = options?.mode ?? cfg.defaultMode;
    const localId = newLocalId();
    const state: SessionState = {
      localId,
      title: 'New chat',
      mode,
      cwd: getWorkspaceCwd(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      toolCalls: [],
      availableCommands: [...LOCAL_SLASH_COMMANDS],
      busy: false,
      status: 'connecting',
      contextItems: [],
      agentContext: 'new',
    };
    this.sessions.set(localId, state);
    this.activeLocalId = localId;
    this.emit('sessionCreated', state);
    this.emitChange(localId);

    try {
      const preferredModel = cfg.defaultModel?.trim() || undefined;
      state.model = preferredModel;
      const client = this.spawnClient(localId);
      await client.connect({ model: preferredModel });
      const res = await client.newSession({ cwd: state.cwd });
      state.agentSessionId = res.sessionId;
      state.modes = res.modes ?? undefined;
      state.configOptions = normalizeConfigOptions(res.configOptions);
      // Reflect current model from agent config if present
      const fromAgent = findModelConfigOption(state.configOptions);
      if (fromAgent?.currentValue && typeof fromAgent.currentValue === 'string') {
        state.model = fromAgent.currentValue;
      }
      state.status = 'ready';

      await this.applyModePreference(state, client, mode);

      if (preferredModel && state.configOptions?.length) {
        await this.trySetModel(state, client, preferredModel);
      }

      this.schedulePersist(state);
      this.log.info(
        `Session ${localId} ready (agentSessionId=${state.agentSessionId}, processes=${this.clients.size})`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.status = 'error';
      state.lastError = message;
      this.pushSystem(state, formatCliError(message));
      this.log.error('createSession failed', message);
      await this.teardownClient(localId);
    }

    this.emitChange(localId);
    return state;
  }

  async resumeFromStore(localId: string): Promise<SessionState | undefined> {
    const stored = this.store.get(localId);
    if (!stored) {
      return undefined;
    }
    return this.openStored(stored, true);
  }

  async openHistoryPicker(): Promise<SessionState | undefined> {
    const cwd = getWorkspaceCwd();
    const forProject = this.store.listMetaForCwd(cwd);
    const others = this.store
      .listMeta()
      .filter((m) => !sameCwd(m.cwd, cwd))
      .slice(0, 20);

    if (forProject.length === 0 && others.length === 0) {
      void vscode.window.showInformationMessage(
        'No saved Grok Build sessions for this project yet. Chats are saved automatically when you talk to Grok.'
      );
      return undefined;
    }

    type HistItem = vscode.QuickPickItem & { localId?: string };
    const items: HistItem[] = [];

    if (forProject.length > 0) {
      items.push({
        label: 'This project',
        kind: vscode.QuickPickItemKind.Separator,
      });
      for (const m of forProject) {
        const open = this.sessions.has(m.localId);
        items.push({
          label: (open ? '$(comment-discussion) ' : '') + (m.title || 'Chat'),
          description: new Date(m.updatedAt).toLocaleString(),
          detail: [
            m.preview || `${m.messageCount} messages`,
            m.mode,
            m.model,
            open ? 'open' : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
          localId: m.localId,
        });
      }
    }

    if (others.length > 0) {
      items.push({
        label: 'Other folders',
        kind: vscode.QuickPickItemKind.Separator,
      });
      for (const m of others) {
        items.push({
          label: m.title || 'Chat',
          description: new Date(m.updatedAt).toLocaleString(),
          detail: `${m.preview || m.messageCount + ' messages'} · ${m.cwd}`,
          localId: m.localId,
        });
      }
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Continue a previous chat (saved per project folder)',
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked?.localId) {
      return undefined;
    }
    return this.resumeFromStore(picked.localId);
  }

  private async openStored(
    stored: StoredSession,
    tryAgentResume: boolean
  ): Promise<SessionState> {
    const existing = this.sessions.get(stored.localId);
    if (existing) {
      this.setActive(existing.localId);
      return existing;
    }

    const hasLocalHistory = (stored.messages?.length ?? 0) > 0;
    const state: SessionState = {
      localId: stored.localId,
      agentSessionId: stored.agentSessionId,
      title: stored.title,
      mode: stored.mode,
      model: stored.model,
      cwd: stored.cwd,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      messages: stored.messages,
      toolCalls: stored.toolCalls,
      plan: stored.plan,
      usage: stored.usage,
      availableCommands: [...LOCAL_SLASH_COMMANDS],
      busy: false,
      status: 'connecting',
      contextItems: [],
      agentContext: hasLocalHistory ? 'local-only' : 'new',
    };
    // Show saved messages immediately (before CLI connects) — Claude Code style
    this.sessions.set(state.localId, state);
    this.activeLocalId = state.localId;
    void this.store.setLastActiveLocalId(state.cwd, state.localId);
    this.emit('sessionCreated', state);
    this.emitChange(state.localId);

    try {
      const preferredModel =
        stored.model || getConfig().defaultModel?.trim() || undefined;
      state.model = preferredModel;
      const client = this.spawnClient(state.localId);
      await client.connect({ model: preferredModel });
      if (tryAgentResume && stored.agentSessionId) {
        try {
          const res = await client.resumeSession(stored.agentSessionId, {
            cwd: state.cwd,
          });
          state.modes = res.modes ?? undefined;
          state.configOptions = normalizeConfigOptions(res.configOptions);
          state.status = 'ready';
          state.agentContext = 'resumed';
          state.seedHistoryOnNextPrompt = false;
          this.pushSystem(
            state,
            '**Session resumed** — the agent has the previous conversation.'
          );
        } catch (err) {
          this.log.warn('Agent resume failed, creating new agent session', err);
          const res = await client.newSession({ cwd: state.cwd });
          state.agentSessionId = res.sessionId;
          state.modes = res.modes ?? undefined;
          state.configOptions = normalizeConfigOptions(res.configOptions);
          state.status = 'ready';
          if (hasLocalHistory) {
            state.agentContext = 'local-only';
            this.pushSystem(
              state,
              '**Local history loaded** — the agent starts cold and does not know the chat yet. ' +
                'Use “Load history into context” to pass the transcript on the next message.'
            );
            void this.promptSeedHistory(state);
          } else {
            state.agentContext = 'new';
          }
        }
      } else {
        const res = await client.newSession({ cwd: state.cwd });
        state.agentSessionId = res.sessionId;
        state.modes = res.modes ?? undefined;
        state.configOptions = normalizeConfigOptions(res.configOptions);
        state.status = 'ready';
        if (hasLocalHistory) {
          state.agentContext = 'local-only';
          this.pushSystem(
            state,
            '**Local history loaded** — no agent session to resume. ' +
              'The agent starts cold. Optionally load history into context.'
          );
          void this.promptSeedHistory(state);
        } else {
          state.agentContext = 'new';
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.status = 'error';
      state.lastError = message;
      this.pushSystem(state, formatCliError(message));
      await this.teardownClient(state.localId);
    }

    this.schedulePersist(state);
    this.emitChange(state.localId);
    return state;
  }

  /**
   * Ask the user whether to inject local transcript into the cold agent.
   */
  private async promptSeedHistory(state: SessionState): Promise<void> {
    const action = await vscode.window.showInformationMessage(
      'Chat history is visible in the UI, but the agent starts without memory. Load history into agent context?',
      'Load history into context',
      'Continue without context'
    );
    if (action === 'Load history into context') {
      this.enableHistorySeed(state.localId);
    } else if (action === 'Continue without context') {
      state.seedHistoryOnNextPrompt = false;
      this.pushSystem(
        state,
        'Continuing without context — the agent will not know earlier messages until you restate them.'
      );
      this.emitChange(state.localId);
    }
  }

  /** Mark session so the next user message includes a local transcript for the agent. */
  enableHistorySeed(localId: string): void {
    const state = this.sessions.get(localId);
    if (!state) {
      return;
    }
    if (state.agentContext === 'resumed' || state.agentContext === 'seeded') {
      this.pushSystem(
        state,
        state.agentContext === 'resumed'
          ? 'Agent session already resumed — extra context is not needed.'
          : 'History was already loaded into context.'
      );
      this.emitChange(localId);
      return;
    }
    const usable = (state.messages || []).filter(
      (m) =>
        (m.role === 'user' || m.role === 'agent') &&
        String(m.content || '').trim()
    );
    if (usable.length === 0) {
      this.pushSystem(state, 'No chat text available to load.');
      this.emitChange(localId);
      return;
    }
    state.seedHistoryOnNextPrompt = true;
    state.agentContext = 'local-only';
    state.contextNoticeDismissed = false;
    this.pushSystem(
      state,
      '**History will load into agent context with the next message.** ' +
        'Keep chatting — prior user/Grok messages are sent as background.'
    );
    this.emitChange(localId);
  }

  dismissHistoryBanner(localId: string): void {
    const state = this.sessions.get(localId);
    if (!state) {
      return;
    }
    if (state.seedHistoryOnNextPrompt) {
      state.seedHistoryOnNextPrompt = false;
      this.pushSystem(state, 'Context load cancelled.');
    }
    state.contextNoticeDismissed = true;
    this.emitChange(localId);
  }

  async closeSession(localId: string): Promise<void> {
    const state = this.sessions.get(localId);
    if (!state) {
      return;
    }
    const client = this.clients.get(localId);
    if (client && state.agentSessionId) {
      try {
        await client.closeSession(state.agentSessionId);
      } catch {
        /* ignore */
      }
    }
    await this.persistNow(state);
    await this.teardownClient(localId);
    this.sessions.delete(localId);
    this.editController.clearSession(localId);
    if (this.activeLocalId === localId) {
      const remaining = this.listSessions();
      this.activeLocalId = remaining[0]?.localId ?? null;
    }
    this.emit('sessionClosed', localId);
    this.log.info(`Session closed ${localId} (processes=${this.clients.size})`);
  }

  /**
   * Handle extension-local slash commands. Returns true if fully handled
   * (do not send to agent). Returns false to forward as normal prompt
   * (including agent slash commands like `/web …`).
   */
  async tryHandleLocalSlash(
    localId: string,
    text: string
  ): Promise<'handled' | 'forward'> {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) {
      return 'forward';
    }
    const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
    if (!match) {
      return 'forward';
    }
    const name = match[1].toLowerCase();
    const arg = (match[2] ?? '').trim();
    const state = this.sessions.get(localId);
    if (!state) {
      return 'forward';
    }

    switch (name) {
      case 'help': {
        const lines = (state.availableCommands ?? LOCAL_SLASH_COMMANDS).map(
          (c) => {
            const hint = c.input?.hint ? ` ‹${c.input.hint}›` : '';
            return `\`/${c.name}${hint}\` — ${c.description}`;
          }
        );
        this.pushSystem(
          state,
          `**Slash commands**\n\n${lines.join('\n')}\n\nType \`/\` in the input to pick a command.`
        );
        this.emitChange(localId);
        return 'handled';
      }
      case 'plan':
        await this.setMode(localId, 'plan');
        this.pushSystem(state, 'Mode set to **Plan**.');
        this.emitChange(localId);
        return 'handled';
      case 'execute':
      case 'agent':
      case 'code':
        await this.setMode(localId, 'execute');
        this.pushSystem(state, 'Mode set to **Execute**.');
        this.emitChange(localId);
        return 'handled';
      case 'model':
        await this.selectModel(localId);
        return 'handled';
      case 'context':
        // UI opens picker via webview message
        this.emit('requestContextPicker', localId);
        return 'handled';
      case 'clear':
        state.messages = [];
        state.toolCalls = [];
        state.plan = undefined;
        this.pushSystem(state, 'Local transcript cleared.');
        this.schedulePersist(state);
        this.emitChange(localId);
        return 'handled';
      case 'new':
        await this.createSession({ mode: state.mode });
        return 'handled';
      default:
        // Unknown or agent-defined command → send to CLI as prompt
        void arg;
        return 'forward';
    }
  }

  async sendPrompt(
    localId: string,
    text: string,
    extras?: { images?: Array<{ mimeType: string; data: string }> }
  ): Promise<void> {
    const state = this.sessions.get(localId);
    if (!state) {
      throw new Error('Session not found');
    }
    if (state.busy) {
      throw new Error('Session is busy');
    }

    // Local slash commands (help, plan, clear, …)
    if (
      (!extras?.images || extras.images.length === 0) &&
      text.trim().startsWith('/')
    ) {
      const result = await this.tryHandleLocalSlash(localId, text);
      if (result === 'handled') {
        return;
      }
    }
    if (state.status !== 'ready' || !state.agentSessionId) {
      if (state.status === 'error' || state.status === 'idle') {
        await this.reconnect(state);
      }
      if (state.status !== 'ready' || !state.agentSessionId) {
        throw new Error(state.lastError ?? 'Session is not ready — is the Grok CLI installed?');
      }
    }

    const client = this.clients.get(localId);
    if (!client?.isConnected) {
      await this.reconnect(state);
    }
    const live = this.clients.get(localId);
    if (!live?.isConnected || !state.agentSessionId) {
      throw new Error(state.lastError ?? 'Agent process is not connected');
    }

    const blocks: ContentBlock[] = [];
    // Inject restored local transcript so a cold agent can continue the chat
    if (state.seedHistoryOnNextPrompt) {
      const transcript = buildHistorySeedTranscript(state.messages);
      if (transcript) {
        blocks.push({ type: 'text', text: transcript });
        state.seedHistoryOnNextPrompt = false;
        state.agentContext = 'seeded';
        this.pushSystem(
          state,
          '**History loaded into agent context** — prior messages are attached as background for your request.'
        );
      } else {
        state.seedHistoryOnNextPrompt = false;
      }
    }
    const auto = await this.contextCollector.collectAutoContext();
    for (const item of [...state.contextItems, ...auto]) {
      const block = this.contextItemToBlock(item);
      if (block) {
        blocks.push(block);
      }
    }
    for (const img of extras?.images ?? []) {
      blocks.push({
        type: 'image',
        mimeType: img.mimeType,
        data: img.data,
      });
    }
    // Ground model identity: free-form self-report often invents wrong names
    // (e.g. "grok-code" / "composer only for subagents"). CLI -m sets inference;
    // this block forces an honest answer when asked "which model?".
    const modelMeta = sessionModelContextBlock(
      state.model || getConfig().defaultModel
    );
    if (modelMeta) {
      blocks.push({ type: 'text', text: modelMeta });
    }
    blocks.push({ type: 'text', text });

    // Visible @-refs in the chat bubble (context was silent before)
    const attached = [...state.contextItems].map((c) => {
      let relativePath: string | undefined;
      if (c.path) {
        try {
          relativePath = vscode.workspace
            .asRelativePath(c.path, false)
            .replace(/\\/g, '/');
        } catch {
          relativePath = undefined;
        }
      }
      return {
        kind: c.kind,
        label: c.label,
        path: c.path,
        relativePath,
      };
    });
    const displayText = formatUserMessageWithAttachments(text, attached);

    const userMsg: ChatMessage = {
      id: newMsgId('user'),
      role: 'user',
      content: displayText,
      timestamp: Date.now(),
      images: extras?.images?.map((i) => ({
        mimeType: i.mimeType,
        dataUrl: `data:${i.mimeType};base64,${i.data}`,
      })),
      attachments: attached.length ? attached : undefined,
    };
    state.messages.push(userMsg);
    if (state.title === 'New chat' && text.trim()) {
      state.title = text.trim().slice(0, 60) + (text.length > 60 ? '…' : '');
    }
    state.contextItems = [];
    state.busy = true;
    state.updatedAt = Date.now();
    void vscode.commands.executeCommand('setContext', 'grokBuild.isBusy', true);
    this.emitChange(localId);

    const agentMsg: ChatMessage = {
      id: newMsgId('agent'),
      role: 'agent',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };
    state.messages.push(agentMsg);
    this.emitChange(localId);

    try {
      const result = await live.prompt(state.agentSessionId, blocks);
      agentMsg.streaming = false;
      agentMsg.timestamp = Date.now();
      // Strip trailing decorative rules / blank lines (UI “ruled paper” leftovers)
      if (agentMsg.content) {
        agentMsg.content = stripTrailingDecorations(agentMsg.content);
      }
      // Drop empty agent placeholder if nothing was said
      if (!agentMsg.content?.trim()) {
        state.messages = state.messages.filter((m) => m.id !== agentMsg.id);
      }
      // Finalize thoughts (stop “streaming” so they collapse cleanly)
      for (const m of state.messages) {
        if (m.role === 'thought') {
          m.streaming = false;
        }
      }
      // Remove empty thoughts
      state.messages = state.messages.filter(
        (m) => !(m.role === 'thought' && !m.content?.trim())
      );
      if (!agentMsg.content && result.stopReason === 'cancelled') {
        // only if still present
      } else if (!agentMsg.content && result.stopReason === 'refusal') {
        /* handled by filter above */
      }
      if (result.stopReason === 'cancelled' && !state.messages.some((m) => m.id === agentMsg.id)) {
        this.pushSystem(state, '_(cancelled)_');
      } else if (result.stopReason === 'refusal' && !state.messages.some((m) => m.id === agentMsg.id)) {
        this.pushSystem(state, '_(agent refused)_');
      }
      this.log.info('Prompt finished', localId, result.stopReason);
    } catch (err) {
      agentMsg.streaming = false;
      agentMsg.timestamp = Date.now();
      const message = err instanceof Error ? err.message : String(err);
      if (!agentMsg.content) {
        agentMsg.content = `Error: ${message}`;
      } else {
        this.pushSystem(state, `Turn error: ${message}`);
      }
      this.log.error('prompt failed', message);
    } finally {
      state.busy = false;
      state.updatedAt = Date.now();
      void vscode.commands.executeCommand('setContext', 'grokBuild.isBusy', false);
      this.schedulePersist(state);
      this.emitChange(localId);
    }
  }

  cancel(localId?: string): void {
    const state = localId
      ? this.sessions.get(localId)
      : this.getActive();
    if (!state?.agentSessionId || !state.busy) {
      return;
    }
    this.clients.get(state.localId)?.cancel(state.agentSessionId);
  }

  async setMode(localId: string, mode: AgentMode): Promise<void> {
    const state = this.sessions.get(localId);
    if (!state) {
      return;
    }
    state.mode = mode;
    const client = this.clients.get(localId);
    if (client && state.agentSessionId && state.modes) {
      const match = this.resolveModeId(state, mode);
      if (match) {
        try {
          await client.setMode(state.agentSessionId, match);
        } catch (err) {
          this.log.warn('setMode failed', err);
        }
      }
    }
    this.emitChange(localId);
    this.schedulePersist(state);
  }

  async togglePlanMode(localId?: string): Promise<AgentMode> {
    const state = localId
      ? this.sessions.get(localId)
      : this.getActive();
    if (!state) {
      throw new Error('No active session');
    }
    const next: AgentMode = state.mode === 'plan' ? 'execute' : 'plan';
    await this.setMode(state.localId, next);
    return next;
  }

  addContext(localId: string, item: ContextItem): void {
    const state = this.sessions.get(localId);
    if (!state) {
      return;
    }
    state.contextItems = state.contextItems.filter(
      (c) =>
        !(c.kind === item.kind && c.path === item.path && c.label === item.label)
    );
    state.contextItems.push(item);
    this.emitChange(localId);
  }

  removeContext(localId: string, itemId: string): void {
    const state = this.sessions.get(localId);
    if (!state) {
      return;
    }
    state.contextItems = state.contextItems.filter((c) => c.id !== itemId);
    this.emitChange(localId);
  }

  /** Model choices for the webview bottom picker (no VS Code QuickPick). */
  getModelChoicesForUi(localId?: string): Array<{
    value: string;
    label: string;
    description?: string;
    selected?: boolean;
  }> {
    const state = localId
      ? this.sessions.get(localId)
      : this.getActive();
    if (!state) {
      return buildModelChoices(
        {
          model: getConfig().defaultModel,
          configOptions: undefined,
        } as SessionState,
        undefined
      ).map((c) => ({
        value: c.value,
        label: c.label.replace(/^\$\(check\)\s*/, ''),
        description: c.description,
        selected: c.label.startsWith('$(check)'),
      }));
    }
    const modelOpt = findModelConfigOption(state.configOptions);
    return buildModelChoices(state, modelOpt).map((c) => ({
      value: c.value,
      label: c.label.replace(/^\$\(check\)\s*/, ''),
      description: c.description,
      detail: c.detail,
      selected: c.label.startsWith('$(check)'),
    }));
  }

  getPermissionChoicesForUi(): Array<{
    value: string;
    label: string;
    description?: string;
    selected?: boolean;
  }> {
    const cfg = getConfig();
    return [
      {
        value: 'ask',
        label: 'Ask',
        description: 'Prompt for every tool permission',
        selected: cfg.permissionMode === 'ask' && !cfg.alwaysApprove,
      },
      {
        value: 'allow-once',
        label: 'Allow once',
        description: 'Auto-allow each request once',
        selected: cfg.permissionMode === 'allow-once' && !cfg.alwaysApprove,
      },
      {
        value: 'allow-session',
        label: 'Allow session',
        description: 'Auto-allow for this VS Code session',
        selected: cfg.permissionMode === 'allow-session' && !cfg.alwaysApprove,
      },
      {
        value: 'allow-always',
        label: 'Allow always',
        description: 'No prompts + CLI --always-approve',
        selected: cfg.permissionMode === 'allow-always' || cfg.alwaysApprove,
      },
    ];
  }

  async selectModel(localId?: string): Promise<void> {
    // Command palette fallback still uses QuickPick
    const state = localId
      ? this.sessions.get(localId)
      : this.getActive();
    if (!state) {
      void vscode.window.showWarningMessage('No active Grok session.');
      return;
    }
    const choices = this.getModelChoicesForUi(state.localId);
    const picked = await vscode.window.showQuickPick(
      choices.map((c) => ({
        label: c.selected ? `$(check) ${c.label}` : c.label,
        description: c.value,
        detail: c.description,
        value: c.value,
      })),
      { placeHolder: 'Select Grok model', title: 'Grok Build: Model' }
    );
    if (picked) {
      await this.applyModel(state.localId, picked.value);
    }
  }

  async applyModel(localId: string, modelId: string): Promise<void> {
    const state = this.sessions.get(localId) ?? this.getActive();
    if (!state) {
      void vscode.window.showWarningMessage('No active Grok session.');
      return;
    }
    const id = modelId.trim();
    if (!id) {
      return;
    }
    if (state.model === id && state.status === 'ready') {
      this.pushSystem(state, `Model already **${id}**.`);
      this.emitChange(state.localId);
      return;
    }

    const prevStatus = state.status;
    state.status = 'connecting';
    state.lastError = undefined;
    this.pushSystem(state, `Switching model to **${id}**…`);
    this.emitChange(state.localId);

    try {
      await withTimeout(
        this.respawnWithModel(state, id),
        45_000,
        `Model switch timed out after 45s (CLI not responding for \`${id}\`)`
      );
      this.log.info('Model applied via CLI -m --no-leader respawn', id);

      const client = this.clients.get(state.localId);
      const optAfter = findModelConfigOption(state.configOptions);
      if (client?.isConnected && state.agentSessionId) {
        try {
          const res = await client.setConfigOption(
            state.agentSessionId,
            optAfter?.id ?? 'model',
            id
          );
          if (res?.configOptions) {
            state.configOptions = normalizeConfigOptions(res.configOptions);
          }
        } catch (err) {
          this.log.debug('Post-respawn set_config_option(model) skipped', err);
        }
      }

      state.model = id;
      state.status = 'ready';
      try {
        await vscode.workspace
          .getConfiguration('grokBuild')
          .update('defaultModel', id, vscode.ConfigurationTarget.Global);
      } catch {
        /* ignore */
      }
      const label = formatModelLabel(id);
      this.pushSystem(
        state,
        `**Active session model: ${label}**\n` +
          `Agent restarted with \`grok agent --no-leader -m ${id} stdio\`.\n` +
          `When asked which model you are, use this id — not a free-form product nickname.`
      );
      this.schedulePersist(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.status = prevStatus === 'ready' ? 'error' : prevStatus;
      state.lastError = message;
      this.pushSystem(state, `Could not switch model: ${message}`);
      void vscode.window.showErrorMessage(`Could not switch model: ${message}`);
      // Best-effort reconnect on previous model
      try {
        if (!this.clients.get(state.localId)?.isConnected) {
          await this.reconnect(state);
        }
      } catch (reErr) {
        this.log.warn('Reconnect after failed model switch failed', reErr);
      }
    } finally {
      if (state.status === 'connecting') {
        state.status = 'ready';
      }
      this.emitChange(state.localId);
    }
  }

  async selectPermissionMode(localId?: string): Promise<void> {
    const choices = this.getPermissionChoicesForUi();
    const picked = await vscode.window.showQuickPick(
      choices.map((c) => ({
        label: c.selected ? `$(check) ${c.label}` : c.label,
        description: c.value,
        detail: c.description,
        value: c.value,
      })),
      {
        title: 'Grok Build: Permission mode',
        placeHolder: `Current: ${permissionModeLabel(getConfig())}`,
      }
    );
    if (picked) {
      await this.applyPermissionMode(localId, picked.value);
    }
  }

  async applyPermissionMode(
    localId: string | undefined,
    value: string
  ): Promise<void> {
    const state = localId
      ? this.sessions.get(localId)
      : this.getActive();
    const cfg = getConfig();
    const mode = value as
      | 'ask'
      | 'allow-once'
      | 'allow-session'
      | 'allow-always';
    if (!['ask', 'allow-once', 'allow-session', 'allow-always'].includes(mode)) {
      return;
    }
    const alwaysApprove = mode === 'allow-always';
    const conf = vscode.workspace.getConfiguration('grokBuild');
    await conf.update('permissionMode', mode, vscode.ConfigurationTarget.Global);
    await conf.update(
      'alwaysApprove',
      alwaysApprove,
      vscode.ConfigurationTarget.Global
    );

    if (state && cfg.alwaysApprove !== alwaysApprove) {
      try {
        const model =
          state.model || getConfig().defaultModel?.trim() || undefined;
        await this.respawnWithModel(state, model ?? '');
      } catch (err) {
        this.log.warn('Respawn after permission change failed', err);
      }
    }
    if (state) {
      const label =
        mode === 'allow-always'
          ? 'Allow always'
          : mode === 'allow-once'
            ? 'Allow once'
            : mode === 'allow-session'
              ? 'Allow session'
              : 'Ask';
      this.pushSystem(state, `Permission mode: **${label}** (\`${mode}\`).`);
      this.emitChange(state.localId);
    }
  }

  /** Tear down ACP process and start a new one with -m, reusing agent session if possible. */
  private async respawnWithModel(
    state: SessionState,
    modelId: string
  ): Promise<void> {
    const wasBusy = state.busy;
    if (wasBusy && state.agentSessionId) {
      this.clients.get(state.localId)?.cancel(state.agentSessionId);
    }
    await this.teardownClient(state.localId);
    state.status = 'connecting';
    this.emitChange(state.localId);

    const client = this.spawnClient(state.localId);
    await client.connect({ model: modelId });

    // New agent process → new ACP session (model is process-level)
    const res = await client.newSession({ cwd: state.cwd });
    state.agentSessionId = res.sessionId;
    state.modes = res.modes ?? undefined;
    state.configOptions = normalizeConfigOptions(res.configOptions);
    state.status = 'ready';
    state.lastError = undefined;

    // Try to also set via config option if now advertised
    const modelOpt = findModelConfigOption(state.configOptions);
    if (modelOpt && state.agentSessionId) {
      try {
        const r = await client.setConfigOption(
          state.agentSessionId,
          modelOpt.id,
          modelId
        );
        if (r?.configOptions) {
          state.configOptions = normalizeConfigOptions(r.configOptions);
        }
      } catch {
        /* model already applied via -m */
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    for (const s of this.sessions.values()) {
      await this.persistNow(s);
    }
    for (const localId of [...this.clients.keys()]) {
      await this.teardownClient(localId);
    }
    this.sessions.clear();
  }

  // ─── Process lifecycle ────────────────────────────────────────────────────

  /**
   * Spawn a dedicated `grok agent stdio` process for this UI session.
   */
  private spawnClient(localId: string): AcpClient {
    // Tear down any stale client for this id
    void this.teardownClient(localId);

    const client = new AcpClient(this.editController, (sid, tool, opts) =>
      this.handlePermission(sid, tool, opts)
    );

    client.on('sessionUpdate', (n: SessionNotification) => {
      this.onSessionUpdate(localId, n);
    });
    client.on('disconnected', () => {
      const state = this.sessions.get(localId);
      if (state && state.status === 'ready') {
        state.status = 'idle';
        state.busy = false;
        this.pushSystem(
          state,
          'Agent process disconnected. Send a message to reconnect.'
        );
        this.emitChange(localId);
      }
    });
    client.on('error', (err: Error) => {
      this.log.error(`ACP client error [${localId}]`, err);
    });

    this.clients.set(localId, client);
    return client;
  }

  private async teardownClient(localId: string): Promise<void> {
    const client = this.clients.get(localId);
    if (!client) {
      return;
    }
    this.clients.delete(localId);
    try {
      await client.disconnect();
    } catch (err) {
      this.log.debug('teardownClient', err);
    }
  }

  private async reconnect(state: SessionState): Promise<void> {
    state.status = 'connecting';
    this.emitChange(state.localId);
    try {
      const model =
        state.model || getConfig().defaultModel?.trim() || undefined;
      const client = this.spawnClient(state.localId);
      await client.connect({ model });
      if (state.agentSessionId) {
        try {
          const res = await client.resumeSession(state.agentSessionId, {
            cwd: state.cwd,
          });
          state.modes = res.modes ?? undefined;
          state.configOptions = normalizeConfigOptions(res.configOptions);
        } catch {
          const res = await client.newSession({ cwd: state.cwd });
          state.agentSessionId = res.sessionId;
          state.modes = res.modes ?? undefined;
          state.configOptions = normalizeConfigOptions(res.configOptions);
        }
      } else {
        const res = await client.newSession({ cwd: state.cwd });
        state.agentSessionId = res.sessionId;
        state.modes = res.modes ?? undefined;
        state.configOptions = normalizeConfigOptions(res.configOptions);
      }
      state.status = 'ready';
      state.lastError = undefined;
    } catch (err) {
      state.status = 'error';
      state.lastError = err instanceof Error ? err.message : String(err);
      await this.teardownClient(state.localId);
    }
    this.emitChange(state.localId);
  }

  private onSessionUpdate(localId: string, n: SessionNotification): void {
    // Prefer binding by local process owner; fall back to agent session id
    let state = this.sessions.get(localId);
    if (!state || (state.agentSessionId && state.agentSessionId !== n.sessionId)) {
      state = [...this.sessions.values()].find(
        (s) => s.agentSessionId === n.sessionId
      );
    }
    if (!state) {
      this.log.debug('Update for unknown session', n.sessionId);
      return;
    }
    this.applyUpdate(state, n.update);
    state.updatedAt = Date.now();
    this.emitChange(state.localId);
  }

  private applyUpdate(state: SessionState, update: SessionUpdate): void {
    const u = update as SessionUpdate & Record<string, unknown>;
    const kind = String(u.sessionUpdate);

    if (kind === 'agent_message_chunk') {
      const content = u.content as ContentBlock | undefined;
      const text = content?.type === 'text' ? content.text : '';
      let msg = [...state.messages]
        .reverse()
        .find((m) => m.role === 'agent' && m.streaming);
      if (!msg) {
        msg = {
          id: newMsgId('agent'),
          role: 'agent',
          content: '',
          timestamp: Date.now(),
          streaming: true,
        };
        state.messages.push(msg);
      }
      msg.content += text;
      // Keep agent bubble after tools in the timeline (Grok Build order)
      msg.timestamp = Date.now();
      return;
    }

    if (kind === 'user_message_chunk') {
      // We already insert the user message locally in sendPrompt().
      // The agent often echoes the same text via user_message_chunk → would
      // render the question twice. Deduplicate aggressively.
      const content = u.content as ContentBlock | undefined;
      const text = content?.type === 'text' ? content.text : '';
      if (!text) {
        return;
      }
      const trimmed = text.trim();
      const lastUser = [...state.messages]
        .reverse()
        .find((m) => m.role === 'user');

      if (lastUser) {
        const existing = lastUser.content.trim();
        // Same message, chunk append, or prefix/contains → merge or drop
        if (
          !existing ||
          existing === trimmed ||
          existing.includes(trimmed) ||
          trimmed.includes(existing) ||
          state.busy
        ) {
          // Streaming echo: only grow content if agent sends a longer full text
          if (trimmed.length > existing.length && trimmed.startsWith(existing)) {
            lastUser.content = text;
          } else if (!existing) {
            lastUser.content = text;
          }
          return;
        }
      }

      // True history replay (not busy, not a duplicate)
      if (state.busy) {
        return;
      }
      state.messages.push({
        id: newMsgId('user'),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      });
      return;
    }

    if (kind === 'agent_thought_chunk' || kind === 'thought_message_chunk') {
      const content = u.content as ContentBlock | undefined;
      const text = content?.type === 'text' ? content.text : '';
      let msg = [...state.messages]
        .reverse()
        .find((m) => m.role === 'thought' && m.streaming);
      if (!msg) {
        msg = {
          id: newMsgId('thought'),
          role: 'thought',
          content: '',
          timestamp: Date.now(),
          streaming: true,
        };
        state.messages.push(msg);
      }
      msg.content += text;
      msg.timestamp = Date.now();
      return;
    }

    if (kind === 'tool_call') {
      const toolCallId = String(u.toolCallId ?? '');
      const title = String(u.title ?? u.kind ?? 'Tool call');
      const toolKind = (u.kind as ChatToolCall['kind']) ?? 'other';
      const status = (u.status as ChatToolCall['status']) ?? 'pending';
      // Do NOT push a chat bubble per tool — UI renders compact collapsible rows
      // from toolCalls (avoids scroll thrashing).
      const existing = state.toolCalls.find((t) => t.id === toolCallId);
      if (existing) {
        existing.title = title;
        existing.kind = toolKind;
        existing.status = status;
        if (u.content) {
          existing.content = u.content as ToolCallContent[];
        }
        if (u.rawInput !== undefined) {
          existing.rawInput = u.rawInput;
        }
      } else {
        state.toolCalls.push({
          id: toolCallId,
          title,
          kind: toolKind,
          status,
          content: (u.content as ToolCallContent[]) ?? [],
          locations: u.locations as ChatToolCall['locations'],
          rawInput: u.rawInput,
          startedAt: Date.now(),
        });
      }
      return;
    }

    if (kind === 'tool_call_update') {
      const toolCallId = String(u.toolCallId ?? '');
      const existing = state.toolCalls.find((t) => t.id === toolCallId);
      if (existing) {
        if (u.title) {
          existing.title = String(u.title);
        }
        if (u.kind) {
          existing.kind = u.kind as ChatToolCall['kind'];
        }
        if (u.status) {
          existing.status = u.status as ChatToolCall['status'];
        }
        if (u.content) {
          existing.content = u.content as ToolCallContent[];
        }
        if (u.locations) {
          existing.locations = u.locations as ChatToolCall['locations'];
        }
        if (u.rawInput !== undefined) {
          existing.rawInput = u.rawInput;
        }
        if (
          existing.status === 'completed' ||
          existing.status === 'failed' ||
          existing.status === 'cancelled'
        ) {
          existing.finishedAt = Date.now();
        }
      }
      return;
    }

    if (kind === 'plan') {
      state.plan = { entries: (u.entries as ChatPlan['entries']) ?? [] };
      return;
    }

    if (kind === 'usage_update') {
      state.usage = {
        used: Number(u.used ?? 0),
        size: Number(u.size ?? 0),
        cost: u.cost as UsageInfo['cost'],
      };
      return;
    }

    if (kind === 'current_mode_update' || kind === 'mode_change') {
      const currentModeId = String(u.currentModeId ?? '');
      if (state.modes) {
        state.modes = { ...state.modes, currentModeId };
      }
      const modeName =
        state.modes?.availableModes.find((m) => m.id === currentModeId)?.name ??
        currentModeId;
      if (/plan/i.test(modeName)) {
        state.mode = 'plan';
      } else if (/exec|code|agent/i.test(modeName)) {
        state.mode = 'execute';
      } else {
        state.mode = modeName;
      }
      return;
    }

    if (kind === 'config_option_update') {
      state.configOptions = normalizeConfigOptions(u.configOptions);
      const modelOpt = findModelConfigOption(state.configOptions);
      if (modelOpt?.currentValue && typeof modelOpt.currentValue === 'string') {
        state.model = modelOpt.currentValue;
      }
      return;
    }

    if (kind === 'session_info_update') {
      if (u.title) {
        state.title = String(u.title);
      }
      return;
    }

    if (kind === 'available_commands_update' || kind === 'available_commands') {
      const raw =
        (u.availableCommands as AvailableCommand[] | undefined) ??
        (u.commands as AvailableCommand[] | undefined) ??
        [];
      const fromAgent = raw
        .filter((c) => c && typeof c.name === 'string')
        .map((c) => ({
          name: String(c.name).replace(/^\//, ''),
          description: String(c.description ?? ''),
          input: c.input ?? null,
        }));
      // Merge agent commands over local ones (agent wins on same name)
      const byName = new Map<string, AvailableCommand>();
      for (const c of LOCAL_SLASH_COMMANDS) {
        byName.set(c.name.toLowerCase(), c);
      }
      for (const c of fromAgent) {
        byName.set(c.name.toLowerCase(), c);
      }
      state.availableCommands = [...byName.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      this.log.info(
        `Slash commands updated (${state.availableCommands.length})`,
        state.availableCommands.map((c) => c.name).join(', ')
      );
      return;
    }

    this.log.debug('Unhandled session update', kind);
  }

  private permissionWaiters = new Map<
    string,
    {
      resolve: (r: RequestPermissionResponse) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  /**
   * ACP session/request_permission — must not hang silently.
   * Prefer webview bottom card; fallback modal message; timeout auto-allows in execute mode.
   */
  private async handlePermission(
    sessionId: string,
    toolCall: ToolCallUpdate,
    options: PermissionOption[]
  ): Promise<RequestPermissionResponse> {
    const state = [...this.sessions.values()].find(
      (s) => s.agentSessionId === sessionId
    );
    const cfg = getConfig();

    const allowOpt = options.find(
      (o) => o.kind === 'allow_once' || o.kind === 'allow_always'
    );
    const rejectOpt = options.find(
      (o) => o.kind === 'reject_once' || o.kind === 'reject_always'
    );

    // Execute mode: auto-allow tools (agentic default) unless disabled in settings.
    // Plan mode and explicit non-auto settings still prompt (modal + webview).
    const isExecute =
      state?.mode === 'execute' ||
      (!state?.mode && cfg.defaultMode === 'execute');
    if (
      isExecute &&
      allowOpt &&
      cfg.autoAllowInExecuteMode &&
      cfg.permissionMode !== 'allow-always' // already handled upstream
    ) {
      this.log.info('Auto-allow tool (execute mode)', toolCall.title, toolCall.kind);
      // No chat spam — tools show as compact collapsible rows
      return { outcome: { outcome: 'selected', optionId: allowOpt.optionId } };
    }

    if (!allowOpt && !rejectOpt) {
      return { outcome: { outcome: 'cancelled' } };
    }

    const permId = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const localId = state?.localId;

    // Notify webview
    this.emit('permissionRequest', {
      id: permId,
      localId,
      sessionId,
      toolCall,
      options: options.map((o) => ({
        optionId: o.optionId,
        name: o.name,
        kind: o.kind,
      })),
    });

    // Also show a modal that can't be missed (Extension Host often hides QuickPick)
    const title = toolCall.title ?? toolCall.kind ?? 'tool action';
    void vscode.window
      .showWarningMessage(
        `Grok wants to: ${title}`,
        { modal: true, detail: `Session tool permission (${toolCall.kind ?? 'other'})` },
        'Allow',
        'Allow always',
        'Reject'
      )
      .then((choice) => {
        if (!this.permissionWaiters.has(permId)) {
          return;
        }
        if (choice === 'Allow' && allowOpt) {
          this.resolvePermission(permId, {
            outcome: { outcome: 'selected', optionId: allowOpt.optionId },
          });
        } else if (choice === 'Allow always') {
          const always =
            options.find((o) => o.kind === 'allow_always') ?? allowOpt;
          if (always) {
            this.resolvePermission(permId, {
              outcome: { outcome: 'selected', optionId: always.optionId },
            });
          }
        } else if (choice === 'Reject' && rejectOpt) {
          this.resolvePermission(permId, {
            outcome: { outcome: 'selected', optionId: rejectOpt.optionId },
          });
        } else if (!choice && allowOpt && isExecute) {
          // Dismissed modal in execute → allow so work continues
          this.resolvePermission(permId, {
            outcome: { outcome: 'selected', optionId: allowOpt.optionId },
          });
        } else {
          this.resolvePermission(permId, { outcome: { outcome: 'cancelled' } });
        }
      });

    return new Promise<RequestPermissionResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.log.warn('Permission timed out — auto-allow', title);
        if (allowOpt) {
          this.resolvePermission(permId, {
            outcome: { outcome: 'selected', optionId: allowOpt.optionId },
          });
        } else {
          this.resolvePermission(permId, { outcome: { outcome: 'cancelled' } });
        }
      }, 90_000);
      this.permissionWaiters.set(permId, { resolve, timer });
    });
  }

  resolvePermission(
    permId: string,
    response: RequestPermissionResponse
  ): void {
    const w = this.permissionWaiters.get(permId);
    if (!w) {
      return;
    }
    clearTimeout(w.timer);
    this.permissionWaiters.delete(permId);
    w.resolve(response);
    this.emit('permissionResolved', permId);
  }

  /** Webview / command response to a pending permission card */
  respondPermissionFromUi(
    permId: string,
    decision: 'allow' | 'allow_always' | 'reject' | 'cancel',
    options: PermissionOption[]
  ): void {
    const allowOpt = options.find(
      (o) => o.kind === 'allow_once' || o.kind === 'allow_always'
    );
    const alwaysOpt = options.find((o) => o.kind === 'allow_always') ?? allowOpt;
    const rejectOpt = options.find(
      (o) => o.kind === 'reject_once' || o.kind === 'reject_always'
    );
    if (decision === 'allow' && allowOpt) {
      this.resolvePermission(permId, {
        outcome: { outcome: 'selected', optionId: allowOpt.optionId },
      });
    } else if (decision === 'allow_always' && alwaysOpt) {
      this.resolvePermission(permId, {
        outcome: { outcome: 'selected', optionId: alwaysOpt.optionId },
      });
    } else if (decision === 'reject' && rejectOpt) {
      this.resolvePermission(permId, {
        outcome: { outcome: 'selected', optionId: rejectOpt.optionId },
      });
    } else {
      this.resolvePermission(permId, { outcome: { outcome: 'cancelled' } });
    }
  }

  private contextItemToBlock(item: ContextItem): ContentBlock | null {
    if (item.kind === 'image' && item.data && item.mimeType) {
      return { type: 'image', data: item.data, mimeType: item.mimeType };
    }
    if (item.text && item.path) {
      return {
        type: 'resource',
        resource: {
          uri: pathToFileUri(item.path),
          mimeType: item.mimeType ?? 'text/plain',
          text: item.text,
        },
      };
    }
    if (item.path) {
      return {
        type: 'resource_link',
        uri: pathToFileUri(item.path),
        name: item.label,
        description: item.detail,
      };
    }
    if (item.text) {
      return {
        type: 'text',
        text: `[${item.kind}] ${item.label}\n${item.text}`,
      };
    }
    return null;
  }

  private resolveModeId(state: SessionState, mode: AgentMode): string | null {
    if (!state.modes?.availableModes?.length) {
      return null;
    }
    const modes = state.modes.availableModes;
    if (mode === 'plan') {
      const m =
        modes.find((x) => /plan/i.test(x.id) || /plan/i.test(x.name)) ??
        modes.find((x) => /ask|read/i.test(x.id));
      return m?.id ?? null;
    }
    if (mode === 'execute') {
      const m =
        modes.find((x) => /exec|code|agent|default/i.test(x.id)) ??
        modes.find((x) => /exec|code|agent/i.test(x.name));
      return m?.id ?? modes[0]?.id ?? null;
    }
    return modes.find((x) => x.id === mode || x.name === mode)?.id ?? null;
  }

  private async applyModePreference(
    state: SessionState,
    client: AcpClient,
    mode: AgentMode
  ): Promise<void> {
    const id = this.resolveModeId(state, mode);
    if (id && state.agentSessionId) {
      try {
        await client.setMode(state.agentSessionId, id);
        if (state.modes) {
          state.modes = { ...state.modes, currentModeId: id };
        }
      } catch (err) {
        this.log.debug('Could not set initial mode', err);
      }
    }
  }

  private async trySetModel(
    state: SessionState,
    client: AcpClient,
    model: string
  ): Promise<void> {
    if (!state.configOptions || !state.agentSessionId) {
      return;
    }
    const modelOpt = state.configOptions.find(
      (o) =>
        o.category === 'model' ||
        /model/i.test(o.id) ||
        /model/i.test(o.name)
    );
    if (!modelOpt) {
      return;
    }
    try {
      const res = await client.setConfigOption(
        state.agentSessionId,
        modelOpt.id,
        model
      );
      state.configOptions = res.configOptions;
      state.model = model;
    } catch (err) {
      this.log.debug('Could not set default model', err);
    }
  }

  private pushSystem(state: SessionState, content: string): void {
    state.messages.push({
      id: newMsgId('sys'),
      role: 'system',
      content,
      timestamp: Date.now(),
    });
  }

  private emitChange(localId: string): void {
    const state = this.sessions.get(localId);
    if (state) {
      this.emit('sessionChanged', state);
    }
  }

  private schedulePersist(state: SessionState): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      void this.persistNow(state);
    }, 500);
  }

  private async persistNow(state: SessionState): Promise<void> {
    const stored: StoredSession = {
      localId: state.localId,
      agentSessionId: state.agentSessionId,
      title: state.title,
      mode: state.mode,
      model: state.model,
      cwd: state.cwd,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      messageCount: state.messages.length,
      messages: state.messages.map((m) => ({ ...m, streaming: false })),
      toolCalls: state.toolCalls,
      plan: state.plan,
      usage: state.usage,
    };
    await this.store.save(stored);
  }
}

function pathToFileUri(fsPath: string): string {
  const normalized = fsPath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized.startsWith('/') ? '' : '/'}${normalized}`;
}

function formatCliError(message: string): string {
  if (/ENOENT|not found|spawn/i.test(message)) {
    return (
      `Failed to start Grok CLI agent: ${message}\n\n` +
      'This extension uses the official CLI via ACP (`grok agent stdio`). ' +
      'Install from https://x.ai/cli or run **Grok Build: Check Grok CLI Status**.'
    );
  }
  return `Failed to start agent: ${message}`;
}

export function permissionModeLabel(cfg: {
  permissionMode: string;
  alwaysApprove: boolean;
}): string {
  if (cfg.alwaysApprove || cfg.permissionMode === 'allow-always') {
    return 'Always';
  }
  switch (cfg.permissionMode) {
    case 'allow-once':
      return 'Once';
    case 'allow-session':
      return 'Session';
    case 'ask':
    default:
      return 'Ask';
  }
}

/**
 * Extended catalog for the picker UI.
 * `grok models` / models_cache often lists only a subset (e.g. 4.5 + Composer).
 * We still offer known IDs so users can try them; the CLI will error if unknown.
 */
const FALLBACK_MODELS: Array<{
  value: string;
  name: string;
  description?: string;
}> = [
  {
    value: 'grok-4.5',
    name: 'Grok 4.5',
    description: 'Default full model',
  },
  {
    value: 'grok-composer-2.5-fast',
    name: 'Composer 2.5',
    description: "Cursor's latest coding model (fast)",
  },
  {
    value: 'grok-4',
    name: 'Grok 4',
    description: 'Grok 4',
  },
  {
    value: 'grok-4-fast',
    name: 'Grok 4 Fast',
    description: 'Faster Grok 4 variant',
  },
  {
    value: 'grok-4-0709',
    name: 'Grok 4 (0709)',
    description: 'Grok 4 snapshot',
  },
  {
    value: 'grok-3',
    name: 'Grok 3',
    description: 'Grok 3',
  },
  {
    value: 'grok-3-mini',
    name: 'Grok 3 Mini',
    description: 'Smaller / faster Grok 3',
  },
  {
    value: 'grok-code-fast-1',
    name: 'Grok Code Fast 1',
    description: 'Fast coding model',
  },
  {
    value: 'grok-build',
    name: 'Grok Build',
    description: 'Build-oriented model id (ui fork_secondary)',
  },
  {
    value: 'grok-2',
    name: 'Grok 2',
    description: 'Legacy Grok 2',
  },
];

function normalizeConfigOptions(
  raw: unknown
): SessionConfigOption[] | undefined {
  if (!raw) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const out: SessionConfigOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? o.configId ?? '');
    if (!id) {
      continue;
    }
    const optionsRaw = o.options ?? o.values ?? o.choices;
    let options: SessionConfigOption['options'];
    if (Array.isArray(optionsRaw)) {
      options = optionsRaw.map((v) => {
        if (typeof v === 'string') {
          return { value: v, name: v };
        }
        const x = v as Record<string, unknown>;
        return {
          value: String(x.value ?? x.id ?? x.name ?? ''),
          name: String(x.name ?? x.label ?? x.value ?? x.id ?? ''),
          description:
            x.description != null ? String(x.description) : undefined,
        };
      }).filter((x) => x.value);
    }
    out.push({
      id,
      name: String(o.name ?? id),
      description: o.description != null ? String(o.description) : undefined,
      category: o.category != null ? String(o.category) : undefined,
      type: o.type != null ? String(o.type) : 'select',
      currentValue: (o.currentValue ?? o.current_value) as
        | string
        | boolean
        | undefined,
      options,
    });
  }
  return out.length ? out : undefined;
}

function findModelConfigOption(
  options: SessionConfigOption[] | undefined
): SessionConfigOption | undefined {
  if (!options?.length) {
    return undefined;
  }
  return (
    options.find((o) => o.category === 'model') ??
    options.find((o) => /^model$/i.test(o.id)) ??
    options.find((o) => /model/i.test(o.id) || /model/i.test(o.name))
  );
}

function buildModelChoices(
  state: SessionState,
  modelOpt: SessionConfigOption | undefined
): Array<vscode.QuickPickItem & { value: string }> {
  const current = state.model ?? (typeof modelOpt?.currentValue === 'string'
    ? modelOpt.currentValue
    : undefined);

  const fromAgent = modelOpt?.options?.length
    ? modelOpt.options.map((o) => ({
        label: o.name || o.value,
        description: o.value,
        detail: o.description,
        value: o.value,
        picked: o.value === current,
      }))
    : [];

  if (fromAgent.length > 0) {
    return fromAgent.map((o) => ({
      ...o,
      label: o.picked ? `$(check) ${o.label}` : o.label,
    }));
  }

  // Merge: live cache (grok models) + extended fallback catalog.
  // Cache wins on display name when the same id appears in both.
  const byId = new Map<
    string,
    { value: string; name: string; description?: string; live?: boolean }
  >();

  for (const m of FALLBACK_MODELS) {
    byId.set(m.value, {
      value: m.value,
      name: m.name,
      description: m.description,
      live: false,
    });
  }

  for (const m of loadModelCatalog()) {
    byId.set(m.id, {
      value: m.id,
      name: m.name || m.id,
      description: m.description
        ? `${m.description} · available`
        : 'Available (grok models)',
      live: true,
    });
  }

  const def = getConfig().defaultModel?.trim();
  if (def && !byId.has(def)) {
    byId.set(def, {
      value: def,
      name: def,
      description: 'Configured default',
      live: false,
    });
  }
  if (current && !byId.has(current)) {
    byId.set(current, {
      value: current,
      name: current,
      description: 'Current session',
      live: true,
    });
  }

  // Live / current first, then the rest alphabetically by name
  const list = [...byId.values()].sort((a, b) => {
    if (a.value === current) {
      return -1;
    }
    if (b.value === current) {
      return 1;
    }
    if (a.live !== b.live) {
      return a.live ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return list.map((m) => ({
    label: m.value === current ? `$(check) ${m.name}` : m.name,
    description: m.value,
    detail: m.description,
    value: m.value,
  }));
}
