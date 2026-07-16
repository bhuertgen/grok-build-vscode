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
 * Manages pending file edits with native VS Code diff preview
 * and Apply / Reject / Apply All / Apply Always semantics.
 */
export class EditController extends EventEmitter {
  private pending = new Map<string, PendingEdit>();
  private applyAlways = false;
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

  async queueWrite(params: QueueWriteParams): Promise<PendingEdit> {
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
    this.log.info('Queued edit', params.path);

    if (this.applyAlways) {
      await this.apply(id);
      return edit;
    }

    // Non-blocking: show notification with actions
    const fileName = path.basename(params.path);
    const choice = await vscode.window.showInformationMessage(
      `Grok Build proposes changes to ${fileName}`,
      'Show Diff',
      'Apply',
      'Apply All',
      'Apply Always',
      'Reject'
    );

    switch (choice) {
      case 'Show Diff':
        await this.showDiff(id);
        break;
      case 'Apply':
        await this.apply(id);
        break;
      case 'Apply All':
        await this.applyAll(params.sessionId);
        break;
      case 'Apply Always':
        this.setApplyAlways(true);
        await this.applyAll(params.sessionId);
        break;
      case 'Reject':
        await this.reject(id);
        break;
      default:
        // left pending — user can act via commands / webview
        break;
    }

    return edit;
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

    // Use virtual documents via a content provider registered by extension
    this.emit('needDiffContent', edit);

    const title = `${path.basename(edit.path)} (Grok Build)`;
    await vscode.commands.executeCommand('vscode.diff', left, right, title);
  }

  getEdit(editId: string): PendingEdit | undefined {
    return this.pending.get(editId);
  }

  getEditByPathQuery(queryId: string): PendingEdit | undefined {
    return this.pending.get(queryId);
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

/**
 * Virtual document provider for left/right sides of the Grok Build diff.
 */
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
    // URI form: grok-build-diff:left/<path>?id=… or …:right/…
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
