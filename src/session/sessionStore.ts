import * as vscode from 'vscode';
import type {
  AgentMode,
  ChatMessage,
  ChatPlan,
  ChatToolCall,
  UsageInfo,
} from '../acp/types';
import { getConfig } from '../util/config';
import { getLogger } from '../util/logger';

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
}

export interface StoredSession extends StoredSessionMeta {
  messages: ChatMessage[];
  toolCalls: ChatToolCall[];
  plan?: ChatPlan;
  usage?: UsageInfo;
}

const INDEX_KEY = 'grokBuild.sessionIndex';
const sessionKey = (localId: string) => `grokBuild.session.${localId}`;

/**
 * Persists session metadata + chat history in extension globalState.
 */
export class SessionStore {
  private readonly log = getLogger();

  constructor(private readonly state: vscode.Memento) {}

  listMeta(): StoredSessionMeta[] {
    const index = this.state.get<StoredSessionMeta[]>(INDEX_KEY, []);
    return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(localId: string): StoredSession | undefined {
    return this.state.get<StoredSession>(sessionKey(localId));
  }

  async save(session: StoredSession): Promise<void> {
    const limit = getConfig().sessionHistoryLimit;
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
    };

    // Cap message history for storage size
    const toStore: StoredSession = {
      ...session,
      messages: session.messages.slice(-200),
      toolCalls: session.toolCalls.slice(-100),
    };

    await this.state.update(sessionKey(localId(session.localId)), toStore);

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
    this.log.debug('Saved session', session.localId);
  }

  async remove(localId: string): Promise<void> {
    await this.state.update(sessionKey(localId), undefined);
    const index = this.listMeta().filter((m) => m.localId !== localId);
    await this.state.update(INDEX_KEY, index);
  }

  async clearAll(): Promise<void> {
    const index = this.listMeta();
    for (const m of index) {
      await this.state.update(sessionKey(m.localId), undefined);
    }
    await this.state.update(INDEX_KEY, []);
  }
}

function localId(id: string): string {
  return id;
}
