import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { OutsideAccessGrants } = require('../dist-test/outsideAccess.js');

describe('OutsideAccessGrants (#45)', () => {
  it('nothing is allowed by default', () => {
    const g = new OutsideAccessGrants(1000);
    assert.equal(g.allowed('read', '/x'), undefined);
    assert.equal(g.allowed('write', '/x'), undefined);
  });
  it('deny allows nothing', () => {
    const g = new OutsideAccessGrants(1000);
    assert.equal(g.record('write', '/x', 'deny', 0), false);
    assert.equal(g.allowed('write', '/x', 1), undefined);
    assert.equal(g.allowed('read', '/x', 1), undefined);
  });
  it('write Allow once is one-shot for writes, short grace for reads', () => {
    const g = new OutsideAccessGrants(1000);
    assert.equal(g.record('write', '/x', 'once', 0), true);
    assert.equal(g.allowed('write', '/x', 10), undefined, 'second write asks again');
    assert.equal(g.allowed('read', '/x', 10), 'recent-once');
    assert.equal(g.allowed('read', '/x', 1001), undefined, 'grace expired');
    assert.equal(g.allowed('read', '/y', 10), undefined, 'other path');
  });
  it('session grants: write covers read, read does not cover write', () => {
    const g = new OutsideAccessGrants(1000);
    g.record('read', '/r', 'session', 0);
    assert.equal(g.allowed('read', '/r', 1e9), 'session');
    assert.equal(g.allowed('write', '/r', 1e9), undefined);
    g.record('write', '/w', 'session', 0);
    assert.equal(g.allowed('write', '/w', 1e9), 'session');
    assert.equal(g.allowed('read', '/w', 1e9), 'session');
  });
  it('clear() drops every grant', () => {
    const g = new OutsideAccessGrants(1000);
    g.record('write', '/w', 'session', 0);
    g.record('read', '/r', 'once', 0);
    g.clear();
    assert.equal(g.allowed('read', '/w', 1), undefined);
    assert.equal(g.allowed('read', '/r', 1), undefined);
  });
});
