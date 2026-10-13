import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveMemoryMode, applyMemoryEnv } = require('../dist-test/memory.js');

describe('resolveMemoryMode', () => {
  it('defaults to default', () => {
    assert.equal(resolveMemoryMode({}), 'default');
    assert.equal(resolveMemoryMode({ memory: 'default' }), 'default');
  });
  it('explicit on/off', () => {
    assert.equal(resolveMemoryMode({ memory: 'on' }), 'on');
    assert.equal(resolveMemoryMode({ memory: 'off' }), 'off');
  });
  it('legacy noMemory → off', () => {
    assert.equal(resolveMemoryMode({ memory: 'default', noMemory: true }), 'off');
  });
  it('legacy experimentalMemory → on', () => {
    assert.equal(resolveMemoryMode({ experimentalMemory: true }), 'on');
  });
  it('legacy both → off (noMemory wins)', () => {
    assert.equal(resolveMemoryMode({ noMemory: true, experimentalMemory: true }), 'off');
  });
  it('explicit setting beats legacy', () => {
    assert.equal(resolveMemoryMode({ memory: 'on', noMemory: true }), 'on');
    assert.equal(resolveMemoryMode({ memory: 'off', experimentalMemory: true }), 'off');
  });
  it('unknown value falls back to legacy/default', () => {
    assert.equal(resolveMemoryMode({ memory: 'bogus' }), 'default');
  });
});

describe('applyMemoryEnv', () => {
  it('on → GROK_MEMORY=1', () => assert.equal(applyMemoryEnv({}, 'on').GROK_MEMORY, '1'));
  it('off → GROK_MEMORY=0', () => assert.equal(applyMemoryEnv({ GROK_MEMORY: '1' }, 'off').GROK_MEMORY, '0'));
  it('default leaves env untouched', () => {
    assert.equal(applyMemoryEnv({}, 'default').GROK_MEMORY, undefined);
    assert.equal(applyMemoryEnv({ GROK_MEMORY: '1' }, 'default').GROK_MEMORY, '1');
  });
});
