import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findMessageLinks, isSafeIssueTemplate } = require('../dist-test/messageLinks.js');
const { resolveAssistantFile } = require('../dist-test/assistantPath.js');
const {
  forgeIssueTemplate,
  loadForgeIssueTemplate,
} = require('../dist-test/forgeRemote.js');

function paths(text) {
  return findMessageLinks(text)
    .filter((h) => h.kind === 'path')
    .map((h) => {
      const out = { text: h.text, path: h.path };
      if (h.line != null) out.line = h.line;
      if (h.column != null) out.column = h.column;
      if (h.endLine != null) out.endLine = h.endLine;
      return out;
    });
}

function prs(text) {
  return findMessageLinks(text)
    .filter((h) => h.kind === 'pr')
    .map((h) => ({ text: h.text, number: h.number }));
}

describe('findMessageLinks paths', () => {
  it('links a workspace-relative file', () => {
    assert.deepEqual(paths('See src/cli/compat.ts for the check.'), [
      { text: 'src/cli/compat.ts', path: 'src/cli/compat.ts' },
    ]);
  });

  it('links path:line and path:line:col', () => {
    assert.deepEqual(paths('Open src/cli/compat.ts:42 then src/cli/compat.ts:42:7.'), [
      { text: 'src/cli/compat.ts:42', path: 'src/cli/compat.ts', line: 42 },
      {
        text: 'src/cli/compat.ts:42:7',
        path: 'src/cli/compat.ts',
        line: 42,
        column: 7,
      },
    ]);
  });

  it('links a line range as start-end', () => {
    assert.deepEqual(paths('src/util/cwd.ts:10-12'), [
      {
        text: 'src/util/cwd.ts:10-12',
        path: 'src/util/cwd.ts',
        line: 10,
        endLine: 12,
      },
    ]);
  });

  it('links ./ ../ ~/ and dotfiles', () => {
    assert.deepEqual(paths('./README.md'), [
      { text: './README.md', path: './README.md' },
    ]);
    assert.deepEqual(paths('../../docs/en/USER_GUIDE.md'), [
      {
        text: '../../docs/en/USER_GUIDE.md',
        path: '../../docs/en/USER_GUIDE.md',
      },
    ]);
    assert.deepEqual(paths('~/proj/src/foo.ts'), [
      { text: '~/proj/src/foo.ts', path: '~/proj/src/foo.ts' },
    ]);
    assert.deepEqual(paths('src/.gitignore'), [
      { text: 'src/.gitignore', path: 'src/.gitignore' },
    ]);
  });

  it('links a path inside backticks without the backticks', () => {
    const text = 'Look at `src/cli/compat.ts:42:7` please';
    const hits = paths(text);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].text, 'src/cli/compat.ts:42:7');
    assert.equal(hits[0].line, 42);
    assert.equal(hits[0].column, 7);
    assert.equal(text.slice(text.indexOf('src'), text.indexOf('src') + hits[0].text.length), hits[0].text);
  });

  it('links scoped package files and windows paths', () => {
    assert.deepEqual(paths('node_modules/@types/node/index.d.ts'), [
      {
        text: 'node_modules/@types/node/index.d.ts',
        path: 'node_modules/@types/node/index.d.ts',
      },
    ]);
    const win = paths('Edit C:\\src\\foo.ts:10:2 now');
    assert.equal(win.length, 1);
    assert.equal(win[0].path, 'C:\\src\\foo.ts');
    assert.equal(win[0].line, 10);
    assert.equal(win[0].column, 2);
  });

  it('links absolute paths, including extensionless ones', () => {
    assert.deepEqual(paths('Open /workspace/src/cli/compat.ts:15'), [
      {
        text: '/workspace/src/cli/compat.ts:15',
        path: '/workspace/src/cli/compat.ts',
        line: 15,
      },
    ]);
    assert.deepEqual(paths('Binary at /usr/local/bin/grok'), [
      { text: '/usr/local/bin/grok', path: '/usr/local/bin/grok' },
    ]);
  });

  it('links a quoted path that contains spaces', () => {
    assert.deepEqual(paths('Open "src/my file.ts:4" next'), [
      { text: 'src/my file.ts:4', path: 'src/my file.ts', line: 4 },
    ]);
  });

  it('does not treat a sentence period as part of the path', () => {
    const hits = paths('Done in src/cli/compat.ts.');
    assert.equal(hits[0].text, 'src/cli/compat.ts');
    const lined = paths('Done in src/cli/compat.ts:42.');
    assert.equal(lined[0].text, 'src/cli/compat.ts:42');
    assert.equal(lined[0].line, 42);
  });

  it('links a path inside a sentence quote, not the whole sentence', () => {
    assert.deepEqual(paths('He said "see src/cli/compat.ts today".'), [
      { text: 'src/cli/compat.ts', path: 'src/cli/compat.ts' },
    ]);
  });
});

