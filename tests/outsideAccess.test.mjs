import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { OutsideAccessGrants, coalesceOutsidePrompt } = require('../dist-test/outsideAccess.js');
const { scopeKey } = require('../dist-test/pathScope.js');

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

  it('session allow for a Windows temp path covers every spelling of that file', () => {
    const spellings = [
      'C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd',
      '\\\\?\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd',
      'C:/Users/HUERTGEN/AppData/Local/Temp/CL-ZOOM.CMD',
      '//?/C:/Users/huertgen/AppData/Local/Temp/cl-zoom.cmd',
      '\\\\.\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd',
      'C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd.',
    ];
    const keys = spellings.map((p) => scopeKey(p, 'win32'));
    const g = new OutsideAccessGrants(1000);
    assert.equal(g.record('write', keys[0], 'session', 0), true);
    for (const key of keys) {
      assert.equal(g.allowed('write', key, 5_000), 'session', key);
      assert.equal(g.allowed('read', key, 5_000), 'session', key);
    }
    const other = scopeKey('C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd', 'win32');
    assert.equal(g.allowed('write', other, 5_000), undefined);
  });
});

describe('coalesceOutsidePrompt', () => {
  it('session allow covers a write that arrives while the dialog is open', async () => {
    const g = new OutsideAccessGrants(1000);
    const inflight = new Map();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let asks = 0;
    const first = coalesceOutsidePrompt(g, inflight, 'write', 'k', async () => {
      asks += 1;
      await gate;
      g.record('write', 'k', 'session', 0);
      return true;
    });
    const second = coalesceOutsidePrompt(g, inflight, 'write', 'k', async () => {
      asks += 1;
      return true;
    });
    release();
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(asks, 1);
  });

  it('Allow once does not cover a second write waiting on the same dialog', async () => {
    const g = new OutsideAccessGrants(1000);
    const inflight = new Map();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let asks = 0;
    const first = coalesceOutsidePrompt(g, inflight, 'write', 'k', async () => {
      asks += 1;
      await gate;
      g.record('write', 'k', 'once', 0);
      return true;
    });
    const second = coalesceOutsidePrompt(g, inflight, 'write', 'k', async () => {
      asks += 1;
      return true;
    });
    release();
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(asks, 2);
  });

  it('Allow once grace covers a second read waiting on the same dialog', async () => {
    const g = new OutsideAccessGrants(1000);
    const inflight = new Map();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let asks = 0;
    const first = coalesceOutsidePrompt(g, inflight, 'read', 'k', async () => {
      asks += 1;
      await gate;
      g.record('read', 'k', 'once');
      return true;
    });
    const second = coalesceOutsidePrompt(g, inflight, 'read', 'k', async () => {
      asks += 1;
      return true;
    });
    release();
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(asks, 1);
  });
});
