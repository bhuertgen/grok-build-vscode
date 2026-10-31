import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { OutsideAccessGrants, coalesceOutsidePrompt } = require('../dist-test/outsideAccess.js');
const { isUnderScopeKey, osTempScopeKey, resolveScopePath, scopeKey } = require('../dist-test/pathScope.js');

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

  it('session allow for a Windows path covers every spelling of that file', () => {
    // Not the OS temp root: a sibling stays one file (#70). The name "Temp"
    // in the path does not widen the grant.
    const spellings = [
      'C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd',
      '\\\\?\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd',
      'C:/Users/HUERTGEN/AppData/Local/Temp/CL-ZOOM.CMD',
      '//?/C:/Users/huertgen/AppData/Local/Temp/cl-zoom.cmd',
      '\\\\.\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd',
      'C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd.',
    ];
    const keys = spellings.map((p) => scopeKey(p, 'win32'));
    const g = new OutsideAccessGrants(1000, { osTempKey: null });
    assert.equal(g.record('write', keys[0], 'session', 0), true);
    for (const key of keys) {
      assert.equal(g.allowed('write', key, 5_000), 'session', key);
      assert.equal(g.allowed('read', key, 5_000), 'session', key);
    }
    const other = scopeKey('C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd', 'win32');
    assert.equal(g.allowed('write', other, 5_000), undefined);
  });

  it('session write under the OS temp folder covers other files there, including Windows spellings', () => {
    const osTempKey = scopeKey('\\\\?\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\', 'win32');
    const zoom = scopeKey('\\\\?\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd', 'win32');
    const g = new OutsideAccessGrants(1000, { osTempKey, platform: 'win32' });
    assert.equal(g.isInOsTemp(zoom), true);
    assert.equal(g.record('write', zoom, 'session', 0), true);

    const covered = [
      'C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd',
      '\\\\?\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd',
      'C:/Users/HUERTGEN/AppData/Local/Temp/OTHER.CMD',
      '//?/C:/Users/huertgen/AppData/Local/Temp/other.cmd',
      '\\\\.\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd',
      'C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd.',
      'C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd ',
      'C:\\Users\\huertgen\\AppData\\Local\\Temp.\\sub\\helper.cmd',
    ];
    for (const spelling of covered) {
      const key = scopeKey(spelling, 'win32');
      assert.equal(g.allowed('write', key, 5_000), 'session', spelling);
      assert.equal(g.allowed('read', key, 5_000), 'session', spelling);
    }

    const outside = [
      'C:\\Users\\huertgen\\Documents\\notes.txt',
      'C:\\Windows\\Temp\\grok-should-not.txt',
      'D:\\Temp\\cl-zoom.cmd',
      'C:\\Users\\huertgen\\AppData\\Local\\TempExtra\\x.cmd',
    ];
    for (const spelling of outside) {
      const key = scopeKey(spelling, 'win32');
      assert.equal(g.isInOsTemp(key), false, spelling);
      assert.equal(g.allowed('write', key, 5_000), undefined, spelling);
      assert.equal(g.allowed('read', key, 5_000), undefined, spelling);
    }

    // A folder that is only named Temp stays per-file.
    const fake = scopeKey('D:\\Temp\\cl-zoom.cmd', 'win32');
    const fakeOther = scopeKey('\\\\?\\D:\\Temp\\other.cmd', 'win32');
    assert.equal(g.record('write', fake, 'session', 0), true);
    assert.equal(g.allowed('write', fake, 5_000), 'session');
    assert.equal(g.allowed('write', fakeOther, 5_000), undefined);
    assert.equal(g.allowed('read', fakeOther, 5_000), undefined);

    g.clear();
    const other = scopeKey('C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd', 'win32');
    assert.equal(g.allowed('write', other, 5_000), undefined);
    assert.equal(g.allowed('write', fake, 5_000), undefined);
  });

  it('Allow once and a session read under OS temp stay one file', () => {
    const osTempKey = scopeKey('C:\\Users\\huertgen\\AppData\\Local\\Temp', 'win32');
    const zoom = scopeKey('C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd', 'win32');
    const other = scopeKey('C:/Users/HUERTGEN/AppData/Local/Temp/other.cmd', 'win32');
    const once = new OutsideAccessGrants(1000, { osTempKey, platform: 'win32' });
    assert.equal(once.record('write', zoom, 'once', 0), true);
    assert.equal(once.allowed('write', zoom, 10), undefined);
    assert.equal(once.allowed('write', other, 10), undefined);
    assert.equal(once.allowed('read', zoom, 10), 'recent-once');
    assert.equal(once.allowed('read', other, 10), undefined);

    const reads = new OutsideAccessGrants(1000, { osTempKey, platform: 'win32' });
    reads.record('read', zoom, 'session', 0);
    assert.equal(reads.allowed('read', zoom, 10), 'session');
    assert.equal(reads.allowed('read', other, 10), undefined);
    assert.equal(reads.allowed('write', zoom, 10), undefined);
    assert.equal(reads.allowed('write', other, 10), undefined);
  });

  it('session write in the real OS temp directory covers another file there', () => {
    const g = new OutsideAccessGrants(1000);
    const tempKey = osTempScopeKey();
    assert.equal(tempKey, scopeKey(resolveScopePath(os.tmpdir())));
    const zoom = scopeKey(resolveScopePath(path.join(os.tmpdir(), 'cl-zoom.cmd')));
    const other = scopeKey(resolveScopePath(path.join(os.tmpdir(), 'other-file.cmd')));
    assert.equal(isUnderScopeKey(zoom, tempKey), true);
    assert.equal(g.record('write', zoom, 'session', 0), true);
    assert.equal(g.allowed('write', other, 1), 'session');
    assert.equal(g.allowed('read', other, 1), 'session');

    const outsideDir = path.resolve(os.tmpdir(), '..', `gbv-not-os-temp-${process.pid}`);
    const outside = scopeKey(resolveScopePath(path.join(outsideDir, 'notes.txt')));
    const outsideSibling = scopeKey(resolveScopePath(path.join(outsideDir, 'other.txt')));
    assert.equal(g.allowed('write', outside, 1), undefined);
    assert.equal(g.record('write', outside, 'session', 0), true);
    assert.equal(g.allowed('write', outside, 1), 'session');
    assert.equal(g.allowed('write', outsideSibling, 1), undefined);

    const namedTemp = scopeKey(resolveScopePath(path.resolve(os.tmpdir(), '..', '..', 'Temp', 'cl-zoom.cmd')));
    const namedOther = scopeKey(resolveScopePath(path.resolve(os.tmpdir(), '..', '..', 'Temp', 'other.cmd')));
    assert.equal(g.isInOsTemp(namedTemp), false);
    assert.equal(g.record('write', namedTemp, 'session', 0), true);
    assert.equal(g.allowed('write', namedOther, 1), undefined);
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

  it('session allow on an OS temp write covers a different temp file waiting on the dialog', async () => {
    const osTempKey = scopeKey('\\\\?\\C:\\Users\\huertgen\\AppData\\Local\\Temp', 'win32');
    const zoom = scopeKey('C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd', 'win32');
    const other = scopeKey('\\\\?\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd', 'win32');
    const g = new OutsideAccessGrants(1000, { osTempKey, platform: 'win32' });
    const inflight = new Map();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let asks = 0;
    const first = coalesceOutsidePrompt(g, inflight, 'write', zoom, async () => {
      asks += 1;
      await gate;
      g.record('write', zoom, 'session', 0);
      return true;
    });
    const second = coalesceOutsidePrompt(g, inflight, 'write', other, async () => {
      asks += 1;
      return true;
    });
    release();
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(asks, 1);
    assert.equal(g.allowed('read', other, 1), 'session');
  });

  it('Allow once on an OS temp write does not cover a different temp file waiting on the dialog', async () => {
    const osTempKey = scopeKey('C:\\Users\\huertgen\\AppData\\Local\\Temp', 'win32');
    const zoom = scopeKey('C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd', 'win32');
    const other = scopeKey('C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd', 'win32');
    const outside = scopeKey('D:\\Temp\\other.cmd', 'win32');
    const g = new OutsideAccessGrants(1000, { osTempKey, platform: 'win32' });
    const inflight = new Map();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let asks = 0;
    const first = coalesceOutsidePrompt(g, inflight, 'write', zoom, async () => {
      asks += 1;
      await gate;
      g.record('write', zoom, 'once', 0);
      return true;
    });
    const second = coalesceOutsidePrompt(g, inflight, 'write', other, async () => {
      asks += 1;
      return true;
    });
    const third = coalesceOutsidePrompt(g, inflight, 'write', outside, async () => {
      asks += 1;
      return true;
    });
    release();
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(await third, true);
    assert.equal(asks, 3);
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
