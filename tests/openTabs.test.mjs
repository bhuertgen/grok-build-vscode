import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { planRestore, openTabsRecord, isChatActivityUpdate } = require('../dist-test/openTabs.js');

class Memento {
  constructor() { this.m = new Map(); }
  get(k, d) { return this.m.has(k) ? this.m.get(k) : d; }
  async update(k, v) { if (v === undefined) this.m.delete(k); else this.m.set(k, v); await new Promise((r) => setTimeout(r, Math.random() * 3)); }
}
const sess = (localId, cwd = '/ws', n = 1) => ({
  localId, title: localId, mode: 'execute', cwd, createdAt: 1, updatedAt: 1, messageCount: n,
  messages: Array.from({ length: n }, (_, i) => ({ id: `${localId}-${i}`, role: 'user', content: 'hi', timestamp: 1 })),
  toolCalls: [],
});

describe('open tabs restore plan (#51)', () => {
  const all = new Set(['a', 'b', 'c']);
  const exists = (id) => all.has(id);

  it('reopens every saved tab and the saved active one', () => {
    assert.deepEqual(planRestore({ ids: ['a', 'b'], active: 'b', updatedAt: 1 }, exists, 'a'), { ids: ['a', 'b'], active: 'b' });
    assert.deepEqual(planRestore({ ids: ['a', 'b', 'c'], active: 'a', updatedAt: 1 }, exists), { ids: ['a', 'b', 'c'], active: 'a' });
  });
  it('drops missing / duplicate ids and repairs the active id', () => {
    assert.deepEqual(planRestore({ ids: ['a', 'x', 'a', 'c'], active: 'x', updatedAt: 1 }, exists), { ids: ['a', 'c'], active: 'c' });
  });
  it('falls back to the single resume target without a usable list', () => {
    assert.deepEqual(planRestore(undefined, exists, 'b'), { ids: ['b'], active: 'b' });
    assert.deepEqual(planRestore({ ids: ['x'], updatedAt: 1 }, exists, 'c'), { ids: ['c'], active: 'c' });
    assert.deepEqual(planRestore(undefined, exists, undefined), { ids: [] });
    assert.deepEqual(planRestore(undefined, exists, 'x'), { ids: [] });
  });
  it('openTabsRecord keeps order, dedupes, validates active', () => {
    assert.deepEqual(openTabsRecord(['a', 'b', 'a'], 'b', 5), { ids: ['a', 'b'], active: 'b', updatedAt: 5 });
    assert.deepEqual(openTabsRecord(['a', 'b'], 'zz', 5), { ids: ['a', 'b'], active: 'b', updatedAt: 5 });
    assert.deepEqual(openTabsRecord([], null, 5), { ids: [], active: undefined, updatedAt: 5 });
  });
});

describe('SessionStore persistence (#51)', () => {
  const { SessionStore } = require('../dist-test/sessionStore.js');

  it('open tabs round-trip per folder (Windows-style keys normalised)', async () => {
    const st = new SessionStore(new Memento());
    await st.setOpenTabs('/ws', openTabsRecord(['a', 'b'], 'b', 1));
    await st.setOpenTabs('/other', openTabsRecord(['c'], 'c', 1));
    assert.deepEqual(st.getOpenTabs('/ws').ids, ['a', 'b']);
    assert.equal(st.getOpenTabs('/ws').active, 'b');
    assert.deepEqual(st.getOpenTabs('/other').ids, ['c']);
    await st.clearForCwd('/ws');
    assert.equal(st.getOpenTabs('/ws'), undefined);
    assert.deepEqual(st.getOpenTabs('/other').ids, ['c']);
  });

  it('parallel saves of different sessions keep every index entry', async () => {
    const st = new SessionStore(new Memento());
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => st.save(sess(id))));
    assert.deepEqual(st.listMetaForCwd('/ws').map((m) => m.localId).sort(), ['a', 'b', 'c', 'd', 'e']);
    for (const id of ['a', 'b', 'c', 'd', 'e']) assert.ok(st.get(id), id);
  });

  it('a background save does not steal the last-active tab', async () => {
    const st = new SessionStore(new Memento());
    await st.save(sess('a'));
    await st.setLastActiveLocalId('/ws', 'a');
    await st.save(sess('b'));
    assert.equal(st.getLastActiveLocalId('/ws'), 'a');
    assert.equal(st.findResumeTarget('/ws').localId, 'a');
  });

  it('empty (new) sessions are stored too, so their tab can be restored', async () => {
    const st = new SessionStore(new Memento());
    await st.save(sess('empty', '/ws', 0));
    assert.ok(st.get('empty'));
    const plan = planRestore(openTabsRecord(['empty'], 'empty', 1), (id) => !!st.get(id));
    assert.deepEqual(plan, { ids: ['empty'], active: 'empty' });
  });
});

describe('SessionManager wiring (#51)', () => {
  const src = fs.readFileSync(new URL('../src/session/sessionManager.ts', import.meta.url), 'utf8');
  it('bootstrap restores the whole tab plan, not one resume target', () => {
    assert.match(src, /planRestore\(\s*this\.store\.getOpenTabs\(cwd\)/);
    assert.match(src, /plan\.ids\.map\(/);
  });
  it('tabs are persisted on create, open, activate and close', () => {
    const count = (src.match(/this\.persistOpenTabs\(\);/g) || []).length;
    assert.ok(count >= 5, `persistOpenTabs calls: ${count}`);
  });
  it('one debounce timer per session, eager persist at prompt start and turn end', () => {
    assert.match(src, /persistTimers = new Map/);
    assert.ok(!/private persistTimer:/.test(src));
    assert.match(src, /Eager: the prompt and the new title survive/);
    assert.match(src, /isBusy', false\);\s*void this\.persistNow\(state\);/);
  });
});

describe('tab order stays stable across restore (#51)', () => {
  it('only chat activity bumps updatedAt', () => {
    for (const k of ['agent_message_chunk', 'agent_thought_chunk', 'user_message_chunk', 'tool_call', 'tool_call_update', 'plan']) {
      assert.equal(isChatActivityUpdate(k), true, k);
    }
    for (const k of ['available_commands_update', 'current_mode_update', 'config_option_update', 'session_info_update', 'model_changed', undefined]) {
      assert.equal(isChatActivityUpdate(k), false, String(k));
    }
  });
});
