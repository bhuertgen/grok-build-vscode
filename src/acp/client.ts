import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as vscode from 'vscode';
import { AcpTransport } from './transport';
import { ClientHandlers } from './handlers';
import {
  ACP_PROTOCOL_VERSION,
  type AgentCapabilities,
  type ContentBlock,
  type Implementation,
  type InitializeResponse,
  type JsonRpcRequest,
  type JsonRpcNotification,
  type LoadSessionResponse,
  type McpServer,
  type NewSessionResponse,
  type PromptResponse,
  type SessionConfigOption,
  type SessionId,
  type SessionModeId,
  type SessionModeState,
  type SessionNotification,
  type SessionUpdate,
  type StopReason,
} from './types';
import { getConfig, getWorkspaceCwd } from '../util/config';
import { getLogger } from '../util/logger';
import type { EditController } from '../edits/editController';

export interface AcpClientEvents {
  sessionUpdate: [SessionNotification];
  connected: [];
  disconnected: [code: number | null, signal: NodeJS.Signals | null];
  error: [Error];
  stderr: [string];
}

/**
 * High-level ACP client: spawns `grok agent stdio` and speaks JSON-RPC.
 */
export class AcpClient extends EventEmitter {
  private transport: AcpTransport | null = null;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private handlers: ClientHandlers;
  private initialized = false;
  private agentCapabilities: AgentCapabilities = {};
  private agentInfo: Implementation | null = null;
  private readonly log = getLogger();

  constructor(
    editController: EditController,
    permissionUi?: ConstructorParameters<typeof ClientHandlers>[1]
  ) {
    super();
    this.handlers = new ClientHandlers(editController, permissionUi);
  }

  get isConnected(): boolean {
    return this.transport !== null && !this.transport.isClosed && this.initialized;
  }

  get capabilities(): AgentCapabilities {
    return this.agentCapabilities;
  }

  get info(): Implementation | null {
    return this.agentInfo;
  }

  get clientHandlers(): ClientHandlers {
    return this.handlers;
  }

