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
