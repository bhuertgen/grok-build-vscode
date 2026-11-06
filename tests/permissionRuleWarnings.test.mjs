import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  permissionRuleWarningsFromMeta,
  permissionRuleNoticeFromMeta,
  formatPermissionRuleNotice,
} = require('../dist-test/permissionRuleWarnings.js');
const { pushNotice, noticeKind } = require('../dist-test/restoreNotices.js');
const { findMessageLinks } = require('../dist-test/messageLinks.js');

/** Probe A1 — invalid JSON in .claude/settings.json (CLI alpha 1.0.77). */
const A1 = [
  "Rules in /workspace/probes-1.0.77/proj/.claude/settings.json aren't loaded: not valid JSON (EOF while parsing a value at line 2 column 0). Fix the file.",
];

/** Probe A2 — one string per broken rule (CLI alpha 1.0.77). */
const A2 = [
  "Entry `permission.rules[0]` in /workspace/probes-1.0.77/proj/.grok/config.toml isn't loaded: unknown variant `maybe`, expected one of `allow`, `deny`, `ask` in `action`. Fix or remove it.",
  "Deny entry `permission.rules[1]` in /workspace/probes-1.0.77/proj/.grok/config.toml isn't enforced: unknown variant `teleport`, expected one of `any`, `bash`, `edit`, `read`, `grep`, `mcp`, `webfetch`, `websearch`, `agent_message`, `agentmessage` in `tool`. Fix or remove it.",
  "Allow entry `permissions.allow` in /workspace/probes-1.0.77/proj/.claude/settings.json isn't applied: expected an array of rule strings, got string. Fix or remove it.",
  "Deny rule `Agent(model:opus)` in /workspace/probes-1.0.77/proj/.claude/settings.json isn't enforced: Grok has no tool named Agent. Fix or remove it.",
  "Deny rule `Bash(rm -rf *` in /workspace/probes-1.0.77/proj/.claude/settings.json isn't enforced: malformed rule: missing closing parenthesis. Fix or remove it.",
];

const KEY = 'x.ai/permissionRuleWarnings';
const RESUMED = '**Session resumed** — the agent has the previous conversation.';

function meta(warnings) {
  return { [KEY]: warnings };
}

function pathsIn(text) {
  return findMessageLinks(text)
    .filter((h) => h.kind === 'path')
    .map((h) => h.path);
}

function noticeLines(content) {
  const nl = content.indexOf('\n');
  assert.ok(nl > 0, 'notice has a heading line');
  return content.slice(nl + 1).split('\n');
}

describe('permissionRuleWarningsFromMeta (probe A)', () => {
  it('reads the A1 payload verbatim', () => {
    assert.deepEqual(permissionRuleWarningsFromMeta(meta(A1)), A1);
  });

  it('reads each A2 string once, in order', () => {
    assert.deepEqual(permissionRuleWarningsFromMeta(meta(A2)), A2);
    const doubled = permissionRuleWarningsFromMeta(meta([...A2, A2[0], A2[3]]));
    assert.deepEqual(doubled, A2);
  });

  it('tolerates a missing key, a non-array, and non-strings', () => {
    assert.deepEqual(permissionRuleWarningsFromMeta(undefined), []);
    assert.deepEqual(permissionRuleWarningsFromMeta(null), []);
    assert.deepEqual(permissionRuleWarningsFromMeta('nope'), []);
    assert.deepEqual(permissionRuleWarningsFromMeta([]), []);
    // Stable 1.0.70 and untrusted folders omit the key. A3 still sends turnCount.
    assert.deepEqual(permissionRuleWarningsFromMeta({ 'x.ai/session/turnCount': 2 }), []);
    assert.deepEqual(permissionRuleWarningsFromMeta(meta('not-an-array')), []);
    assert.deepEqual(permissionRuleWarningsFromMeta(meta({ 0: A1[0] })), []);
    assert.deepEqual(
      permissionRuleWarningsFromMeta(meta(['keep', 1, null, '', '   ', 'keep', { t: 1 }, 'next'])),
      ['keep', 'next']
    );
  });
});

