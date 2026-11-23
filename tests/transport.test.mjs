import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const require = createRequire(import.meta.url);
const { AcpTransport } = require('../dist-test/transport.js');

/** Fake child process: records signals; `exit()` emits close like Node. */
function fakeProc() {
  const proc = new EventEmitter();
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.signals = [];
  proc.killed = false;
  proc.stdinEnded = false;
  proc.stdin.on('finish', () => {
    proc.stdinEnded = true;
  });
  proc.kill = (sig = 'SIGTERM') => {
    proc.signals.push(sig);
    proc.killed = true;
    return true;
  };
  proc.exit = (code = 0, signal = null) => proc.emit('close', code, signal);
  return proc;
}

describe('AcpTransport shutdown', () => {
  it('unexpected exit emits close (agent crashed → session disconnected)', () => {
    const proc = fakeProc();
    const t = new AcpTransport(proc);
    const events = [];
    t.on('close', (code) => events.push(['close', code]));
    proc.exit(1);
    assert.deepEqual(events, [['close', 1]]);
    assert.equal(t.isClosed, true);
  });

  it('dispose: closes stdin, sends SIGTERM, and the later exit is not reported as close', async () => {
    const proc = fakeProc();
    const t = new AcpTransport(proc);
    const events = [];
    t.on('close', () => events.push('close'));
    t.on('exited', () => events.push('exited'));
    const pending = t.request('session/prompt', {});
    t.dispose(0);
    await assert.rejects(pending, /Transport disposed/);
    assert.equal(t.isClosed, true);
    await new Promise((r) => setImmediate(r));
    assert.equal(proc.stdinEnded, true);
    assert.deepEqual(proc.signals, ['SIGTERM']);
    // Grok runs SessionEnd hooks and exits ~2.5 s later, after a respawn
    proc.exit(0, null);
    assert.deepEqual(events, ['exited']);
  });

  it('dispose is idempotent and ignores late output of the old process', () => {
    const proc = fakeProc();
    const t = new AcpTransport(proc);
    const notes = [];
    t.on('notification', (n) => notes.push(n.method));
    t.dispose(0);
    t.dispose(0);
    assert.deepEqual(proc.signals, ['SIGTERM']);
    proc.stdout.write('{"jsonrpc":"2.0","method":"session/update","params":{}}\n');
    assert.deepEqual(notes, []);
  });

  it('sends SIGKILL only if the process is still alive after the grace period', async () => {
    const proc = fakeProc();
    const t = new AcpTransport(proc);
    t.dispose(20);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(proc.signals, ['SIGTERM', 'SIGKILL']);

    const proc2 = fakeProc();
    const t2 = new AcpTransport(proc2);
    t2.dispose(30);
    proc2.exit(0, null);
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual(proc2.signals, ['SIGTERM']);
  });

  it('exit during initialize includes the stderr cause and hides noise', async () => {
    const proc = fakeProc();
    const t = new AcpTransport(proc);
    const pending = t.request('initialize', {});
    proc.stderr.write('\u001b[31mdebug: listening\u001b[0m\n');
    proc.stderr.write('error: unknown sandbox profile "bogusprofile"\n');
    proc.stderr.write('error: token=supersecretvalue should be hidden\n');
    proc.exit(1, null);
    await assert.rejects(pending, (err) => {
      assert.match(err.message, /unknown sandbox profile "bogusprofile"/);
      assert.match(err.message, /Agent process exited \(code=1, signal=null\)/);
      assert.doesNotMatch(err.message, /debug: listening/);
      assert.doesNotMatch(err.message, /supersecretvalue/);
      assert.match(err.message, /<redacted>/);
      return true;
    });
  });

  it('includes stderr when the process exits during a request even with code 0', async () => {
    const proc = fakeProc();
    const t = new AcpTransport(proc);
    const pending = t.request('session/new', {});
    proc.stderr.write('error: stopped before the session started');
    proc.exit(0, null);
    await assert.rejects(pending, /stopped before the session started/);
  });

  it('a non-zero exit with no in-flight request still reports the tail', () => {
    const proc = fakeProc();
    const t = new AcpTransport(proc);
    let detail = '';
    t.on('close', (_code, _signal, reported) => {
      detail = reported;
    });
    proc.stderr.write('error: unknown key `nope` in sandbox.toml\n');
    proc.exit(1, null);
    assert.match(detail, /unknown key `nope` in sandbox.toml/);
  });

  it('a clean exit does not attach stderr noise', () => {
    const proc = fakeProc();
    const t = new AcpTransport(proc);
    let detail = 'unset';
    t.on('close', (_code, _signal, reported) => {
      detail = reported ?? '';
    });
    proc.stderr.write('debug: bye\n');
    proc.exit(0, null);
    assert.equal(detail, '');
  });
});
