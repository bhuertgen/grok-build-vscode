import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { planTerminalSpawn, normalizeTerminalExitCode } = require('../dist-test/terminalSpawn.js');

const BASH_LINE = "/usr/bin/bash -lc 'echo ctrl-probe-ok'";

/** Same spawn shape as `ClientHandlers.createTerminal`. */
function spawnPlanned(spec) {
  return spec.shell
    ? spawn(spec.file, { shell: true })
    : spawn(spec.file, spec.args, { shell: false });
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
    }
  });

  it('keeps separate args as a direct argv spawn', () => {
    const spec = planTerminalSpawn('linux', '/usr/bin/bash', ['-lc', 'echo argv-ok']);
    assert.equal(spec.shell, false);
    assert.equal(spec.file, '/usr/bin/bash');
    assert.deepEqual(spec.args, ['-lc', 'echo argv-ok']);
  });

  it('does not re-split an argument that contains spaces', () => {
    const spec = planTerminalSpawn('darwin', 'printf', ['%s', 'hello world']);
    assert.equal(spec.shell, false);
    assert.deepEqual(spec.args, ['%s', 'hello world']);
  });

  it('on Windows still builds one shell command line', () => {
    const plain = planTerminalSpawn('win32', 'npm', ['test']);
    assert.equal(plain.shell, true);
    assert.equal(plain.windowsHide, true);
    assert.equal(plain.file, 'npm test');
    assert.deepEqual(plain.args, []);

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
