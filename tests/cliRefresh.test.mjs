import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { affectsCliDetection, createCliRedetector, CLI_DETECTION_SETTINGS } =
  require('../dist-test/cliRefresh.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('affectsCliDetection', () => {
  it('cliPath change triggers re-detection', () => {
    assert.deepEqual([...CLI_DETECTION_SETTINGS], ['grokBuild.cliPath']);
    assert.equal(affectsCliDetection((s) => s === 'grokBuild.cliPath'), true);
  });
  it('other grokBuild settings (cliPermissionMode, maxTurns, …) do not', () => {
    for (const k of ['grokBuild.cliPermissionMode', 'grokBuild.maxTurns', 'grokBuild.logLevel', 'editor.fontSize']) {
      assert.equal(affectsCliDetection((s) => s === k), false, k);
    }
  });
});

describe('createCliRedetector', () => {
  it('debounces a burst of changes into one run', async () => {
    let n = 0;
    const r = createCliRedetector(async () => { n++; }, 10);
    r.trigger(); r.trigger(); r.trigger();
    await sleep(40);
    assert.equal(n, 1);
  });

  it('change during a running detection schedules exactly one more run', async () => {
    let n = 0; let release;
    const r = createCliRedetector(async () => {
      n++;
      if (n === 1) await new Promise((res) => { release = res; });
    }, 5);
    r.trigger();
    await sleep(20); // run 1 in flight
    r.trigger(); await sleep(20);
    r.trigger(); await sleep(20); // still in flight → coalesced into one pending
    assert.equal(n, 1);
    release();
    await sleep(20);
    assert.equal(n, 2);
  });

  it('a throwing run does not block later runs', async () => {
    let n = 0;
    const r = createCliRedetector(async () => { n++; throw new Error('boom'); }, 5);
    r.trigger(); await sleep(20);
    r.trigger(); await sleep(20);
    assert.equal(n, 2);
  });

  it('dispose cancels a scheduled run', async () => {
    let n = 0;
    const r = createCliRedetector(async () => { n++; }, 10);
    r.trigger(); r.dispose();
    await sleep(30);
    assert.equal(n, 0);
  });
});

describe('createCliRedetector dispose (#49)', () => {
  it('trigger() after dispose() never calls run', async () => {
    let n = 0;
    const r = createCliRedetector(async () => { n++; }, 5);
    r.dispose();
    assert.equal(r.disposed, true);
    r.trigger(); r.trigger();
    await sleep(30);
    assert.equal(n, 0);
  });

  it('a run in flight during dispose() does not start the pending follow-up', async () => {
    let n = 0; let release; let seenSignal;
    const r = createCliRedetector(async (signal) => {
      n++;
      seenSignal = signal;
      if (n === 1) await new Promise((res) => { release = res; });
    }, 5);
    r.trigger();
    await sleep(20);            // run 1 in flight
    r.trigger(); await sleep(20); // queued as pending follow-up
    assert.equal(n, 1);
    r.dispose();
    assert.equal(seenSignal.aborted, true, 'in-flight run sees the abort');
    release();
    await sleep(30);
    assert.equal(n, 1, 'no follow-up run after dispose');
  });

  it('run receives a non-aborted signal while active', async () => {
    let aborted;
    const r = createCliRedetector(async (signal) => { aborted = signal.aborted; }, 5);
    r.trigger(); await sleep(20);
    assert.equal(aborted, false);
    r.dispose();
  });
});