describe('findMessageLinks false positives', () => {
  it('skips bare names, versions, mime types, and branch-like tokens', () => {
    const samples = [
      'README.md',
      'compat.ts',
      'version 1.0.72',
      'v1.2.3',
      'lodash@4.17.21',
      'grok-build-vscode@0.4.1',
      'image/png',
      'owner/repo',
      'feat/clickable-paths',
      'foo/1.0.72',
      'application/json',
    ];
    for (const sample of samples) {
      assert.deepEqual(paths(sample), [], sample);
    }
  });

  it('does not link paths inside URLs or markdown https links', () => {
    assert.deepEqual(
      paths('https://github.com/bhuertgen/grok-build-vscode/blob/main/src/cli/compat.ts'),
      []
    );
    assert.deepEqual(paths('http://example.com/a/b.ts'), []);
    assert.deepEqual(
      paths('See [the docs](https://example.com/a/b.ts) for details.'),
      []
    );
    assert.deepEqual(
      paths('See [docs](https://example.com/a) and src/cli/compat.ts.'),
      [{ text: 'src/cli/compat.ts', path: 'src/cli/compat.ts' }]
    );
  });

  it('does not link inside fenced code, including an unclosed fence', () => {
    const fenced = 'Before\n```ts\nconst p = "src/cli/compat.ts";\n// see #65\n```\nAfter src/util/cwd.ts';
    assert.deepEqual(paths(fenced), [
      { text: 'src/util/cwd.ts', path: 'src/util/cwd.ts' },
    ]);
    assert.deepEqual(prs(fenced), []);
    const open = '```\nsrc/cli/compat.ts\n#65';
    assert.deepEqual(findMessageLinks(open), []);
  });

  it('does not link numeric URL tails or pull-request path segments', () => {
    assert.deepEqual(paths('/pull/123'), []);
    assert.deepEqual(paths('/issues/65'), []);
  });
});

describe('findMessageLinks pull requests', () => {
  it('links #123 and leaves hex colors, entities, and ranges alone', () => {
    assert.deepEqual(prs('Fixes #65 and #123.'), [
      { text: '#65', number: 65 },
      { text: '#123', number: 123 },
    ]);
    for (const sample of ['#fff', '#ffffff', '#123abc', '## Heading', '&#123;', '#12-34', '@src/file.ts#12-34']) {
      assert.deepEqual(prs(sample), [], sample);
    }
  });

  it('keeps a path and a PR in the same message', () => {
    const hits = findMessageLinks('See src/cli/compat.ts and #65.');
    assert.deepEqual(
      hits.map((h) => h.kind),
      ['path', 'pr']
    );
    assert.equal(hits[0].text, 'src/cli/compat.ts');
    assert.equal(hits[1].text, '#65');
  });

  it('does not overlap hits', () => {
    const hits = findMessageLinks('src/a.ts src/b.ts #1');
    let end = -1;
    for (const h of hits) {
      assert.ok(h.start >= end);
      assert.equal(h.text, 'src/a.ts src/b.ts #1'.slice(h.start, h.end));
      end = h.end;
    }
  });
});

describe('isSafeIssueTemplate', () => {
  it('accepts https forge templates and rejects anything else', () => {
    assert.equal(
      isSafeIssueTemplate('https://github.com/bhuertgen/grok-build-vscode/issues/{n}'),
      true
    );
    assert.equal(
      isSafeIssueTemplate('https://gitlab.com/group/sub/repo/-/issues/{n}'),
      true
    );
    assert.equal(isSafeIssueTemplate('http://github.com/o/r/issues/{n}'), false);
    assert.equal(isSafeIssueTemplate('https://evil.com/?q={n}'), false);
    assert.equal(isSafeIssueTemplate('https://github.com/o/r/issues/{n}/extra'), false);
  });
});

