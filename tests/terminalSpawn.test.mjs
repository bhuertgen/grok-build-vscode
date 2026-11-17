import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  planTerminalSpawn,
  normalizeTerminalExitCode,
  planTerminalKill,
  taskkillArgs,
  killTerminalProcess,
  terminalIdsToCancel,
  TERMINAL_KILL_GRACE_MS,
} = require('../dist-test/terminalSpawn.js');

const BASH_LINE = "/usr/bin/bash -lc 'echo ctrl-probe-ok'";

/** Same spawn shape as `ClientHandlers.createTerminal`. */
function spawnPlanned(spec) {
  const options = {
    shell: !!spec.shell,
    ...(spec.detached ? { detached: true } : {}),
    ...(spec.windowsHide ? { windowsHide: true } : {}),
  };
  return spec.shell
    ? spawn(spec.file, options)
    : spawn(spec.file, spec.args, { ...options, shell: false });
}

function closeCode(child) {
  return new Promise((resolve) => {
    // A failed spawn emits `error` and then `close`. The listener keeps
    // the error from becoming an unhandled EventEmitter error.
    child.once('error', () => {});
    child.once('close', (code) => resolve(code));
  });
}

describe('planTerminalSpawn', () => {
  it('runs a CLI 1.0.77 combined bash -lc line through the shell', () => {
    for (const args of [undefined, null, []]) {
      const spec = planTerminalSpawn('linux', BASH_LINE, args);
      assert.equal(spec.shell, true);
      assert.equal(spec.file, BASH_LINE);
      assert.deepEqual(spec.args, []);
      assert.equal(spec.windowsHide, undefined);
      assert.equal(spec.detached, true);
    }
  });

  it('keeps separate args as a direct argv spawn', () => {
    const spec = planTerminalSpawn('linux', '/usr/bin/bash', ['-lc', 'echo argv-ok']);
    assert.equal(spec.shell, false);
    assert.equal(spec.file, '/usr/bin/bash');
    assert.deepEqual(spec.args, ['-lc', 'echo argv-ok']);
    assert.equal(spec.detached, true);
  });

  it('does not re-split an argument that contains spaces', () => {
    const spec = planTerminalSpawn('darwin', 'printf', ['%s', 'hello world']);
    assert.equal(spec.shell, false);
    assert.deepEqual(spec.args, ['%s', 'hello world']);
    assert.equal(spec.detached, true);
    assert.equal(planTerminalKill('darwin'), 'process-group');
    const shell = planTerminalSpawn('darwin', "/bin/bash -lc 'sleep 5'", []);
    assert.equal(shell.shell, true);
    assert.equal(shell.detached, true);
    assert.deepEqual(shell.args, []);
  });

  it('on Windows still builds one shell command line', () => {
    const plain = planTerminalSpawn('win32', 'npm', ['test']);
    assert.equal(plain.shell, true);
    assert.equal(plain.windowsHide, true);
    assert.equal(plain.detached, undefined);
    assert.equal(plain.file, 'npm test');
    assert.deepEqual(plain.args, []);
    assert.equal(planTerminalKill('win32'), 'taskkill');

    const spaced = planTerminalSpawn('win32', 'C:\\Program Files\\git.exe', ['status']);
    assert.equal(spaced.file, '"C:\\Program Files\\git.exe" status');

    const empty = planTerminalSpawn('win32', 'cmd', ['']);
    assert.equal(empty.file, 'cmd ""');
  });
});

describe('normalizeTerminalExitCode', () => {
  it('keeps unsigned exit codes and null', () => {
    assert.equal(normalizeTerminalExitCode(0), 0);
    assert.equal(normalizeTerminalExitCode(1), 1);
    assert.equal(normalizeTerminalExitCode(null), null);
    assert.equal(normalizeTerminalExitCode(undefined), null);
    assert.equal(normalizeTerminalExitCode(Number.NaN), null);
  });

  it('maps a negative or non-integer close code to 1', () => {
    assert.equal(normalizeTerminalExitCode(-2), 1);
    assert.equal(normalizeTerminalExitCode(-1), 1);
    assert.equal(normalizeTerminalExitCode(1.5), 1);
  });
});

describe('terminal/create spawn (CLI 1.0.77 command string)', () => {
  it('shell plan runs /usr/bin/bash -lc and prints ctrl-probe-ok', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const spec = planTerminalSpawn(process.platform, BASH_LINE, undefined);
    const child = spawnPlanned(spec);
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
    });
    const code = await closeCode(child);
    assert.equal(code, 0);
    assert.match(out, /ctrl-probe-ok/);
  });

  it('direct spawn of that string fails, and the negative close code becomes 1', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const child = spawn(BASH_LINE, [], { shell: false });
    const code = await closeCode(child);
    assert.equal(code < 0, true);
    assert.equal(normalizeTerminalExitCode(code), 1);
  });
});

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function childPids(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'pid=', '--ppid', String(pid)], {
      encoding: 'utf8',
    });
    return out
      .split(/\s+/)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Walk children until `sleep` shows up (shell → bash → sleep). */
