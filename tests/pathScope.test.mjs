import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { isInsideWorkspace, resolveScopePath, scopeKey } = require('../dist-test/pathScope.js');

const noLinks = { realpath: (p) => { throw new Error('ENOENT ' + p); } };

describe('pathScope: posix (#45)', () => {
  const o = { ...noLinks, platform: 'linux' };
  it('inside / equal / outside', () => {
    assert.equal(isInsideWorkspace('/ws/a/b.txt', ['/ws'], o), true);
    assert.equal(isInsideWorkspace('/ws', ['/ws'], o), true);
    assert.equal(isInsideWorkspace('/ws/', ['/ws'], o), true);
    assert.equal(isInsideWorkspace('/wsx/a.txt', ['/ws'], o), false, 'prefix is not containment');
    assert.equal(isInsideWorkspace('/etc/passwd', ['/ws'], o), false);
    assert.equal(isInsideWorkspace('/home/u/.ssh/id_rsa', ['/ws'], o), false);
  });
  it('.. traversal is resolved', () => {
    assert.equal(isInsideWorkspace('/ws/a/../../outside.txt', ['/ws'], o), false);
    assert.equal(isInsideWorkspace('/ws/a/../b.txt', ['/ws'], o), true);
  });
  it('posix is case-sensitive', () => {
    assert.equal(isInsideWorkspace('/WS/a.txt', ['/ws'], o), false);
  });
  it('multi-root', () => {
    assert.equal(isInsideWorkspace('/two/x.ts', ['/one', '/two'], o), true);
    assert.equal(isInsideWorkspace('/three/x.ts', ['/one', '/two'], o), false);
    assert.equal(isInsideWorkspace('/x', [], o), false);
    assert.equal(isInsideWorkspace('/x', [''], o), false);
  });
  it('filesystem root as workspace contains everything', () => {
    assert.equal(isInsideWorkspace('/any/file', ['/'], o), true);
  });
});

