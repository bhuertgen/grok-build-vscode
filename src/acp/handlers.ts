import * as fs from 'node:fs/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as vscode from 'vscode';
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  KillTerminalRequest,
  PermissionOption,
  ReadTextFileRequest,
  ReadTextFileResponse,
  ReleaseTerminalRequest,
  RequestPermissionRequest,
  RequestPermissionResponse,
  TerminalId,
  TerminalOutputRequest,
  TerminalOutputResponse,
  ToolCallUpdate,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  WriteTextFileRequest,
} from './types';
import { getConfig } from '../util/config';
import { getLogger } from '../util/logger';
import { applyTextWrite } from '../util/fileWriter';
import type { EditController } from '../edits/editController';

interface ManagedTerminal {
  id: TerminalId;
  proc: ChildProcessWithoutNullStreams;
  output: string;
  truncated: boolean;
  exitCode?: number | null;
  signal?: string | null;
  exited: boolean;
  waiters: Array<(status: { exitCode?: number | null; signal?: string | null }) => void>;
  outputByteLimit: number;
}

/**
 * Handles agent→client ACP methods: filesystem, terminal, permissions.
 */
export class ClientHandlers {
  private readonly log = getLogger();
  private terminals = new Map<TerminalId, ManagedTerminal>();
  private terminalSeq = 0;
  /** Session-scoped allow-always option ids */
  private sessionAllowAlways = new Set<string>();
  /** Global allow-always (apply always) for write paths */
  private globalAllowAlways = false;

  constructor(
    private readonly editController: EditController,
    private readonly onPermissionUi?: (
      sessionId: string,
      toolCall: ToolCallUpdate,
      options: PermissionOption[]
    ) => Promise<RequestPermissionResponse>
  ) {}

  resetSessionPermissions(): void {
    this.sessionAllowAlways.clear();
  }

  setGlobalAllowAlways(value: boolean): void {
    this.globalAllowAlways = value;
  }

  // ─── fs/read_text_file ────────────────────────────────────────────────────

  async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    const filePath = params.path;
    this.log.debug('fs/read_text_file', filePath);

