import * as vscode from 'vscode';
import type {
  AgentMode,
  ChatMessage,
  ChatPlan,
  ChatToolCall,
  UsageInfo,
} from '../acp/types';
import { getConfig } from '../util/config';
import { normalizeCwdKey, sameCwd } from '../util/cwd';
import { getLogger } from '../util/logger';

export { normalizeCwdKey, sameCwd } from '../util/cwd';

export interface StoredSessionMeta {
  localId: string;
  agentSessionId?: string;
  title: string;
  mode: AgentMode;
  model?: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  /** Short preview of the first user message (for history UI) */
  preview?: string;
}

export interface StoredSession extends StoredSessionMeta {
  messages: ChatMessage[];
  toolCalls: ChatToolCall[];
  plan?: ChatPlan;
  usage?: UsageInfo;
}

const INDEX_KEY = 'grokBuild.sessionIndex';
const LAST_ACTIVE_KEY = 'grokBuild.lastActiveByCwd';
const sessionKey = (localId: string) => `grokBuild.session.${localId}`;

/**
 * Persists session metadata + chat history in extension globalState.
 * History is global, but filtered/restored per workspace folder (cwd).
 */
export class SessionStore {
  private readonly log = getLogger();

  constructor(private readonly state: vscode.Memento) {}

  listMeta(): StoredSessionMeta[] {
    const index = this.state.get<StoredSessionMeta[]>(INDEX_KEY, []);
    return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Sessions that belong to this workspace folder (Claude Code–style project history). */
  listMetaForCwd(cwd: string): StoredSessionMeta[] {
    return this.listMeta().filter((m) => sameCwd(m.cwd, cwd));
  }

  get(localId: string): StoredSession | undefined {
    return this.state.get<StoredSession>(sessionKey(localId));
  }

  getLastActiveLocalId(cwd: string): string | undefined {
    const map = this.state.get<Record<string, string>>(LAST_ACTIVE_KEY, {});
    return map[normalizeCwdKey(cwd)];
  }

  async setLastActiveLocalId(cwd: string, localId: string): Promise<void> {
    const map = {
      ...this.state.get<Record<string, string>>(LAST_ACTIVE_KEY, {}),
    };
    map[normalizeCwdKey(cwd)] = localId;
    await this.state.update(LAST_ACTIVE_KEY, map);
  }

  /**
   * Best session to reopen for this folder: last active with messages, else newest with messages.
   */
  findResumeTarget(cwd: string): StoredSession | undefined {
    const lastId = this.getLastActiveLocalId(cwd);
    if (lastId) {
      const last = this.get(lastId);
      if (last && sameCwd(last.cwd, cwd) && (last.messages?.length ?? 0) > 0) {
        return last;
      }
    }
    for (const meta of this.listMetaForCwd(cwd)) {
      if (meta.messageCount <= 0) {
        continue;
      }
      const full = this.get(meta.localId);
      if (full && (full.messages?.length ?? 0) > 0) {
        return full;
      }
    }
    return undefined;
  }

  async save(session: StoredSession): Promise<void> {
    const limit = getConfig().sessionHistoryLimit;
    const preview = extractPreview(session.messages);
    const meta: StoredSessionMeta = {
      localId: session.localId,
      agentSessionId: session.agentSessionId,
      title: session.title,
      mode: session.mode,
      model: session.model,
      cwd: session.cwd,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
      preview,
    };

    // Cap message history for storage size
    const toStore: StoredSession = {
      ...session,
      preview,
      messages: session.messages.slice(-200),
      toolCalls: session.toolCalls.slice(-100),
    };

    await this.state.update(sessionKey(session.localId), toStore);

    let index = this.listMeta().filter((m) => m.localId !== session.localId);
    index.unshift(meta);
    if (index.length > limit) {
      const removed = index.slice(limit);
      index = index.slice(0, limit);
      for (const r of removed) {
        await this.state.update(sessionKey(r.localId), undefined);
      }
    }
    await this.state.update(INDEX_KEY, index);
    await this.setLastActiveLocalId(session.cwd, session.localId);
    this.log.debug('Saved session', session.localId, 'msgs=', session.messages.length);
  }

  async remove(localId: string): Promise<void> {
    await this.state.update(sessionKey(localId), undefined);
    const index = this.listMeta().filter((m) => m.localId !== localId);
    await this.state.update(INDEX_KEY, index);
  }

  /** Clear history for one workspace, or all if cwd omitted. */
  async clearForCwd(cwd?: string): Promise<number> {
    if (!cwd) {
      await this.clearAll();
      return -1;
    }
    const toRemove = this.listMetaForCwd(cwd);
    for (const m of toRemove) {
      await this.state.update(sessionKey(m.localId), undefined);
    }
    const index = this.listMeta().filter((m) => !sameCwd(m.cwd, cwd));
    await this.state.update(INDEX_KEY, index);
    const map = {
      ...this.state.get<Record<string, string>>(LAST_ACTIVE_KEY, {}),
    };
    delete map[normalizeCwdKey(cwd)];
    await this.state.update(LAST_ACTIVE_KEY, map);
    return toRemove.length;
  }

  async clearAll(): Promise<void> {
    const index = this.listMeta();
    for (const m of index) {
      await this.state.update(sessionKey(m.localId), undefined);
    }
    await this.state.update(INDEX_KEY, []);
    await this.state.update(LAST_ACTIVE_KEY, {});
  }
}

function extractPreview(messages: ChatMessage[]): string | undefined {
  const user = messages.find((m) => m.role === 'user' && m.content?.trim());
  if (!user?.content) {
    return undefined;
  }
  const oneLine = user.content.replace(/\s+/g, ' ').trim();
  return oneLine.length > 100 ? oneLine.slice(0, 99) + '…' : oneLine;
}
