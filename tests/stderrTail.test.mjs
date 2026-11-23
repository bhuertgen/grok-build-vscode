import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  StderrTail,
  stripAnsi,
  redactSecrets,
  formatAgentExitError,
  formatDisconnectNotice,
  STDERR_TAIL_MAX_CHARS,
  STDERR_TAIL_MAX_LINES,
} = require('../dist-test/stderrTail.js');

describe('stderr tail', () => {
  it('strips ANSI and redacts credential-shaped values', () => {
    assert.equal(stripAnsi('\u001b[31merror: boom\u001b[0m'), 'error: boom');
    assert.equal(redactSecrets('error: token=supersecretvalue later'), 'error: token=<redacted> later');
    assert.equal(redactSecrets('Bearer abc.def.ghi'), 'Bearer <redacted>');
    assert.match(redactSecrets('sk_live_abcdefghij'), /<redacted>/);
    assert.equal(
      redactSecrets('error: unknown sandbox profile "bogusprofile"'),
      'error: unknown sandbox profile "bogusprofile"'
    );
  });

  it('prefers error: lines over a long debug tail', () => {
    const tail = new StderrTail();
    const warns = [];
    for (let i = 0; i < 40; i++) {
      const res = tail.push(`debug line ${i}\n`);
      warns.push(...res.warnLines);
    }
    warns.push(...tail.push('\u001b[31merror: unknown key `extra` in sandbox.toml\u001b[0m\n').warnLines);
    warns.push(...tail.push('error: unknown sandbox profile "bogusprofile"\n').warnLines);
    assert.deepEqual(warns, [
      'error: unknown key `extra` in sandbox.toml',
      'error: unknown sandbox profile "bogusprofile"',
    ]);
    const text = tail.meaningful();
    assert.match(text, /unknown key `extra`/);
    assert.match(text, /bogusprofile/);
    assert.doesNotMatch(text, /debug line/);
    assert.equal(
      formatAgentExitError(1, null, text).split('\n')[0].startsWith('error:'),
      true
    );
  });

  it('keeps the last error lines and the last ordinary lines, capped', () => {
    const tail = new StderrTail();
    for (let i = 0; i < STDERR_TAIL_MAX_LINES + 5; i++) {
      tail.push(`error: number ${i}\n`);
    }
    const errors = tail.meaningful().split('\n');
    assert.equal(errors.length, STDERR_TAIL_MAX_LINES);
    assert.match(errors[0], new RegExp(`number ${5}`));
    assert.match(errors.at(-1), /number 24/);

    const noise = new StderrTail();
    for (let i = 0; i < 30; i++) {
      noise.push(`note ${i}\n`);
    }
    const notes = noise.meaningful().split('\n');
    assert.equal(notes.length, STDERR_TAIL_MAX_LINES);
    assert.match(notes[0], /note 10/);
    assert.match(notes.at(-1), /note 29/);
  });

  it('truncates a huge line and a huge tail', () => {
    const tail = new StderrTail();
    tail.push(`error: ${'x'.repeat(STDERR_TAIL_MAX_CHARS + 500)}\n`);
    const text = tail.meaningful();
    assert.ok(text.length <= STDERR_TAIL_MAX_CHARS);
    assert.match(text, /^error:/);
  });

  it('flushes a final partial line and leaves a clean disconnect sentence alone', () => {
    const tail = new StderrTail();
    assert.deepEqual(tail.push('error: no newline yet').warnLines, []);
    assert.deepEqual(tail.flush(), ['error: no newline yet']);
    assert.match(tail.meaningful(), /no newline yet/);
    assert.equal(
      formatDisconnectNotice(''),
      'Agent process disconnected. Send a message to reconnect.'
    );
    assert.match(formatDisconnectNotice('error: boom'), /error: boom/);
    assert.match(formatDisconnectNotice('error: boom'), /Send a message to reconnect/);
    assert.equal(
      formatAgentExitError(1, null, ''),
      'Agent process exited (code=1, signal=null)'
    );
  });
});
