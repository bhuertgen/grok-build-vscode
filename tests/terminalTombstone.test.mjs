import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ReleasedTerminalCache,
  RELEASED_TERMINAL_CACHE,
  UnknownTerminalError,
  UNKNOWN_TERMINAL_ERROR_CODE,
  isUnknownTerminalError,
  answerTerminalOutput,
  finishedExitStatus,
  liveTerminalForKill,
  releaseTerminalRecord,
  terminalMissLogLevel,
} = require('../dist-test/terminalTombstone.js');

function term(partial) {
  return {
    output: '',
    truncated: false,
    exited: false,
    exitCode: undefined,
    signal: undefined,
    waiters: [],
    ...partial,
  };
}

describe('released terminal output', () => {
  it('returns the last output and exit status after release', () => {
    const live = new Map();
    const released = new ReleasedTerminalCache();
    const bash = term({
      output: 'hello\n',
      exited: true,
      exitCode: 0,
      signal: null,
    });
    live.set('term_1', bash);

    assert.deepEqual(answerTerminalOutput(live, released, 'term_1'), {
      output: 'hello\n',
      truncated: false,
      exitStatus: { exitCode: 0, signal: null },
    });

    const removed = releaseTerminalRecord(live, released, 'term_1');
    assert.equal(removed, bash);
    assert.equal(live.has('term_1'), false);

    assert.deepEqual(answerTerminalOutput(live, released, 'term_1'), {
      output: 'hello\n',
      truncated: false,
      exitStatus: { exitCode: 0, signal: null },
    });
    assert.deepEqual(finishedExitStatus(bash), { exitCode: 0, signal: null });
  });

  it('picks up an exit that arrives after Stop releases the terminal', () => {
    const live = new Map();
    const released = new ReleasedTerminalCache();
    const running = term({ output: 'partial' });
    live.set('term_stop', running);
    releaseTerminalRecord(live, released, 'term_stop');

    assert.equal(answerTerminalOutput(live, released, 'term_stop').exitStatus, null);

    running.exited = true;
    running.exitCode = -2;
    running.signal = 'SIGTERM';
    const body = answerTerminalOutput(live, released, 'term_stop');
    assert.equal(body.output, 'partial');
    assert.deepEqual(body.exitStatus, { exitCode: 1, signal: 'SIGTERM' });
    assert.deepEqual(finishedExitStatus(running), { exitCode: 1, signal: 'SIGTERM' });
  });

  it('keeps truncated output', () => {
    const live = new Map();
    const released = new ReleasedTerminalCache();
    live.set('term_long', term({ output: 'abc', truncated: true, exited: true, exitCode: 0 }));
    releaseTerminalRecord(live, released, 'term_long');
    const body = answerTerminalOutput(live, released, 'term_long');
    assert.equal(body.truncated, true);
    assert.equal(body.output, 'abc');
  });

  it('drops the oldest released terminal past the bound', () => {
    const live = new Map();
    const released = new ReleasedTerminalCache(2);
    for (const id of ['a', 'b', 'c']) {
      live.set(id, term({ output: id, exited: true, exitCode: 0 }));
      releaseTerminalRecord(live, released, id);
    }
    assert.equal(released.size, 2);
    assert.throws(
      () => answerTerminalOutput(live, released, 'a'),
      (err) => err instanceof UnknownTerminalError && err.terminalId === 'a'
    );
    assert.equal(answerTerminalOutput(live, released, 'c').output, 'c');
    assert.equal(RELEASED_TERMINAL_CACHE >= 2, true);
  });

  it('re-releasing the same id does not consume a second slot', () => {
    const live = new Map();
    const released = new ReleasedTerminalCache(1);
    const first = term({ output: 'one', exited: true, exitCode: 0 });
    live.set('term', first);
    releaseTerminalRecord(live, released, 'term');
    live.set('term', first);
    releaseTerminalRecord(live, released, 'term');
    const other = term({ output: 'two', exited: true, exitCode: 0 });
    live.set('other', other);
    releaseTerminalRecord(live, released, 'other');
    assert.equal(released.size, 1);
    assert.equal(answerTerminalOutput(live, released, 'other').output, 'two');
  });
});

describe('unknown terminal requests', () => {
  it('terminal/output for an id that was never released is an ACP error', () => {
    const live = new Map();
    const released = new ReleasedTerminalCache();
    assert.throws(
      () => answerTerminalOutput(live, released, 'term_missing'),
      (err) => {
        assert.equal(isUnknownTerminalError(err), true);
        assert.equal(err.code, UNKNOWN_TERMINAL_ERROR_CODE);
        assert.equal(err.message, 'Unknown terminal: term_missing');
        return true;
      }
    );
  });

  it('terminal/kill and terminal/release on an unknown id are no-ops', () => {
    const live = new Map();
    const released = new ReleasedTerminalCache();
    const bash = term({ output: 'x', exited: true, exitCode: 0 });
    live.set('term_1', bash);
    releaseTerminalRecord(live, released, 'term_1');

    assert.equal(liveTerminalForKill(live, 'term_1'), undefined);
    assert.equal(liveTerminalForKill(live, 'term_nope'), undefined);
    assert.equal(releaseTerminalRecord(live, released, 'term_1'), undefined);
    assert.equal(releaseTerminalRecord(live, released, 'term_nope'), undefined);
    assert.equal(answerTerminalOutput(live, released, 'term_1').output, 'x');
  });

  it('warns once per method and id, then debugs', () => {
    const seen = new Set();
    assert.equal(terminalMissLogLevel(seen, 'terminal/output', 'term_9'), 'warn');
    assert.equal(terminalMissLogLevel(seen, 'terminal/output', 'term_9'), 'debug');
    assert.equal(terminalMissLogLevel(seen, 'terminal/wait_for_exit', 'term_9'), 'warn');
    assert.equal(terminalMissLogLevel(seen, 'terminal/wait_for_exit', 'term_9'), 'debug');
    assert.equal(terminalMissLogLevel(seen, 'terminal/output', 'term_8'), 'warn');
  });
});
