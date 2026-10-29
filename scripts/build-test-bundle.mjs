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
    messageLinks: 'src/util/messageLinks.ts',
    assistantPath: 'src/util/assistantPath.ts',
    forgeRemote: 'src/util/forgeRemote.ts',
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
    cliPath: 'src/cli/cliPath.ts',
    cliStatus: 'src/cli/cliStatus.ts',
    cliRecovery: 'src/util/cliRecovery.ts',
    locale: 'src/util/locale.ts',
    textSlice: 'src/util/textSlice.ts',
    permissionKind: 'src/util/permissionKind.ts',
    pathScope: 'src/util/pathScope.ts',
    outsideAccess: 'src/util/outsideAccess.ts',
    panelRevive: 'src/util/panelRevive.ts',
    openTabs: 'src/session/openTabs.ts',
    sessionStore: 'src/session/sessionStore.ts',
    grokFolderTrust: 'src/util/grokFolderTrust.ts',
    restoreNotices: 'src/util/restoreNotices.ts',
    transport: 'src/acp/transport.ts',
    distribution: 'src/util/distribution.ts',
  },
  outdir: outDir,
  // sessionStore (and its logger/config imports) get a tiny vscode stub
  alias: { vscode: './tests/stubs/vscode.cjs' },
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
