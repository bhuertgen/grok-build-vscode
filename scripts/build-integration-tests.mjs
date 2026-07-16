/**
 * Bundle extension-host integration tests with esbuild.
 * Output: dist-test/integration/runTest.js + suite/*
 */
import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';

const outDir = path.join('dist-test', 'integration');
fs.mkdirSync(path.join(outDir, 'suite'), { recursive: true });

// Isolated empty-ish workspace for the test host
const ws = path.resolve('.vscode-test-workspace');
fs.mkdirSync(ws, { recursive: true });
const marker = path.join(ws, 'README-TEST.txt');
if (!fs.existsSync(marker)) {
  fs.writeFileSync(
    marker,
    'Isolated workspace for Grok Build integration tests.\n',
    'utf8'
  );
}

// Launcher (Node process — keeps deps external)
await esbuild.build({
  entryPoints: ['src/test/runTest.ts'],
  outfile: path.join(outDir, 'runTest.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
});

// Suite runs inside VS Code Extension Host (vscode external, mocha bundled)
await esbuild.build({
  entryPoints: [
    'src/test/suite/index.ts',
    'src/test/suite/extension.test.ts',
    'src/test/suite/sessionStore.test.ts',
    'src/test/suite/workspaceTrust.test.ts',
  ],
  outdir: path.join(outDir, 'suite'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  external: ['vscode'],
  logLevel: 'info',
});

console.log('[integration-bundle] ok →', outDir);
