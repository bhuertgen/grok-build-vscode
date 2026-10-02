/**
 * Automated smoke / static security checks for Grok Build VS Code.
 * Run: npm run smoke
 *
 * Exit 0 = all checks passed; non-zero = failures listed.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const failures = [];
const warnings = [];

function ok(name) {
  console.log(`  PASS  ${name}`);
}

function fail(name, detail) {
  console.log(`  FAIL  ${name}`);
  if (detail) {
    console.log(`        ${detail}`);
  }
  failures.push({ name, detail });
}

function warn(name, detail) {
  console.log(`  WARN  ${name}`);
  if (detail) {
    console.log(`        ${detail}`);
  }
  warnings.push({ name, detail });
}

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    cwd: root,
  });
  if (r.status !== 0) {
    fail(label, (r.stderr || r.stdout || '').slice(0, 500));
    return false;
  }
  ok(label);
  return true;
}

function read(p) {
  return fs.readFileSync(path.join(root, p), 'utf8');
}

function exists(p) {
  return fs.existsSync(path.join(root, p));
}

function walkFiles(dir, acc = []) {
  if (!exists(dir)) {
    return acc;
  }
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (name === 'node_modules' || name === 'dist' || name === 'dist-test') {
      continue;
    }
    const rel = path.join(dir, name).replace(/\\/g, '/');
    const full = path.join(root, rel);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walkFiles(rel, acc);
    } else if (/\.(ts|js|mjs|json|md|html|css)$/i.test(name)) {
      acc.push(rel);
    }
  }
  return acc;
}

console.log('\n=== Grok Build smoke-check ===\n');

// ── 1. Typecheck & build ───────────────────────────────────────────────────
console.log('1) Build');
run('npm', ['run', 'compile'], 'tsc --noEmit');
run('npm', ['run', 'build'], 'esbuild bundle');

// ── 2. Artifacts ───────────────────────────────────────────────────────────
console.log('\n2) Artifacts');
for (const p of [
  'dist/extension.js',
  'dist/webview/main.js',
  'dist/webview/styles.css',
  'dist/webview/index.html',
  'package.json',
]) {
  if (exists(p)) {
    ok(`exists ${p}`);
  } else {
    fail(`exists ${p}`);
  }
}

// ── 3. Webview syntax ──────────────────────────────────────────────────────
console.log('\n3) Webview');
try {
  // eslint-disable-next-line no-new-func
  new Function(read('webview/main.js'));
  ok('webview/main.js parses');
} catch (e) {
  fail('webview/main.js parses', String(e.message || e));
}

try {
  // eslint-disable-next-line no-new-func
  new Function(read('dist/webview/main.js'));
  ok('dist/webview/main.js parses');
} catch (e) {
  fail('dist/webview/main.js parses', String(e.message || e));
}

// ── 4. CSP & security markers ──────────────────────────────────────────────
console.log('\n4) Security markers');
const html = read('webview/index.html');
if (html.includes('Content-Security-Policy') && html.includes("default-src 'none'")) {
  ok('webview CSP default-src none');
} else {
  fail('webview CSP default-src none');
}

const srcFiles = walkFiles('src');
const srcBlob = srcFiles.map((f) => read(f)).join('\n');

if (srcBlob.includes('assertWorkspaceTrustedForWrite') || srcBlob.includes('isWorkspaceTrusted')) {
  ok('workspace trust gates present');
} else {
  fail('workspace trust gates present');
}

if (srcBlob.includes('request_permission') || srcBlob.includes('session/request_permission') || srcBlob.includes('permissionMode')) {
  ok('permission handling referenced');
} else {
  fail('permission handling referenced');
}

// ── 5. Secret scan (soft) ──────────────────────────────────────────────────
console.log('\n5) Secret scan (heuristic)');
const secretRe =
  /(?:sk-[a-zA-Z0-9]{20,}|api[_-]?key\s*[:=]\s*['"][^'"]+['"]|xai-[a-zA-Z0-9]{20,}|password\s*[:=]\s*['"][^'"]+['"])/i;
let secretHits = 0;
for (const f of [...srcFiles, 'webview/main.js', 'package.json']) {
  if (!exists(f)) {
    continue;
  }
  const text = read(f);
  if (secretRe.test(text)) {
    secretHits++;
    warn(`possible secret pattern in ${f}`);
  }
}
if (secretHits === 0) {
  ok('no obvious hardcoded secrets in src/webview');
}

// ── 6. Package contract ────────────────────────────────────────────────────
console.log('\n6) package.json contract');
const pkg = JSON.parse(read('package.json'));
if (pkg.main === './dist/extension.js') {
  ok('main → dist/extension.js');
} else {
  fail('main → dist/extension.js', pkg.main);
}
if (pkg.engines?.vscode) {
  ok(`engines.vscode ${pkg.engines.vscode}`);
} else {
  fail('engines.vscode set');
}
if (pkg.contributes?.commands?.length > 0) {
  ok(`commands contributed (${pkg.contributes.commands.length})`);
} else {
  fail('commands contributed');
}
if (pkg.activationEvents?.includes('onStartupFinished')) {
  ok('activation onStartupFinished');
} else {
  warn('activationEvents missing onStartupFinished');
}

// ── 7. Unit tests ──────────────────────────────────────────────────────────
console.log('\n7) Unit tests');
const bundle = spawnSync('node', ['scripts/build-test-bundle.mjs'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  cwd: root,
});
if (bundle.status !== 0) {
  fail('build-test-bundle', bundle.stderr || bundle.stdout);
} else {
  ok('build-test-bundle');
  const t = spawnSync(
    'node',
    [
      '--test',
      'tests/chatFormat.test.mjs',
      'tests/cwd.test.mjs',
      'tests/agentArgs.test.mjs',
      'tests/modelCatalog.test.mjs',
      'tests/compat.test.mjs',
    ],
    {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      cwd: root,
    }
  );
  process.stdout.write(t.stdout || '');
  if (t.stderr) {
    process.stderr.write(t.stderr);
  }
  if (t.status !== 0) {
    fail('node --test', `exit ${t.status}`);
  } else {
    ok('node --test suite');
  }
}

// ── 8. CLI compat contract (static + optional live probe) ──────────────────
console.log('\n8) CLI compat');
if (srcBlob.includes('CLI_HARD_MIN') && srcBlob.includes('assessCliCompat')) {
  ok('compat floors + assessCliCompat present');
} else {
  fail('compat floors + assessCliCompat present');
}
if (srcBlob.includes("compatLevel") || read('webview/main.js').includes('compatLevel')) {
  ok('webview/status expose compatLevel');
} else {
  fail('webview/status expose compatLevel');
}

// Live grok --version is optional on CI/dev boxes without the CLI.
{
  const live = spawnSync('grok', ['--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 8000,
  });
  if (live.error && live.error.code === 'ENOENT') {
    warn('live grok CLI', 'not on PATH — unit tests mock version detection; install for live smoke');
  } else if (live.status === 0 || (live.stdout || live.stderr || '').trim()) {
    const raw = ((live.stdout || '') + (live.stderr || '')).trim();
    ok(`live grok --version → ${raw.slice(0, 80)}`);
  } else {
    warn('live grok CLI', `exit ${live.status}: ${(live.stderr || live.stdout || '').slice(0, 200)}`);
  }
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n=== Summary ===');
console.log(`PASS checks done; WARN=${warnings.length}; FAIL=${failures.length}`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(` - ${f.name}${f.detail ? ': ' + f.detail.split('\n')[0] : ''}`);
  }
  process.exit(1);
}
console.log('\nAll smoke checks passed.\n');
process.exit(0);
