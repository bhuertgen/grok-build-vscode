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
import { applyTextWrite } from '../util/fileWriter';
import { getLogger } from '../util/logger';
import type { EditController } from '../edits/editController';
import { SessionStore, type StoredSession } from './sessionStore';
import { ContextCollector } from '../context/contextCollector';

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
      this.emit('activeChanged', localId);
      this.emitChange(localId);
    }
  }

  /**
   * Ensure at least one session exists (safe under concurrent webview listeners).
   */
  async ensureBootstrapSession(): Promise<SessionState | undefined> {
    if (this.sessions.size > 0) {
      return this.getActive() ?? this.listSessions()[0];
    }
    if (this.bootstrapInFlight) {
      return this.bootstrapInFlight;
    }
    this.bootstrapInFlight = this.createSession().finally(() => {
      this.bootstrapInFlight = null;
    });
    return this.bootstrapInFlight;
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
    const metas = this.store.listMeta();
    if (metas.length === 0) {
      void vscode.window.showInformationMessage('No saved Grok Build sessions.');
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      metas.map((m) => ({
        label: m.title,
        description: new Date(m.updatedAt).toLocaleString(),
        detail: `${m.mode} · ${m.messageCount} messages · ${m.cwd}`,
        localId: m.localId,
      })),
      { placeHolder: 'Resume a previous session' }
    );
    if (!picked) {
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
    };
    this.sessions.set(state.localId, state);
    this.activeLocalId = state.localId;
    this.emit('sessionCreated', state);

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
        } catch (err) {
          this.log.warn('Agent resume failed, creating new agent session', err);
          const res = await client.newSession({ cwd: state.cwd });
          state.agentSessionId = res.sessionId;
          state.modes = res.modes ?? undefined;
          state.configOptions = normalizeConfigOptions(res.configOptions);
          state.status = 'ready';
          this.pushSystem(
            state,
            'Previous agent session could not be resumed on the CLI; started a new agent process (local chat history preserved).'
          );
        }
      } else {
        const res = await client.newSession({ cwd: state.cwd });
        state.agentSessionId = res.sessionId;
        state.modes = res.modes ?? undefined;
        state.configOptions = normalizeConfigOptions(res.configOptions);
        state.status = 'ready';
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.status = 'error';
      state.lastError = message;
      this.pushSystem(state, formatCliError(message));
      await this.teardownClient(state.localId);
    }

    this.emitChange(state.localId);
    return state;
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
    blocks.push({ type: 'text', text });

    const userMsg: ChatMessage = {
      id: newMsgId('user'),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      images: extras?.images?.map((i) => ({
        mimeType: i.mimeType,
        dataUrl: `data:${i.mimeType};base64,${i.data}`,
      })),
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
      if (!agentMsg.content && result.stopReason === 'cancelled') {
        agentMsg.content = '_(cancelled)_';
      } else if (!agentMsg.content && result.stopReason === 'refusal') {
        agentMsg.content = '_(agent refused)_';
      }
      this.log.info('Prompt finished', localId, result.stopReason);
    } catch (err) {
      agentMsg.streaming = false;
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

  async selectModel(localId?: string): Promise<void> {
    const state = localId
      ? this.sessions.get(localId)
      : this.getActive();
    if (!state) {
      void vscode.window.showWarningMessage('No active Grok session.');
      return;
    }

    const modelOpt = findModelConfigOption(state.configOptions);
    const choices = buildModelChoices(state, modelOpt);
    if (choices.length === 0) {
      void vscode.window.showWarningMessage(
        'No models available. Set grokBuild.defaultModel or update the Grok CLI.'
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(choices, {
      placeHolder: 'Select Grok model',
      title: 'Grok Build: Model',
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked) {
      return;
    }

    const modelId = picked.value;

    // Always respawn: Grok applies model at process start (`agent -m … stdio`).
    // ACP set_config_option alone often keeps the process default (e.g. grok-4.5).
    try {
      await this.respawnWithModel(state, modelId);
      this.log.info('Model applied via CLI -m --no-leader respawn', modelId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Could not switch model: ${message}`);
      return;
    }

    // Best-effort also set via ACP after restart (if agent exposes the option)
    const client = this.clients.get(state.localId);
    const optAfter = findModelConfigOption(state.configOptions);
    if (client?.isConnected && state.agentSessionId) {
      try {
        const res = await client.setConfigOption(
          state.agentSessionId,
          optAfter?.id ?? modelOpt?.id ?? 'model',
          modelId
        );
        if (res?.configOptions) {
          state.configOptions = normalizeConfigOptions(res.configOptions);
        }
      } catch (err) {
        this.log.debug('Post-respawn set_config_option(model) skipped', err);
      }
    }

    state.model = modelId;
    try {
      await vscode.workspace
        .getConfiguration('grokBuild')
        .update('defaultModel', modelId, vscode.ConfigurationTarget.Global);
    } catch {
      /* ignore */
    }
    this.pushSystem(
      state,
      `Model set to **${modelId}** (agent restarted with \`-m ${modelId} --no-leader\`).`
    );
    this.schedulePersist(state);
    this.emitChange(state.localId);
    void vscode.window.showInformationMessage(`Grok model: ${modelId}`);
  }

  /**
   * UI permission mode for ACP session/request_permission dialogs.
   * Shown in the chat status bar; persists to settings.
   */
  async selectPermissionMode(localId?: string): Promise<void> {
    const state = localId
      ? this.sessions.get(localId)
      : this.getActive();
    const cfg = getConfig();
    type Item = vscode.QuickPickItem & {
      value: 'ask' | 'allow-once' | 'allow-session' | 'allow-always';
      alwaysApprove?: boolean;
    };
    const items: Item[] = [
      {
        label: 'Ask',
        description: 'ask',
        detail: 'Prompt for every tool permission (recommended)',
        value: 'ask',
        picked: cfg.permissionMode === 'ask' && !cfg.alwaysApprove,
      },
      {
        label: 'Allow once (auto)',
        description: 'allow-once',
        detail: 'Auto-allow each request once without dialog',
        value: 'allow-once',
        picked: cfg.permissionMode === 'allow-once' && !cfg.alwaysApprove,
      },
      {
        label: 'Allow session',
        description: 'allow-session',
        detail: 'Auto-allow for the rest of this VS Code session',
        value: 'allow-session',
        picked: cfg.permissionMode === 'allow-session' && !cfg.alwaysApprove,
      },
      {
        label: 'Allow always (+ CLI --always-approve)',
        description: 'allow-always',
        detail: 'No prompts; also restarts agent with --always-approve',
        value: 'allow-always',
        alwaysApprove: true,
        picked: cfg.permissionMode === 'allow-always' || cfg.alwaysApprove,
      },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Grok Build: Permission mode',
      placeHolder: `Current: ${permissionModeLabel(cfg)}`,
    });
    if (!picked) {
      return;
    }
    const conf = vscode.workspace.getConfiguration('grokBuild');
    await conf.update(
      'permissionMode',
      picked.value,
      vscode.ConfigurationTarget.Global
    );
    await conf.update(
      'alwaysApprove',
      !!picked.alwaysApprove,
      vscode.ConfigurationTarget.Global
    );
    // Apply always-approve at process level when needed
    if (state && cfg.alwaysApprove !== !!picked.alwaysApprove) {
      try {
        const model =
          state.model || getConfig().defaultModel?.trim() || undefined;
        await this.respawnWithModel(state, model ?? '');
      } catch (err) {
        this.log.warn('Respawn after permission change failed', err);
      }
    }
    if (state) {
      this.pushSystem(
        state,
        `Permission mode: **${picked.label}** (\`${picked.value}\`).`
      );
      this.emitChange(state.localId);
    }
    void vscode.window.showInformationMessage(
      `Permission mode: ${picked.label}`
    );
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
      return;
    }

    if (kind === 'user_message_chunk') {
      const content = u.content as ContentBlock | undefined;
      const text = content?.type === 'text' ? content.text : '';
      const last = state.messages[state.messages.length - 1];
      if (last?.role === 'user' && Date.now() - last.timestamp < 500) {
        last.content += text;
      } else {
        state.messages.push({
          id: newMsgId('user'),
          role: 'user',
          content: text,
          timestamp: Date.now(),
        });
      }
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
      return;
    }

    if (kind === 'tool_call') {
      const toolCallId = String(u.toolCallId ?? '');
      const title = String(u.title ?? u.kind ?? 'Tool call');
      const toolKind = (u.kind as ChatToolCall['kind']) ?? 'other';
      const status = (u.status as ChatToolCall['status']) ?? 'pending';
      const tc: ChatToolCall = {
        id: toolCallId,
        title,
        kind: toolKind,
        status,
        content: (u.content as ToolCallContent[]) ?? [],
        locations: u.locations as ChatToolCall['locations'],
        rawInput: u.rawInput,
        startedAt: Date.now(),
      };
      state.toolCalls.push(tc);
      state.messages.push({
        id: newMsgId('tool'),
        role: 'system',
        content: `⚙ ${tc.title} (${tc.kind}) — ${tc.status}`,
        timestamp: Date.now(),
      });
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
        if (
          existing.status === 'completed' ||
          existing.status === 'failed' ||
          existing.status === 'cancelled'
        ) {
          existing.finishedAt = Date.now();
        }
        const sys = [...state.messages]
          .reverse()
          .find((m) => m.role === 'system' && m.content.includes(existing.title));
        if (sys) {
          sys.content = `⚙ ${existing.title} (${existing.kind}) — ${existing.status}`;
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

  private async handlePermission(
    _sessionId: string,
    toolCall: ToolCallUpdate,
    options: PermissionOption[]
  ): Promise<RequestPermissionResponse> {
    type Item = vscode.QuickPickItem & { optionId: string };
    const items: Item[] = options.map((o) => ({
      label: o.name,
      description: o.kind,
      optionId: o.optionId,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      title: `Permission: ${toolCall.title ?? toolCall.kind ?? 'tool'}`,
      placeHolder: 'Allow or reject this action',
      ignoreFocusOut: true,
    });
    if (!picked) {
      return { outcome: { outcome: 'cancelled' } };
    }
    return { outcome: { outcome: 'selected', optionId: picked.optionId } };
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

/** Known Grok models when the agent does not advertise configOptions. */
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
    name: 'Grok Composer 2.5 Fast',
    description: 'Fast coding / composer',
  },
  {
    value: 'grok-code-fast-1',
    name: 'Grok Code Fast 1',
    description: 'Fast coding model',
  },
  {
    value: 'grok-4',
    name: 'Grok 4',
    description: 'Grok 4',
  },
  {
    value: 'grok-build',
    name: 'Grok Build',
    description: 'Build-oriented model id',
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

  // Fallback catalog (+ any defaultModel not in the list)
  const list = [...FALLBACK_MODELS];
  const def = getConfig().defaultModel?.trim();
  if (def && !list.some((m) => m.value === def)) {
    list.unshift({ value: def, name: def, description: 'Configured default' });
  }
  if (current && !list.some((m) => m.value === current)) {
    list.unshift({ value: current, name: current, description: 'Current' });
  }

  return list.map((m) => ({
    label: m.value === current ? `$(check) ${m.name}` : m.name,
    description: m.value,
    detail: m.description,
    value: m.value,
  }));
}