  /**
   * @param options.model  Preferred model id → injected as `grok agent -m <id> stdio`
   */
  async connect(options?: { model?: string }): Promise<InitializeResponse> {
    if (this.isConnected) {
      return {
        protocolVersion: ACP_PROTOCOL_VERSION,
        agentCapabilities: this.agentCapabilities,
        agentInfo: this.agentInfo ?? undefined,
      };
    }

    await this.disconnect();

    const cfg = getConfig();
    const model = (options?.model ?? cfg.defaultModel)?.trim() || undefined;
    const args = buildAgentArgs(cfg.cliArgs, model);
    this.log.info(`Starting agent: ${cfg.cliPath} ${args.join(' ')}`);

    const cwd = getWorkspaceCwd();
    // Prefer shell:false so -m / flags are not mangled on Windows
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (model) {
      // Some builds also honor env (belt-and-suspenders with -m)
      env.GROK_MODEL = model;
    }
    try {
      this.proc = spawn(cfg.cliPath, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      }) as ChildProcessWithoutNullStreams;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to spawn Grok CLI ("${cfg.cliPath}"). Is it installed and on PATH?\n${message}`
      );
    }

    this.transport = new AcpTransport(this.proc);
    this.transport.on('request', (req: JsonRpcRequest) => {
      void this.handleInboundRequest(req);
    });
    this.transport.on('notification', (n: JsonRpcNotification) => {
      this.handleNotification(n);
    });
    this.transport.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      this.initialized = false;
      this.emit('disconnected', code, signal);
    });
    this.transport.on('error', (err: Error) => this.emit('error', err));
    this.transport.on('stderr', (text: string) => this.emit('stderr', text));

    const enableTerminal = getConfig().enableTerminal;
    const init = await this.transport.request<InitializeResponse>('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: enableTerminal,
        session: { configOptions: { boolean: {} } },
      },
      clientInfo: {
        name: 'grok-build-vscode',
        title: 'Grok Build for VS Code',
        version: vscode.extensions.getExtension('grok-build.grok-build-vscode')
          ?.packageJSON?.version ?? '0.1.0',
      },
    });

    if (init.protocolVersion !== ACP_PROTOCOL_VERSION) {
      this.log.warn(
        `Agent protocol version ${init.protocolVersion} differs from client ${ACP_PROTOCOL_VERSION}`
      );
    }

    this.agentCapabilities = init.agentCapabilities ?? {};
    this.agentInfo = init.agentInfo ?? null;
    this.initialized = true;
    this.log.info('ACP initialized', this.agentInfo);
    this.emit('connected');
    return init;
  }

  async disconnect(): Promise<void> {
    this.initialized = false;
    this.handlers.dispose();
    if (this.transport) {
      this.transport.dispose();
      this.transport = null;
    }
    this.proc = null;
  }

  async newSession(options?: {
    cwd?: string;
    mcpServers?: McpServer[];
    additionalDirectories?: string[];
  }): Promise<NewSessionResponse> {
    await this.ensureConnected();
    const cwd = options?.cwd ?? getWorkspaceCwd();
    return this.transport!.request<NewSessionResponse>('session/new', {
      cwd,
      mcpServers: options?.mcpServers ?? [],
      additionalDirectories: options?.additionalDirectories,
    });
  }

  async loadSession(
    sessionId: SessionId,
    options?: { cwd?: string; mcpServers?: McpServer[] }
  ): Promise<LoadSessionResponse> {
    await this.ensureConnected();
    if (!this.agentCapabilities.loadSession) {
      throw new Error('Agent does not support session/load');
    }
    return this.transport!.request<LoadSessionResponse>('session/load', {
      sessionId,
      cwd: options?.cwd ?? getWorkspaceCwd(),
      mcpServers: options?.mcpServers ?? [],
    });
  }

  async resumeSession(
    sessionId: SessionId,
    options?: { cwd?: string; mcpServers?: McpServer[] }
  ): Promise<LoadSessionResponse> {
    await this.ensureConnected();
    const canResume = !!this.agentCapabilities.sessionCapabilities?.resume;
    if (!canResume) {
      // Fall back to load if available
      if (this.agentCapabilities.loadSession) {
        return this.loadSession(sessionId, options);
      }
      throw new Error('Agent does not support session/resume or session/load');
    }
    return this.transport!.request<LoadSessionResponse>('session/resume', {
      sessionId,
      cwd: options?.cwd ?? getWorkspaceCwd(),
      mcpServers: options?.mcpServers ?? [],
    });
  }

  async prompt(
    sessionId: SessionId,
    prompt: ContentBlock[]
  ): Promise<PromptResponse> {
    await this.ensureConnected();
    return this.transport!.request<PromptResponse>('session/prompt', {
      sessionId,
      prompt,
    });
  }

  cancel(sessionId: SessionId): void {
    if (!this.transport || this.transport.isClosed) {
      return;
    }
    this.transport.notify('session/cancel', { sessionId });
  }

  async setMode(sessionId: SessionId, modeId: SessionModeId): Promise<void> {
    await this.ensureConnected();
    await this.transport!.request('session/set_mode', { sessionId, modeId });
  }

  async setConfigOption(
    sessionId: SessionId,
    configId: string,
    value: string | boolean
  ): Promise<{ configOptions: SessionConfigOption[] }> {
    await this.ensureConnected();
    if (typeof value === 'boolean') {
      return this.transport!.request('session/set_config_option', {
        sessionId,
        configId,
        type: 'boolean',
        value,
      });
    }
    return this.transport!.request('session/set_config_option', {
      sessionId,
      configId,
      value,
    });
  }

  async closeSession(sessionId: SessionId): Promise<void> {
    if (!this.transport || this.transport.isClosed) {
      return;
    }
    if (this.agentCapabilities.sessionCapabilities?.close) {
      try {
        await this.transport.request('session/close', { sessionId });
      } catch (err) {
        this.log.warn('session/close failed', err);
      }
    }
  }

  // ─── Inbound ──────────────────────────────────────────────────────────────

  private async handleInboundRequest(req: JsonRpcRequest): Promise<void> {
    if (!this.transport) {
      return;
    }
    const id = req.id;
    try {
      let result: unknown;
      switch (req.method) {
        case 'fs/read_text_file':
          result = await this.handlers.readTextFile(req.params as never);
          break;
        case 'fs/write_text_file':
          result = await this.handlers.writeTextFile(req.params as never);
          break;
        case 'session/request_permission':
          result = await this.handlers.requestPermission(req.params as never);
          break;
        case 'terminal/create':
          result = await this.handlers.createTerminal(req.params as never);
          break;
        case 'terminal/output':
          result = await this.handlers.terminalOutput(req.params as never);
          break;
        case 'terminal/wait_for_exit':
          result = await this.handlers.waitForExit(req.params as never);
          break;
        case 'terminal/kill':
          result = await this.handlers.killTerminal(req.params as never);
          break;
        case 'terminal/release':
          result = await this.handlers.releaseTerminal(req.params as never);
          break;
        default:
          this.log.warn('Unknown agent→client method', req.method);
          this.transport.respondError(id, -32601, `Method not found: ${req.method}`);
          return;
      }
      this.transport.respond(id, result ?? {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(`Handler error for ${req.method}`, message);
      this.transport.respondError(id, -32000, message);
    }
  }

  private handleNotification(n: JsonRpcNotification): void {
    if (n.method === 'session/update') {
      const params = n.params as SessionNotification;
      this.emit('sessionUpdate', params);
      return;
    }
    this.log.debug('Unhandled notification', n.method);
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }
}

/**
 * Build CLI args for ACP.
 * Base: `grok agent [options…] stdio`
 * Options from extension settings are inserted after `agent`.
 *
 * Important: always pass `--no-leader` unless the user opted into leader mode.
 * Shared leader processes ignore per-spawn `-m` and stay on the default model.
 */
export function buildAgentArgs(cliArgs: string[], model?: string): string[] {
  const cfg = getConfig();
  // Start from configured base, ensure agent + stdio shape
  let args = cliArgs.length ? [...cliArgs] : ['agent', 'stdio'];
  if (!args.includes('agent')) {
    args = ['agent', ...args];
  }
  if (!args.includes('stdio')) {
    args.push('stdio');
  }

  const flags: string[] = [];
  const has = (flag: string) =>
    args.includes(flag) || flags.includes(flag);

  // Force isolated agent process so -m / flags apply (not a shared leader)
  if (!has('--leader') && !has('--no-leader')) {
    flags.push('--no-leader');
  }

  const m = (model ?? cfg.defaultModel)?.trim();
  if (m && !has('-m') && !has('--model')) {
    flags.push('-m', m);
  }
  if (cfg.reasoningEffort?.trim() && !has('--reasoning-effort') && !has('--effort')) {
    flags.push('--reasoning-effort', cfg.reasoningEffort.trim());
  }
  if (cfg.alwaysApprove && !has('--always-approve')) {
    flags.push('--always-approve');
  }
  // Map UI permissionMode → CLI when alwaysApprove not set
  if (!cfg.alwaysApprove && !has('--always-approve')) {
    if (cfg.cliPermissionMode && !has('--permission-mode')) {
      // only if agent accepts it; also map bypass via always-approve
      if (cfg.cliPermissionMode === 'bypassPermissions') {
        flags.push('--always-approve');
      } else {
        flags.push('--permission-mode', cfg.cliPermissionMode);
      }
    } else if (cfg.permissionMode === 'allow-always' && !has('--always-approve')) {
      flags.push('--always-approve');
    }
  }
  if (cfg.maxTurns != null && cfg.maxTurns > 0 && !has('--max-turns')) {
    flags.push('--max-turns', String(cfg.maxTurns));
  }
  if (cfg.noSubagents && !has('--no-subagents')) {
    flags.push('--no-subagents');
  }
  if (cfg.noPlan && !has('--no-plan')) {
    flags.push('--no-plan');
  }
  if (cfg.noMemory && !has('--no-memory')) {
    flags.push('--no-memory');
  }
  if (cfg.experimentalMemory && !has('--experimental-memory')) {
    flags.push('--experimental-memory');
  }
  if (cfg.disableWebSearch && !has('--disable-web-search')) {
    flags.push('--disable-web-search');
  }
  if (cfg.sandbox?.trim() && !has('--sandbox')) {
    flags.push('--sandbox', cfg.sandbox.trim());
  }
  if (cfg.tools?.trim() && !has('--tools')) {
    flags.push('--tools', cfg.tools.trim());
  }
  if (cfg.disallowedTools?.trim() && !has('--disallowed-tools')) {
    flags.push('--disallowed-tools', cfg.disallowedTools.trim());
  }
  if (cfg.rules?.trim() && !has('--rules')) {
    flags.push('--rules', cfg.rules.trim());
  }
  if (cfg.debug && !has('--debug')) {
    flags.push('--debug');
  }
  for (const extra of cfg.extraCliArgs ?? []) {
    if (extra && !args.includes(extra) && !flags.includes(extra)) {
      flags.push(extra);
    }
  }

  // Insert flags after `agent`, before `stdio`
  const agentIdx = args.findIndex((a) => a === 'agent');
  const insertAt = agentIdx >= 0 ? agentIdx + 1 : 0;
  args.splice(insertAt, 0, ...flags);
  return args;
}

export type { SessionUpdate, StopReason, SessionModeState, SessionConfigOption };
