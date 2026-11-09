import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  displayTerminalCommand,
  formatBackgroundCommandsNotice,
  syncBackgroundCommandNotice,
  truncateCommand,
  BACKGROUND_NOTICE_ID,
} = require('../dist-test/backgroundCommands.js');

describe('displayTerminalCommand', () => {
  it('unwraps a CLI 1.0.77 bash -lc line', () => {
    assert.equal(
      displayTerminalCommand("/usr/bin/bash -lc 'npm run dev'"),
      'npm run dev'
    );
    assert.equal(
      displayTerminalCommand('/bin/bash', ['-lc', 'npm run dev']),
      'npm run dev'
    );
    assert.equal(
      displayTerminalCommand('/bin/zsh', ['-ilc', 'cargo watch -x check']),
      'cargo watch -x check'
    );
  });

  it('joins a direct argv and leaves non-shell commands intact', () => {
    assert.equal(displayTerminalCommand('npm', ['run', 'dev']), 'npm run dev');
    assert.equal(displayTerminalCommand('npm run dev', []), 'npm run dev');
    assert.equal(displayTerminalCommand('git', ['status']), 'git status');
  });

  it('unwraps cmd.exe /c and powershell -Command', () => {
    assert.equal(
      displayTerminalCommand('C:\\Windows\\System32\\cmd.exe', ['/c', 'npm run dev']),
      'npm run dev'
    );
    assert.equal(
      displayTerminalCommand('powershell.exe', ['-Command', 'npm run dev']),
      'npm run dev'
    );
  });

  it('collapses whitespace and falls back when the command is empty', () => {
    assert.equal(displayTerminalCommand('  npm \n run   dev  '), 'npm run dev');
    assert.equal(displayTerminalCommand('   ', []), 'command');
    assert.equal(displayTerminalCommand(undefined, undefined), 'command');
  });
});

describe('formatBackgroundCommandsNotice', () => {
  it('is absent when nothing is running', () => {
    assert.equal(formatBackgroundCommandsNotice([]), undefined);
    assert.equal(formatBackgroundCommandsNotice(['', '   ']), undefined);
  });

  it('uses the singular form for one command', () => {
    assert.equal(
      formatBackgroundCommandsNotice(['npm run dev']),
      'ℹ️ 1 background command still running: `npm run dev`'
    );
  });

  it('uses the plural form and lists every command when there are two or three', () => {
    assert.equal(
      formatBackgroundCommandsNotice(['npm run dev', 'cargo watch']),
      'ℹ️ 2 background commands still running: `npm run dev`, `cargo watch`'
    );
    assert.equal(
      formatBackgroundCommandsNotice(['a', 'b', 'c']),
      'ℹ️ 3 background commands still running: `a`, `b`, `c`'
    );
  });

  it('lists at most three and then and N more', () => {
    assert.equal(
      formatBackgroundCommandsNotice(['a', 'b', 'c', 'd']),
      'ℹ️ 4 background commands still running: `a`, `b`, `c` and 1 more'
    );
    assert.equal(
      formatBackgroundCommandsNotice(['a', 'b', 'c', 'd', 'e']),
      'ℹ️ 5 background commands still running: `a`, `b`, `c` and 2 more'
    );
  });

  it('truncates a long command and strips backticks so the span stays closed', () => {
    const long = 'npm run ' + 'x'.repeat(80);
    const notice = formatBackgroundCommandsNotice([long]);
    const shown = truncateCommand(long);
    assert.ok(shown.endsWith('…'));
    assert.equal(shown.length, 64);
    assert.equal(
      notice,
      `ℹ️ 1 background command still running: \`${shown}\``
    );
    assert.equal(
      formatBackgroundCommandsNotice(['echo `date`']),
      "ℹ️ 1 background command still running: `echo 'date'`"
    );
  });
});

describe('syncBackgroundCommandNotice', () => {
  it('does not create a line until a turn ends, then places it last', () => {
    const messages = [{ id: 'a', role: 'agent', content: 'hi', timestamp: 10 }];
    assert.equal(
      syncBackgroundCommandNotice(messages, ['npm run dev'], { placeAtEnd: false, now: 20 }),
      false
    );
    assert.equal(messages.length, 1);
    assert.equal(
      syncBackgroundCommandNotice(messages, ['npm run dev'], { placeAtEnd: true, now: 20 }),
      true
    );
    assert.equal(messages[1].id, BACKGROUND_NOTICE_ID);
    assert.equal(messages[1].role, 'system');
    assert.match(messages[1].content, /1 background command still running: `npm run dev`/);
    assert.ok(messages[1].timestamp > 10);
  });

  it('updates in place when a command exits and removes the line when none remain', () => {
    const messages = [
      { id: 'user', role: 'user', content: 'go', timestamp: 1 },
      {
        id: BACKGROUND_NOTICE_ID,
        role: 'system',
        content: 'ℹ️ 2 background commands still running: `a`, `b`',
        timestamp: 5,
      },
    ];
    assert.equal(
      syncBackgroundCommandNotice(messages, ['a'], { placeAtEnd: false, now: 40 }),
      true
    );
    assert.equal(messages.length, 2);
    assert.equal(messages[1].timestamp, 5);
    assert.match(messages[1].content, /1 background command still running: `a`/);
    assert.equal(
      syncBackgroundCommandNotice(messages, [], { placeAtEnd: false, now: 50 }),
      true
    );
    assert.equal(messages.length, 1);
    assert.equal(
      syncBackgroundCommandNotice(messages, [], { placeAtEnd: true, now: 60 }),
      false
    );
  });

  it('moves the line to the end of a later turn and leaves another chat alone', () => {
    const chat = [
      {
        id: BACKGROUND_NOTICE_ID,
        role: 'system',
        content: 'ℹ️ 1 background command still running: `old`',
        timestamp: 5,
      },
      { id: 'user2', role: 'user', content: 'next', timestamp: 30 },
    ];
    const other = [
      { id: 't', role: 'agent', content: 'untouched', timestamp: 1 },
    ];
    assert.equal(
      syncBackgroundCommandNotice(chat, ['npm run dev'], { placeAtEnd: true, now: 40 }),
      true
    );
    assert.equal(chat[chat.length - 1].id, BACKGROUND_NOTICE_ID);
    assert.match(chat[chat.length - 1].content, /`npm run dev`/);
    assert.ok(chat[chat.length - 1].timestamp > 30);
    assert.equal(other.length, 1);
    assert.equal(other[0].content, 'untouched');
  });
});
