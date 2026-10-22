import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pushNotice, noticeKind } = require('../dist-test/restoreNotices.js');
const { planModeTooOldHint } = require('../dist-test/initialMode.js');

const RESUMED = '**Session resumed** — the agent has the previous conversation.';
const LOCAL = '**Local history loaded** — no agent session to resume. The agent starts cold. Optionally load history into context.';
const sys = (content) => ({ role: 'system', content });

describe('noticeKind', () => {
  it('recognises restore notices and the plan-mode hint', () => {
    assert.equal(noticeKind(RESUMED), 'session-resumed');
    assert.equal(noticeKind(LOCAL), 'local-history');
    assert.equal(noticeKind(planModeTooOldHint('1.0.62')), 'plan-hint');
    assert.equal(noticeKind('**Folder trusted for Grok** — agent restarted'), 'folder-trust');
    assert.equal(noticeKind('Model already **grok-4.7**.'), undefined);
    assert.equal(noticeKind(undefined), undefined);
  });
});

describe('pushNotice (#52)', () => {
  it('restoring the same chat N times leaves one notice of each kind', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'agent', content: 'hello' },
    ];
    for (let i = 0; i < 3; i++) {
      // openStored(): applyCliStartMode() hint, then "Session resumed"
      pushNotice(messages, sys(planModeTooOldHint('1.0.62')));
      pushNotice(messages, sys(RESUMED));
    }
    assert.equal(messages.length, 4);
    assert.equal(messages.filter((m) => noticeKind(m.content) === 'plan-hint').length, 1);
    assert.equal(messages.filter((m) => noticeKind(m.content) === 'session-resumed').length, 1);
    assert.equal(messages[3].content, RESUMED);
  });

  it('cleans up transcripts that already contain stacked copies', () => {
    const messages = [{ role: 'user', content: 'hi' }, sys(RESUMED), sys(RESUMED), sys(RESUMED)];
    pushNotice(messages, sys(RESUMED));
    assert.deepEqual(messages.map((m) => m.content), ['hi', RESUMED]);
  });

  it('keeps notices that belong to earlier parts of the conversation', () => {
    const messages = [{ role: 'user', content: 'a' }, sys(RESUMED), { role: 'user', content: 'b' }];
    pushNotice(messages, sys(RESUMED));
    assert.equal(messages.filter((m) => m.content === RESUMED).length, 2);
  });

  it('keeps other system lines and appends plain messages unchanged', () => {
    const messages = [{ role: 'user', content: 'a' }, sys('Agent process disconnected.'), sys(RESUMED)];
    pushNotice(messages, sys('Model already **x**.'));
    pushNotice(messages, sys('Model already **x**.'));
    pushNotice(messages, sys(RESUMED));
    assert.deepEqual(messages.map((m) => m.content), [
      'a',
      'Agent process disconnected.',
      'Model already **x**.',
      'Model already **x**.',
      RESUMED,
    ]);
  });
});
