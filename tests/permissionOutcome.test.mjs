import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { permissionDecision, permissionDecisionLabel } = require('../dist-test/permissionOutcome.js');

// Option set as sent by CLI 1.0.62 for a write approval
const OPTS = [
  { optionId: 'allow-edits-session', kind: 'allow_always' },
  { optionId: 'allow-once', kind: 'allow_once' },
  { optionId: 'reject-once', kind: 'reject_once' },
];
const sel = (optionId) => ({ outcome: { outcome: 'selected', optionId } });

describe('permissionDecision', () => {
  it('maps option kinds', () => {
    assert.equal(permissionDecision(sel('allow-once'), OPTS), 'allowed');
    assert.equal(permissionDecision(sel('allow-edits-session'), OPTS), 'allowed_always');
    assert.equal(permissionDecision(sel('reject-once'), OPTS), 'rejected');
  });
  it('cancelled / missing outcome', () => {
    assert.equal(permissionDecision({ outcome: { outcome: 'cancelled' } }, OPTS), 'cancelled');
    assert.equal(permissionDecision(undefined, OPTS), 'cancelled');
    assert.equal(permissionDecision({ outcome: { outcome: 'selected' } }, OPTS), 'cancelled');
  });
  it('unknown option kind → inferred from id', () => {
    assert.equal(permissionDecision(sel('deny-x'), []), 'rejected');
    assert.equal(permissionDecision(sel('allow-x'), null), 'allowed');
    assert.equal(permissionDecision(sel('zzz'), []), 'cancelled');
  });
});

describe('permissionDecisionLabel', () => {
  it('EN / DE', () => {
    assert.equal(permissionDecisionLabel('allowed', 'en'), 'Allowed');
    assert.equal(permissionDecisionLabel('allowed_always', 'en-US'), 'Allowed always');
    assert.equal(permissionDecisionLabel('rejected', 'de-DE'), 'Abgelehnt');
    assert.equal(permissionDecisionLabel('cancelled', 'de'), 'Abgebrochen');
    assert.equal(permissionDecisionLabel('allowed', undefined), 'Allowed');
  });
});

const { pickAllowOnceOption, pickAllowAlwaysOption, pickRejectOption } = require('../dist-test/permissionOutcome.js');

describe('option picking (retest bug: native "Allow" → "Allowed always")', () => {
  it('plain Allow picks allow_once even though CLI lists allow_always first', () => {
    const o = pickAllowOnceOption(OPTS);
    assert.equal(o.optionId, 'allow-once');
    assert.equal(permissionDecision(sel(o.optionId), OPTS), 'allowed');
  });
  it('Allow always picks allow_always', () => {
    const o = pickAllowAlwaysOption(OPTS);
    assert.equal(o.optionId, 'allow-edits-session');
    assert.equal(permissionDecision(sel(o.optionId), OPTS), 'allowed_always');
  });
  it('fallbacks when only one allow kind exists', () => {
    assert.equal(pickAllowOnceOption([{ optionId: 'a', kind: 'allow_always' }]).optionId, 'a');
    assert.equal(pickAllowAlwaysOption([{ optionId: 'b', kind: 'allow_once' }]).optionId, 'b');
    assert.equal(pickAllowOnceOption([]), undefined);
    assert.equal(pickAllowOnceOption(null), undefined);
  });
  it('reject prefers reject_once', () => {
    assert.equal(pickRejectOption([{ optionId: 'ra', kind: 'reject_always' }, { optionId: 'ro', kind: 'reject_once' }]).optionId, 'ro');
    assert.equal(pickRejectOption(OPTS).optionId, 'reject-once');
  });
});

describe('pickAutoAllowOption (#44)', () => {
  const { pickAutoAllowOption } = require('../dist-test/permissionOutcome.js');
  // CLI 1.0.62 order: session-wide grant listed FIRST
  const cli = [
    { optionId: 'allow-edits-session', name: 'Allow edits this session', kind: 'allow_always' },
    { optionId: 'allow-once', name: 'Allow', kind: 'allow_once' },
    { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
  ];
  const disallowFirst = [
    { optionId: 'no', name: 'Disallow', kind: 'reject_once' },
    { optionId: 'never', name: "Don't allow", kind: 'reject_always' },
    { optionId: 'yes', name: 'Yes', kind: 'allow_once' },
  ];
  const pick = (opts, ctx) => pickAutoAllowOption(opts, ctx)?.optionId;

  it('allow-once picks allow_once despite CLI 1.0.62 order', () => {
    assert.equal(pick(cli, { mode: 'allow-once' }), 'allow-once');
  });
  it('allow-once never falls back to a session-wide grant', () => {
    assert.equal(pick([cli[0], cli[2]], { mode: 'allow-once' }), undefined);
  });
  it('allow-session picks allow_once; allow_always only when no one-shot option', () => {
    assert.equal(pick(cli, { mode: 'allow-session' }), 'allow-once');
    assert.equal(pick([cli[0], cli[2]], { mode: 'allow-session' }), 'allow-edits-session');
  });
  it('allow-always / globalAllowAlways pick allow_always, fallback allow_once', () => {
    assert.equal(pick(cli, { mode: 'allow-always' }), 'allow-edits-session');
    assert.equal(pick(cli, { mode: 'ask', globalAllowAlways: true }), 'allow-edits-session');
    assert.equal(pick([cli[1], cli[2]], { mode: 'allow-always' }), 'allow-once');
  });
  it('ask returns undefined (prompt the user)', () => {
    assert.equal(pick(cli, { mode: 'ask' }), undefined);
  });
  it('session allow-always key picks allow_once', () => {
    assert.equal(pick(cli, { mode: 'ask', sessionKeyAllowed: true }), 'allow-once');
  });
  it('"Disallow" / "Don\'t allow" reject options are never auto-selected', () => {
    for (const mode of ['allow-once', 'allow-session', 'allow-always']) {
      assert.equal(pick(disallowFirst, { mode }), 'yes', mode);
      assert.equal(pick(disallowFirst.slice(0, 2), { mode }), undefined, mode);
    }
    assert.equal(pick(disallowFirst.slice(0, 2), { mode: 'ask', globalAllowAlways: true, sessionKeyAllowed: true }), undefined);
  });
  it('options without kind are never auto-allowed by name', () => {
    assert.equal(pick([{ optionId: 'allow', name: 'Allow' }], { mode: 'allow-always' }), undefined);
  });
  it('permissionDecision maps disallow-like ids of unknown kind to rejected', () => {
    assert.equal(permissionDecision({ outcome: { outcome: 'selected', optionId: 'disallow' } }, []), 'rejected');
    assert.equal(permissionDecision({ outcome: { outcome: 'selected', optionId: 'dont-allow' } }, []), 'rejected');
    assert.equal(permissionDecision({ outcome: { outcome: 'selected', optionId: 'allow' } }, []), 'allowed');
  });
});