async function findSleepPid(rootPid) {
  for (let i = 0; i < 40; i++) {
    const stack = childPids(rootPid);
    while (stack.length) {
      const pid = stack.pop();
      let args = '';
      try {
        args = execFileSync('ps', ['-o', 'args=', '-p', String(pid)], {
          encoding: 'utf8',
        });
      } catch {
        args = '';
      }
      if (/\bsleep\b/.test(args)) {
        return pid;
      }
      stack.push(...childPids(pid));
    }
    await delay(25);
  }
  return 0;
}

describe('killTerminalProcess', () => {
  it('signals the process group on Linux and macOS', () => {
    for (const platform of ['linux', 'darwin']) {
      const signals = [];
      let scheduled = 0;
      killTerminalProcess(
        {
          pid: 42,
          kill(sig) {
            signals.push(['fallback', sig]);
            return true;
          },
          exitCode: null,
          signalCode: null,
        },
        platform,
        {
          signalGroup(pid, sig) {
            signals.push(['group', pid, sig]);
          },
          schedule(ms) {
            scheduled = ms;
          },
        }
      );
      assert.equal(planTerminalKill(platform), 'process-group');
      assert.deepEqual(signals, [['group', -42, 'SIGTERM']]);
      assert.equal(scheduled, TERMINAL_KILL_GRACE_MS);
    }
  });

  it('falls back to the pid when the group signal fails', () => {
    const signals = [];
    killTerminalProcess(
      {
        pid: 7,
        kill(sig) {
          signals.push(sig);
          return true;
        },
      },
      'linux',
      {
        signalGroup() {
          throw new Error('ESRCH');
        },
        schedule() {},
      }
    );
    assert.deepEqual(signals, ['SIGTERM']);
  });

  it('SIGKILLs the group only while the process has not exited', () => {
    const signals = [];
    let later = () => {};
    const proc = {
      pid: 5,
      kill() {
        return true;
      },
      exitCode: null,
      signalCode: null,
    };
    killTerminalProcess(proc, 'darwin', {
      signalGroup(pid, sig) {
        signals.push([pid, sig]);
      },
      schedule(_ms, fn) {
        later = fn;
      },
    });
    assert.deepEqual(signals, [[-5, 'SIGTERM']]);
    later();
    assert.deepEqual(signals[1], [-5, 'SIGKILL']);

    const afterExit = [];
    const done = {
      pid: 6,
      kill() {
        return true;
      },
      exitCode: null,
      signalCode: 'SIGTERM',
    };
    killTerminalProcess(done, 'linux', {
      signalGroup(pid, sig) {
        afterExit.push([pid, sig]);
      },
      schedule(_ms, fn) {
        fn();
      },
    });
    assert.deepEqual(afterExit, [[-6, 'SIGTERM']]);
  });

  it('uses taskkill /T /F on Windows and does not open a process group', () => {
    const calls = [];
    killTerminalProcess(
      {
        pid: 99,
        kill() {
          calls.push('fallback');
          return true;
        },
      },
      'win32',
      {
        spawnTaskkill(pid) {
          calls.push(taskkillArgs(pid));
        },
      }
    );
    assert.deepEqual(calls, [['/pid', '99', '/t', '/f']]);
    const spec = planTerminalSpawn('win32', 'npm', ['run', 'dev']);
    assert.equal(spec.shell, true);
    assert.equal(spec.detached, undefined);
  });

  it('kills the shell:true command, not only the shell', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const spec = planTerminalSpawn(process.platform, "sleep 60", undefined);
    assert.equal(spec.shell, true);
    assert.equal(spec.detached, true);
    const child = spawnPlanned(spec);
    let sleepPid = 0;
    try {
      sleepPid = await findSleepPid(child.pid);
      assert.ok(sleepPid > 0, 'sleep child did not start');
      assert.notEqual(sleepPid, child.pid);
      // SIGTERM on the group is enough for sleep. No follow-up SIGKILL.
      killTerminalProcess(child, process.platform, { schedule() {} });
      let dead = false;
      for (let i = 0; i < 40; i++) {
        if (!alive(child.pid) && !alive(sleepPid)) {
          dead = true;
          break;
        }
        await delay(25);
      }
      assert.equal(dead, true, `shell ${child.pid} or sleep ${sleepPid} still running`);
    } finally {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
      try {
        if (sleepPid) {
          process.kill(sleepPid, 'SIGKILL');
        }
      } catch {
        /* already gone */
      }
    }
  });
});

describe('terminalIdsToCancel', () => {
  it('includes background commands for this session only', () => {
    const terminals = [
      { id: 'bg', sessionId: 's1', exited: false },
      { id: 'done', sessionId: 's1', exited: true },
      { id: 'other', sessionId: 's2', exited: false },
      { id: 'live', sessionId: 's1', exited: false },
    ];
    assert.deepEqual(terminalIdsToCancel(terminals, 's1'), ['bg', 'live']);
    assert.deepEqual(terminalIdsToCancel(terminals, 's2'), ['other']);
    assert.deepEqual(terminalIdsToCancel(terminals, 'missing'), []);
    const unscoped = [{ id: 'orphan', sessionId: '', exited: false }];
    assert.deepEqual(terminalIdsToCancel(unscoped, 's1'), ['orphan']);
  });
});
