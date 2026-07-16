import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { PendingEdit } from '../acp/types';
import { getLogger } from '../util/logger';

export interface QueueWriteParams {
  sessionId: string;
  path: string;
  oldText: string;
  newText: string;
  toolCallId?: string;
}

/**
 * Tracks file edits for UI (diff / history).
 * Writes are applied immediately by default so the ACP agent is not blocked.
 */
export class EditController extends EventEmitter {
  private pending = new Map<string, PendingEdit>();
  private applyAlways = true; // default: apply without blocking the agent
  private seq = 0;
  private readonly log = getLogger();
  private applyWriteImpl?: (filePath: string, content: string) => Promise<void>;

  setApplyWrite(fn: (filePath: string, content: string) => Promise<void>): void {
    this.applyWriteImpl = fn;
  }

  get applyAlwaysEnabled(): boolean {
    return this.applyAlways;
  }

  setApplyAlways(value: boolean): void {
    this.applyAlways = value;
    this.emit('applyAlwaysChanged', value);
  }

  listPending(sessionId?: string): PendingEdit[] {
    const all = [...this.pending.values()].filter((e) => e.status === 'pending');
    return sessionId ? all.filter((e) => e.sessionId === sessionId) : all;
  }

  listRecent(sessionId?: string, limit = 20): PendingEdit[] {
    let all = [...this.pending.values()].sort(
      (a, b) => b.id.localeCompare(a.id)
    );
    if (sessionId) {
      all = all.filter((e) => e.sessionId === sessionId);
    }
    return all.slice(0, limit);
  }

  /**
   * Apply write immediately and track it. Never blocks waiting for UI.
   * Optional toast offers "Show Diff" after the fact.
   */
  async writeAndTrack(params: QueueWriteParams): Promise<PendingEdit> {
    const id = `edit_${++this.seq}_${Date.now()}`;
    const edit: PendingEdit = {
      id,
      path: params.path,
      oldText: params.oldText,
      newText: params.newText,
      toolCallId: params.toolCallId,
      sessionId: params.sessionId,
      status: 'pending',
    };
    this.pending.set(id, edit);
    this.emit('queued', edit);

    if (!this.applyWriteImpl) {
      throw new Error('EditController: applyWrite not configured');
    }

    try {
      await this.applyWriteImpl(params.path, params.newText);
      edit.status = 'applied';
      this.emit('applied', edit);
      this.log.info('Applied write', params.path);

      const fileName = path.basename(params.path);
      // Non-blocking toast — never await user choice for agent progress
      void vscode.window
        .showInformationMessage(
          `Grok wrote ${fileName}`,
          'Show Diff',
          'Open File'
        )
        .then(async (choice) => {
          if (choice === 'Show Diff') {
            await this.showDiff(id);
          } else if (choice === 'Open File') {
            const doc = await vscode.workspace.openTextDocument(params.path);
            await vscode.window.showTextDocument(doc, { preview: true });
          }
        });
    } catch (err) {
      edit.status = 'rejected';
      this.emit('rejected', edit);
      throw err;
    }

    return edit;
  }

  /** @deprecated Prefer writeAndTrack — kept for manual queue/apply UX */
  async queueWrite(params: QueueWriteParams): Promise<PendingEdit> {
    // Non-blocking path: always write immediately (fixes hung agent turns)
    return this.writeAndTrack(params);
  }

  async showDiff(editId: string): Promise<void> {
    const edit = this.pending.get(editId);
    if (!edit) {
      return;
    }

    const left = vscode.Uri.parse(
      `grok-build-diff:left/${encodeURIComponent(edit.path)}?id=${editId}`
    );
    const right = vscode.Uri.parse(
      `grok-build-diff:right/${encodeURIComponent(edit.path)}?id=${editId}`
    );

    this.emit('needDiffContent', edit);
    const title = `${path.basename(edit.path)} (Grok Build)`;
    await vscode.commands.executeCommand('vscode.diff', left, right, title);
  }

  getEdit(editId: string): PendingEdit | undefined {
    return this.pending.get(editId);
  }

  async apply(editId: string): Promise<void> {
    const edit = this.pending.get(editId);
    if (!edit || edit.status !== 'pending') {
      return;
    }
    if (!this.applyWriteImpl) {
      throw new Error('EditController: applyWrite not configured');
    }
    await this.applyWriteImpl(edit.path, edit.newText);
    edit.status = 'applied';
    this.emit('applied', edit);
    this.log.info('Applied edit', edit.path);
  }

  async reject(editId: string): Promise<void> {
    const edit = this.pending.get(editId);
    if (!edit || edit.status !== 'pending') {
      return;
    }
    edit.status = 'rejected';
    this.emit('rejected', edit);
    this.log.info('Rejected edit', edit.path);
  }

  async applyAll(sessionId?: string): Promise<number> {
    const list = this.listPending(sessionId);
    for (const e of list) {
      await this.apply(e.id);
    }
    return list.length;
  }

  async rejectAll(sessionId?: string): Promise<number> {
    const list = this.listPending(sessionId);
    for (const e of list) {
      await this.reject(e.id);
    }
    return list.length;
  }

  clearSession(sessionId: string): void {
    for (const [id, e] of this.pending) {
      if (e.sessionId === sessionId) {
        this.pending.delete(id);
      }
    }
  }
}

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly edits: EditController) {}

  provideTextDocumentContent(uri: vscode.Uri): string {
    const id = new URLSearchParams(uri.query).get('id') ?? '';
    const edit = this.edits.getEdit(id);
    if (!edit) {
      return '';
    }
    const isLeft =
      uri.path.includes('left/') ||
      uri.authority === 'left' ||
      uri.path.startsWith('/left');
    return isLeft ? edit.oldText : edit.newText;
  }

  refresh(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }
}