describe('resolveAssistantFile', () => {
  const files = new Set([
    '/work/src/cli/compat.ts',
    '/other/a.ts',
    '/etc/hosts',
    '/home/me/proj/a.ts',
  ]);
  const isFile = (p) => files.has(p);

  it('resolves a relative path against the workspace root', () => {
    assert.equal(
      resolveAssistantFile('src/cli/compat.ts', { roots: ['/work'], isFile, platform: 'linux' }),
      '/work/src/cli/compat.ts'
    );
    assert.equal(
      resolveAssistantFile('./src/cli/compat.ts', { roots: ['/work'], isFile, platform: 'linux' }),
      '/work/src/cli/compat.ts'
    );
  });

  it('resolves .. and opens an absolute path outside the workspace', () => {
    assert.equal(
      resolveAssistantFile('../../other/a.ts', { roots: ['/work/proj'], isFile, platform: 'linux' }),
      '/other/a.ts'
    );
    assert.equal(
      resolveAssistantFile('/etc/hosts', { roots: ['/work'], isFile, platform: 'linux' }),
      '/etc/hosts'
    );
  });

  it('tries a leading slash as workspace-relative when the absolute path is missing', () => {
    assert.equal(
      resolveAssistantFile('/src/cli/compat.ts', { roots: ['/work'], isFile, platform: 'linux' }),
      '/work/src/cli/compat.ts'
    );
  });

  it('returns null when nothing exists', () => {
    assert.equal(
      resolveAssistantFile('src/missing.ts', { roots: ['/work'], isFile, platform: 'linux' }),
      null
    );
    assert.equal(
      resolveAssistantFile('/no/such.ts', { roots: ['/work'], isFile, platform: 'linux' }),
      null
    );
    assert.equal(resolveAssistantFile('', { roots: ['/work'], isFile, platform: 'linux' }), null);
    assert.equal(
      resolveAssistantFile('https://example.com/a.ts', { roots: ['/work'], isFile, platform: 'linux' }),
      null
    );
  });

  it('expands ~ and accepts windows paths', () => {
    assert.equal(
      resolveAssistantFile('~/proj/a.ts', {
        roots: ['/work'],
        homedir: '/home/me',
        isFile,
        platform: 'linux',
      }),
      '/home/me/proj/a.ts'
    );
    const winFiles = new Set(['C:\\work\\src\\foo.ts', 'D:\\outside\\a.ts']);
    assert.equal(
      resolveAssistantFile('src\\foo.ts', {
        roots: ['C:\\work'],
        isFile: (p) => winFiles.has(p),
        platform: 'win32',
      }),
      'C:\\work\\src\\foo.ts'
    );
    assert.equal(
      resolveAssistantFile('D:\\outside\\a.ts', {
        roots: ['C:\\work'],
        isFile: (p) => winFiles.has(p),
        platform: 'win32',
      }),
      'D:\\outside\\a.ts'
    );
  });
});

describe('forgeIssueTemplate', () => {
  it('builds GitHub, GitLab, Bitbucket, and Gitea-style templates', () => {
    const gh = 'https://github.com/bhuertgen/grok-build-vscode/issues/{n}';
    assert.equal(forgeIssueTemplate('git@github.com:bhuertgen/grok-build-vscode.git'), gh);
    assert.equal(forgeIssueTemplate('https://github.com/bhuertgen/grok-build-vscode'), gh);
    assert.equal(forgeIssueTemplate('https://github.com/bhuertgen/grok-build-vscode.git'), gh);
    assert.equal(forgeIssueTemplate('ssh://git@github.com/bhuertgen/grok-build-vscode.git'), gh);
    assert.equal(
      forgeIssueTemplate('https://gitlab.com/group/sub/repo.git'),
      'https://gitlab.com/group/sub/repo/-/issues/{n}'
    );
    assert.equal(
      forgeIssueTemplate('git@gitlab.com:group/repo.git'),
      'https://gitlab.com/group/repo/-/issues/{n}'
    );
    assert.equal(
      forgeIssueTemplate('https://gitlab.example.com/group/repo.git'),
      'https://gitlab.example.com/group/repo/-/issues/{n}'
    );
    assert.equal(
      forgeIssueTemplate('https://bitbucket.org/owner/repo.git'),
      'https://bitbucket.org/owner/repo/issues/{n}'
    );
    assert.equal(
      forgeIssueTemplate('https://codeberg.org/owner/repo.git'),
      'https://codeberg.org/owner/repo/issues/{n}'
    );
  });

  it('returns null for remotes that are not a forge', () => {
    assert.equal(forgeIssueTemplate('/local/path/repo.git'), null);
    assert.equal(forgeIssueTemplate('origin'), null);
    assert.equal(forgeIssueTemplate(''), null);
    assert.equal(forgeIssueTemplate('https://github.com/onlyone'), null);
    assert.equal(forgeIssueTemplate('javascript:alert(1)'), null);
  });

  it('reads origin, then the first other remote', async () => {
    const calls = [];
    const run = async (args) => {
      calls.push(args.join(' '));
      if (args[1] === 'get-url' && args[2] === 'origin') {
        return 'git@github.com:acme/widgets.git\n';
      }
      return '';
    };
    assert.equal(
      await loadForgeIssueTemplate('/work', run),
      'https://github.com/acme/widgets/issues/{n}'
    );

    const runFallback = async (args) => {
      if (args[2] === 'origin') return '';
      if (args[0] === 'remote' && args.length === 1) return 'upstream\n';
      if (args[2] === 'upstream') return 'https://gitlab.com/acme/widgets.git';
      return '';
    };
    assert.equal(
      await loadForgeIssueTemplate('/work', runFallback),
      'https://gitlab.com/acme/widgets/-/issues/{n}'
    );
    assert.equal(await loadForgeIssueTemplate('/work', async () => ''), null);
    assert.equal(await loadForgeIssueTemplate('', async () => 'git@github.com:a/b.git'), null);
  });
});
