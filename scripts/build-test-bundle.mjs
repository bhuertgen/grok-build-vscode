/**
 * Bundle pure unit-test entrypoints with esbuild (no vscode dependency).
 */
import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';

const outDir = path.join('dist-test');
fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: {
    chatFormat: 'src/util/chatFormat.ts',
    cwd: 'src/util/cwd.ts',
    agentArgs: 'src/util/agentArgs.ts',
    modelCatalog: 'src/util/modelCatalog.ts',
    compat: 'src/cli/compat.ts',
    semver: 'src/cli/semver.ts',
    memory: 'src/util/memory.ts',
    elicitation: 'src/acp/elicitation.ts',
    configOptionsUi: 'src/util/configOptionsUi.ts',
    fileRangeMention: 'src/util/fileRangeMention.ts',
    turnOutcome: 'src/util/turnOutcome.ts',
    unreadable: 'src/util/unreadable.ts',
    permissionOutcome: 'src/util/permissionOutcome.ts',
    initialMode: 'src/util/initialMode.ts',
    cliRefresh: 'src/cli/cliRefresh.ts',
  },
  outdir: outDir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: false,
  logLevel: 'silent',
});

// scrollStick.test.mjs is pure ESM (no vscode) — no bundle entry; covered by test:unit.
if (!fs.existsSync('tests/scrollStick.test.mjs')) {
  console.error('[test-bundle] missing tests/scrollStick.test.mjs');
  process.exit(1);
}

console.log('[test-bundle] ok →', outDir);