describe('pathScope: Windows (#45)', () => {
  const o = { ...noLinks, platform: 'win32' };
  it('drive letter and case differences', () => {
    assert.equal(isInsideWorkspace('c:\\Repo\\src\\a.ts', ['C:\\repo'], o), true);
    assert.equal(isInsideWorkspace('C:/REPO/src/a.ts', ['c:\\repo\\'], o), true);
    assert.equal(isInsideWorkspace('D:\\repo\\a.ts', ['C:\\repo'], o), false);
    assert.equal(isInsideWorkspace('C:\\repo2\\a.ts', ['C:\\repo'], o), false);
  });
  it('.. traversal', () => {
    assert.equal(isInsideWorkspace('C:\\repo\\..\\Users\\me\\.ssh\\id', ['C:\\repo'], o), false);
  });
  it('drive root as workspace', () => {
    assert.equal(isInsideWorkspace('C:\\x\\y', ['C:\\'], o), true);
    assert.equal(isInsideWorkspace('D:\\x', ['c:\\'], o), false);
  });
  it('scopeKey normalises', () => {
    assert.equal(scopeKey('C:/Repo/Sub/', 'win32'), 'c:\\repo\\sub');
    assert.equal(scopeKey('C:\\', 'win32'), 'c:\\');
    assert.equal(scopeKey('\\\\?\\C:\\', 'win32'), 'c:\\');
  });
  it('verbatim, device, slash, case, and trailing dot spell the same file', () => {
    const plain = 'C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd';
    const key = scopeKey(plain, 'win32');
    for (const spelling of [
      'c:\\users\\huertgen\\appdata\\local\\temp\\cl-zoom.cmd',
      'C:/Users/HUERTGEN/AppData/Local/Temp/CL-ZOOM.CMD',
      '\\\\?\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd',
      '//?/C:/Users/huertgen/AppData/Local/Temp/cl-zoom.cmd',
      '\\\\.\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd',
      'C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd.',
      'C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd ',
      'C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd.\\',
    ]) {
      assert.equal(scopeKey(spelling, 'win32'), key, spelling);
    }
    assert.equal(
      scopeKey('\\\\?\\UNC\\server\\share\\cl-zoom.cmd', 'win32'),
      scopeKey('\\\\server\\share\\cl-zoom.cmd', 'win32')
    );
    // A different file in the same Temp folder is not the same grant.
    assert.notEqual(
      scopeKey('C:\\Users\\huertgen\\AppData\\Local\\Temp\\other.cmd', 'win32'),
      key
    );
    // \\.\pipe stays a device path; it is not a drive.
    assert.notEqual(scopeKey('\\\\.\\pipe\\cl-zoom', 'win32'), scopeKey('pipe\\cl-zoom', 'win32'));
  });
  it('verbatim prefix does not push a workspace file outside or a temp file inside', () => {
    assert.equal(isInsideWorkspace('\\\\?\\C:\\repo\\src\\a.ts', ['C:\\repo'], o), true);
    assert.equal(isInsideWorkspace('//?/C:/REPO/src/a.ts', ['c:\\repo\\'], o), true);
    assert.equal(isInsideWorkspace('C:\\repo.\\src\\a.ts', ['C:\\repo'], o), true);
    assert.equal(isInsideWorkspace('\\\\?\\C:\\repo2\\a.ts', ['C:\\repo'], o), false);
    assert.equal(
      isInsideWorkspace('C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd', ['C:\\repo'], o),
      false
    );
    assert.equal(
      isInsideWorkspace('\\\\?\\C:\\Users\\huertgen\\AppData\\Local\\Temp\\cl-zoom.cmd', ['C:\\repo'], o),
      false
    );
    // Trailing-dot stripping must not undo `..` (repo. → repo, then .. leaves the root).
    assert.equal(isInsideWorkspace('C:\\repo.\\..\\Windows\\win.ini', ['C:\\repo'], o), false);
  });
  it('missing file and existing file share a key when realpath returns \\\\?\\', () => {
    const temp = 'C:\\Users\\huertgen\\AppData\\Local\\Temp';
    const file = `${temp}\\cl-zoom.cmd`;
    const asPlain = (p) => p.replace(/\//g, '\\').replace(/^\\\\\?\\/i, '');
    const realpathMissing = (p) => {
      if (asPlain(p).toLowerCase() === temp.toLowerCase()) {
        return `\\\\?\\${temp}`;
      }
      throw new Error('ENOENT');
    };
    const realpathExists = (p) => {
      const plain = asPlain(p).toLowerCase();
      if (plain === file.toLowerCase()) {
        return `\\\\?\\${file}`;
      }
      if (plain === temp.toLowerCase()) {
        return `\\\\?\\${temp}`;
      }
      throw new Error('ENOENT');
    };
    const optsMissing = { platform: 'win32', realpath: realpathMissing };
    const optsExists = { platform: 'win32', realpath: realpathExists };
    const before = resolveScopePath(file, optsMissing);
    const after = resolveScopePath(`\\\\?\\${file}`, optsExists);
    const forward = resolveScopePath('C:/Users/huertgen/AppData/Local/Temp/cl-zoom.cmd', optsExists);
    assert.equal(scopeKey(before, 'win32'), scopeKey(file, 'win32'));
    assert.equal(scopeKey(after, 'win32'), scopeKey(file, 'win32'));
    assert.equal(scopeKey(forward, 'win32'), scopeKey(file, 'win32'));
    assert.equal(before.includes('?'), false, 'dialog path drops the verbatim prefix');
  });
});

describe('pathScope: symlinks on the real filesystem (#45)', () => {
  let tmp, ws, outside;
  before(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gbv-scope-')));
    ws = path.join(tmp, 'ws');
    outside = path.join(tmp, 'outside');
    fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 's');
    fs.symlinkSync(outside, path.join(ws, 'link-out'));
    fs.symlinkSync(path.join(ws, 'src'), path.join(tmp, 'ws-alias'));
  });
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('symlink inside the workspace pointing outside is outside', () => {
    assert.equal(isInsideWorkspace(path.join(ws, 'link-out', 'secret.txt'), [ws]), false);
    assert.equal(isInsideWorkspace(path.join(ws, 'link-out', 'new-file.txt'), [ws]), false, 'new file under link');
  });
  it('new files inside the workspace are inside', () => {
    assert.equal(isInsideWorkspace(path.join(ws, 'src', 'new', 'deep.txt'), [ws]), true);
  });
  it('symlinked root resolves to its target', () => {
    assert.equal(isInsideWorkspace(path.join(ws, 'src', 'a.ts'), [path.join(tmp, 'ws-alias')]), true);
    assert.equal(isInsideWorkspace(path.join(tmp, 'ws-alias', 'a.ts'), [ws]), true);
  });
  it('resolveScopePath keeps the missing tail', () => {
    assert.equal(resolveScopePath(path.join(ws, 'link-out', 'x', 'y.txt')), path.join(outside, 'x', 'y.txt'));
  });
});
