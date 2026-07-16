import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { SessionStore, sameCwd } from '../../session/sessionStore';
import type { StoredSession } from '../../session/sessionStore';

/** Minimal Memento for isolation inside Extension Host */
class MemoryMemento implements vscode.Memento {
  private readonly map = new Map<string, unknown>();

  keys(): readonly string[] {
    return [...this.map.keys()];
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.map.has(key)) {
      return this.map.get(key) as T;
    }
    return defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.map.delete(key);
    } else {
      this.map.set(key, value);
    }
  }
}

function sampleSession(
  overrides: Partial<StoredSession> & Pick<StoredSession, 'localId' | 'cwd'>
): StoredSession {
  const now = Date.now();
  return {
    localId: overrides.localId,
    title: overrides.title ?? 'Test chat',
    mode: overrides.mode ?? 'execute',
    cwd: overrides.cwd,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    messageCount: overrides.messages?.length ?? overrides.messageCount ?? 0,
    messages: overrides.messages ?? [],
    toolCalls: overrides.toolCalls ?? [],
    agentSessionId: overrides.agentSessionId,
    model: overrides.model,
    plan: overrides.plan,
    usage: overrides.usage,
    preview: overrides.preview,
  };
}

suite('SessionStore (integration / memento)', () => {
  test('sameCwd works for workspace path forms', () => {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
      // skip soft if no folder
      return;
    }
    assert.equal(sameCwd(folder, folder), true);
  });

  test('save + get roundtrip preserves messages', async () => {
    const store = new SessionStore(new MemoryMemento());
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'D:\\tmp\\sandbox';
    const session = sampleSession({
      localId: 'local_test_1',
      cwd,
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'Hallo Sandbox',
          timestamp: Date.now(),
        },
        {
          id: 'a1',
          role: 'agent',
          content: 'Hi',
          timestamp: Date.now(),
        },
      ],
    });

    await store.save(session);
    const loaded = store.get('local_test_1');
    assert.ok(loaded);
    assert.equal(loaded!.messages.length, 2);
    assert.equal(loaded!.messages[0].content, 'Hallo Sandbox');
    assert.equal(loaded!.title, 'Test chat');
    assert.ok(loaded!.preview?.includes('Hallo'));
  });

  test('listMetaForCwd filters other projects', async () => {
    const store = new SessionStore(new MemoryMemento());
    await store.save(
      sampleSession({
        localId: 'a',
        cwd: 'D:\\proj\\alpha',
        messages: [
          { id: '1', role: 'user', content: 'A', timestamp: 1 },
        ],
      })
    );
    await store.save(
      sampleSession({
        localId: 'b',
        cwd: 'D:\\proj\\beta',
        messages: [
          { id: '2', role: 'user', content: 'B', timestamp: 2 },
        ],
      })
    );

    const alpha = store.listMetaForCwd('D:/proj/alpha');
    assert.equal(alpha.length, 1);
    assert.equal(alpha[0].localId, 'a');

    const beta = store.listMetaForCwd('d:\\proj\\beta');
    assert.equal(beta.length, 1);
    assert.equal(beta[0].localId, 'b');
  });

  test('findResumeTarget prefers last active with messages', async () => {
    const store = new SessionStore(new MemoryMemento());
    const cwd = 'D:\\proj\\resume-test';
    await store.save(
      sampleSession({
        localId: 'old',
        cwd,
        updatedAt: 100,
        messages: [
          { id: '1', role: 'user', content: 'old', timestamp: 100 },
        ],
      })
    );
    await store.save(
      sampleSession({
        localId: 'new',
        cwd,
        updatedAt: 200,
        messages: [
          { id: '2', role: 'user', content: 'new', timestamp: 200 },
        ],
      })
    );
    await store.setLastActiveLocalId(cwd, 'old');

    const target = store.findResumeTarget(cwd);
    assert.ok(target);
    assert.equal(target!.localId, 'old');
  });

  test('clearForCwd removes only that project', async () => {
    const store = new SessionStore(new MemoryMemento());
    await store.save(
      sampleSession({
        localId: 'keep',
        cwd: 'D:\\keep',
        messages: [{ id: '1', role: 'user', content: 'k', timestamp: 1 }],
      })
    );
    await store.save(
      sampleSession({
        localId: 'drop',
        cwd: 'D:\\drop',
        messages: [{ id: '2', role: 'user', content: 'd', timestamp: 2 }],
      })
    );

    const n = await store.clearForCwd('D:\\drop');
    assert.equal(n, 1);
    assert.ok(store.get('keep'));
    assert.equal(store.get('drop'), undefined);
  });
});