    // Prefer unsaved editor buffer when open
    const uri = vscode.Uri.file(filePath);
    const openDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.fsPath === uri.fsPath
    );
    let text: string;
    if (openDoc) {
      text = openDoc.getText();
    } else {
      text = await fs.readFile(filePath, 'utf8');
    }

    if (params.line != null || params.limit != null) {
      const lines = text.split(/\r?\n/);
      const start = Math.max(0, (params.line ?? 1) - 1);
      const end =
        params.limit != null ? start + params.limit : lines.length;
      text = lines.slice(start, end).join('\n');
    }

    return { content: text };
  }

  // ─── fs/write_text_file ───────────────────────────────────────────────────

  async writeTextFile(params: WriteTextFileRequest): Promise<Record<string, never>> {
    const filePath = params.path;
    this.log.info('fs/write_text_file', filePath);

    let oldText = '';
    try {
      const uri = vscode.Uri.file(filePath);
      const openDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.fsPath === uri.fsPath
      );
      if (openDoc) {
        oldText = openDoc.getText();
      } else {
        oldText = await fs.readFile(filePath, 'utf8');
      }
    } catch {
      oldText = '';
    }

    const cfg = getConfig();
    if (cfg.showDiffBeforeApply && !this.globalAllowAlways) {
      // Queue as pending edit — EditController may auto-apply or wait
      await this.editController.queueWrite({
        sessionId: params.sessionId,
        path: filePath,
        oldText,
        newText: params.content,
      });
    } else {
      await this.applyWrite(filePath, params.content);
    }

    return {};
  }

  async applyWrite(filePath: string, content: string): Promise<void> {
    await applyTextWrite(filePath, content);
  }

  // ─── session/request_permission ───────────────────────────────────────────

  async requestPermission(
    params: RequestPermissionRequest
  ): Promise<RequestPermissionResponse> {
    const cfg = getConfig();
    this.log.info('session/request_permission', params.toolCall?.title, params.toolCall?.kind);

    if (this.globalAllowAlways || cfg.permissionMode === 'allow-always') {
      const allow = params.options.find(
        (o) => o.kind === 'allow_once' || o.kind === 'allow_always'
      );
      if (allow) {
        return { outcome: { outcome: 'selected', optionId: allow.optionId } };
      }
    }

    if (cfg.permissionMode === 'allow-session' || cfg.permissionMode === 'allow-once') {
      const allow = params.options.find((o) => o.kind === 'allow_once');
      if (allow) {
        return { outcome: { outcome: 'selected', optionId: allow.optionId } };
      }
    }

    // Check session allow-always keys
    const key = this.permissionKey(params.toolCall);
    if (this.sessionAllowAlways.has(key)) {
      const allow = params.options.find(
        (o) => o.kind === 'allow_once' || o.kind === 'allow_always'
      );
      if (allow) {
        return { outcome: { outcome: 'selected', optionId: allow.optionId } };
      }
    }

    if (this.onPermissionUi) {
      const result = await this.onPermissionUi(
        params.sessionId,
        params.toolCall,
        params.options
      );
      if (result.outcome.outcome === 'selected') {
        const optionId = result.outcome.optionId;
        const selected = params.options.find((o) => o.optionId === optionId);
        if (selected?.kind === 'allow_always') {
          this.sessionAllowAlways.add(key);
        }
      }
      return result;
    }

    // Fallback: QuickPick in VS Code UI
    return this.permissionQuickPick(params);
  }

  private permissionKey(toolCall: ToolCallUpdate): string {
    return `${toolCall.kind ?? 'other'}:${toolCall.title ?? toolCall.toolCallId}`;
  }

  private async permissionQuickPick(
    params: RequestPermissionRequest
  ): Promise<RequestPermissionResponse> {
    type Item = vscode.QuickPickItem & { optionId: string };
    const items: Item[] = params.options.map((o) => ({
      label: o.name,
      description: o.kind,
      optionId: o.optionId,
    }));

    const title =
      params.toolCall.title ??
      params.toolCall.kind ??
      'Agent requests permission';

    const picked = await vscode.window.showQuickPick(items, {
      title: `Grok Build: ${title}`,
      placeHolder: 'Allow or reject this tool action',
      ignoreFocusOut: true,
    });

    if (!picked) {
      return { outcome: { outcome: 'cancelled' } };
    }

    if (picked.description === 'allow_always') {
      this.sessionAllowAlways.add(this.permissionKey(params.toolCall));
    }

    return {
      outcome: { outcome: 'selected', optionId: picked.optionId },
    };
  }

  // ─── terminal/* ───────────────────────────────────────────────────────────

  async createTerminal(
    params: CreateTerminalRequest
  ): Promise<CreateTerminalResponse> {
    const cfg = getConfig();
    if (!cfg.enableTerminal) {
      throw new Error('Terminal execution is disabled in Grok Build settings');
    }

    const id = `term_${++this.terminalSeq}_${Date.now()}`;
    const cwd = params.cwd ?? undefined;
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const e of params.env ?? []) {
      env[e.name] = e.value;
    }

    const args = params.args ?? [];
    this.log.info('terminal/create', params.command, args.join(' '));

    const isWin = process.platform === 'win32';
    const proc = isWin
      ? spawn(params.command, args, {
          cwd,
          env,
          shell: true,
          windowsHide: true,
        })
      : spawn(params.command, args, { cwd, env });

    const limit = params.outputByteLimit ?? 1_000_000;
    const managed: ManagedTerminal = {
      id,
      proc: proc as ChildProcessWithoutNullStreams,
      output: '',
      truncated: false,
      exited: false,
      waiters: [],
      outputByteLimit: limit,
    };

    const append = (chunk: Buffer | string) => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      managed.output += s;
      if (Buffer.byteLength(managed.output, 'utf8') > managed.outputByteLimit) {
        // Truncate from the start at a character boundary
        let bytes = Buffer.byteLength(managed.output, 'utf8');
        while (bytes > managed.outputByteLimit && managed.output.length > 0) {
          managed.output = managed.output.slice(Math.floor(managed.output.length / 4));
          bytes = Buffer.byteLength(managed.output, 'utf8');
        }
        managed.truncated = true;
      }
    };

    proc.stdout?.on('data', append);
    proc.stderr?.on('data', append);
    proc.on('close', (code, signal) => {
      managed.exited = true;
      managed.exitCode = code;
      managed.signal = signal;
      for (const w of managed.waiters) {
        w({ exitCode: code, signal });
      }
      managed.waiters = [];
    });
    proc.on('error', (err) => {
      managed.output += `\n[process error] ${err.message}`;
      managed.exited = true;
      managed.exitCode = 1;
      for (const w of managed.waiters) {
        w({ exitCode: 1, signal: null });
      }
      managed.waiters = [];
    });

    this.terminals.set(id, managed);
    return { terminalId: id };
  }

  async terminalOutput(
    params: TerminalOutputRequest
  ): Promise<TerminalOutputResponse> {
    const t = this.terminals.get(params.terminalId);
    if (!t) {
      throw new Error(`Unknown terminal: ${params.terminalId}`);
    }
    return {
      output: t.output,
      truncated: t.truncated,
      exitStatus: t.exited
        ? { exitCode: t.exitCode ?? null, signal: t.signal ?? null }
        : null,
    };
  }

  async waitForExit(
    params: WaitForTerminalExitRequest
  ): Promise<WaitForTerminalExitResponse> {
    const t = this.terminals.get(params.terminalId);
    if (!t) {
      throw new Error(`Unknown terminal: ${params.terminalId}`);
    }
    if (t.exited) {
      return { exitCode: t.exitCode ?? null, signal: t.signal ?? null };
    }
    return new Promise((resolve) => {
      t.waiters.push((status) => {
        resolve({
          exitCode: status.exitCode ?? null,
          signal: status.signal ?? null,
        });
      });
    });
  }

  async killTerminal(params: KillTerminalRequest): Promise<Record<string, never>> {
    const t = this.terminals.get(params.terminalId);
    if (t && !t.exited) {
      try {
        t.proc.kill();
      } catch {
        /* ignore */
      }
    }
    return {};
  }

  async releaseTerminal(
    params: ReleaseTerminalRequest
  ): Promise<Record<string, never>> {
    const t = this.terminals.get(params.terminalId);
    if (t) {
      if (!t.exited) {
        try {
          t.proc.kill();
        } catch {
          /* ignore */
        }
      }
      this.terminals.delete(params.terminalId);
    }
    return {};
  }

  dispose(): void {
    for (const t of this.terminals.values()) {
      try {
        if (!t.exited) {
          t.proc.kill();
        }
      } catch {
        /* ignore */
      }
    }
    this.terminals.clear();
  }
}
