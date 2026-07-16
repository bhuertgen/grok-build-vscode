/**
 * Downloads VS Code and runs extension integration tests in Extension Host.
 * Entry: npm run test:integration
 */
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // dist-test/integration → repo root is ../..
    const extensionDevelopmentPath = path.resolve(__dirname, '../..');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Isolated folder so history/cwd tests don't touch real projects
    const testWorkspace = path.resolve(
      extensionDevelopmentPath,
      '.vscode-test-workspace'
    );

    console.log('Extension path:', extensionDevelopmentPath);
    console.log('Tests path:', extensionTestsPath);
    console.log('Workspace:', testWorkspace);

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspace,
        '--disable-extensions', // only our extension under test
        '--disable-workspace-trust', // avoid trust modal in CI/headless
      ],
    });
  } catch (err) {
    console.error('Failed to run integration tests:', err);
    process.exit(1);
  }
}

void main();
