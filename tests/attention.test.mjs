/**
 * Permission, elicitation, and plan approval share one modal attention notice.
 * CLI 1.0.85 sends the same terminal notification for all three.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { attentionNotice } = require('../dist-test/attention.js');

describe('attention notices', () => {
  it('uses a modal warning for permission, elicitation, and plan approval', () => {
    const kinds = ['permission', 'elicitation', 'plan-approval'];
    for (const kind of kinds) {
      const notice = attentionNotice(kind, 'write src/a.ts');
      assert.equal(notice.kind, kind);
      assert.equal(notice.modal, true);
      assert.equal(typeof notice.message, 'string');
      assert.equal(notice.message.length > 0, true);
      assert.equal(typeof notice.detail, 'string');
      assert.equal(notice.detail.length > 0, true);
    }
  });

  it('keeps the permission message the dialog already shows', () => {
    const notice = attentionNotice('permission', 'Write `src/a.ts`');
    assert.equal(notice.message, 'Grok wants to: Write `src/a.ts`');
  });

  it('names an elicitation and a plan approval without dropping the summary', () => {
    const ask = attentionNotice('elicitation', 'Which database?');
    assert.match(ask.message, /Which database\?/);
    const plan = attentionNotice('plan-approval', 'Step 1: edit the parser');
    assert.match(plan.message, /plan approval/i);
    assert.match(plan.detail, /Step 1: edit the parser/);
  });
});

describe('attention wiring', () => {
  const session = fs.readFileSync(new URL('../src/session/sessionManager.ts', import.meta.url), 'utf8');

  it('raises that modal for elicitation and plan approval, not only permissions', () => {
    assert.match(session, /showAttention\(\s*attentionNotice\('permission'/);
    assert.match(session, /showAttention\(\s*attentionNotice\('elicitation'/);
    assert.match(session, /showAttention\(\s*attentionNotice\('plan-approval'/);
    assert.match(session, /modal: true/);
  });
});