describe('permission rule notice', () => {
  it('shows the A1 string verbatim as one warning notice', () => {
    const notice = permissionRuleNoticeFromMeta(meta(A1));
    assert.equal(noticeKind(notice), 'permission-rules');
    assert.deepEqual(noticeLines(notice), A1);
    assert.equal(formatPermissionRuleNotice([]), undefined);
    assert.equal(permissionRuleNoticeFromMeta({}), undefined);
  });

  it('shows each A2 string verbatim, and the file paths are linkable', () => {
    const notice = permissionRuleNoticeFromMeta(meta(A2));
    assert.equal(noticeKind(notice), 'permission-rules');
    assert.deepEqual(noticeLines(notice), A2);
    assert.deepEqual(pathsIn(A2[0]), ['/workspace/probes-1.0.77/proj/.grok/config.toml']);
    assert.deepEqual(pathsIn(A2[1]), ['/workspace/probes-1.0.77/proj/.grok/config.toml']);
    assert.deepEqual(pathsIn(A2[2]), ['/workspace/probes-1.0.77/proj/.claude/settings.json']);
    assert.deepEqual(pathsIn(A2[4]), ['/workspace/probes-1.0.77/proj/.claude/settings.json']);
    assert.deepEqual(pathsIn(notice), [
      '/workspace/probes-1.0.77/proj/.grok/config.toml',
      '/workspace/probes-1.0.77/proj/.grok/config.toml',
      '/workspace/probes-1.0.77/proj/.claude/settings.json',
      '/workspace/probes-1.0.77/proj/.claude/settings.json',
      '/workspace/probes-1.0.77/proj/.claude/settings.json',
    ]);
  });

  it('a load replaces the trailing notice of the same kind and leaves other notices', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'agent', content: 'ok' },
    ];
    const a1 = permissionRuleNoticeFromMeta(meta(A1));
    const a2 = permissionRuleNoticeFromMeta(meta(A2));
    const sys = (content) => ({ role: 'system', content });

    pushNotice(messages, sys(a1));
    pushNotice(messages, sys(RESUMED));
    // Reload: same warnings again, then the resume line.
    pushNotice(messages, sys(a1));
    pushNotice(messages, sys(RESUMED));
    assert.equal(messages.filter((m) => noticeKind(m.content) === 'permission-rules').length, 1);
    assert.equal(messages.filter((m) => noticeKind(m.content) === 'session-resumed').length, 1);
    assert.equal(messages.at(-2).content, a1);

    // A later load with a different payload replaces the trailing warning.
    pushNotice(messages, sys(a2));
    assert.equal(messages.filter((m) => noticeKind(m.content) === 'permission-rules').length, 1);
    assert.equal(messages.at(-1).content, a2);
    assert.equal(noticeLines(messages.at(-1).content).length, A2.length);
  });

  it('keeps an earlier warning once the conversation has moved on', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'system', content: permissionRuleNoticeFromMeta(meta(A1)) },
      { role: 'user', content: 'next' },
    ];
    pushNotice(messages, {
      role: 'system',
      content: permissionRuleNoticeFromMeta(meta(A2)),
    });
    assert.equal(messages.filter((m) => noticeKind(m.content) === 'permission-rules').length, 2);
  });

  it('does not treat the warning text as an agent message', () => {
    const notice = permissionRuleNoticeFromMeta(meta(A1));
    const messages = [{ role: 'agent', content: notice }];
    pushNotice(messages, { role: 'agent', content: notice });
    assert.equal(messages.length, 2);
    assert.equal(noticeKind(notice), 'permission-rules');
    assert.equal(messages.every((m) => m.role === 'agent'), true);
  });
});
