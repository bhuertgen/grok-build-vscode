import * as vscode from 'vscode';
import { detectGrokCli, getInstallInstructions, type CliDetectionResult } from './detect';
import { getLogger } from '../util/logger';

const SKIP_KEY = 'grokBuild.cliOnboardSkipped';
const LAST_OK_KEY = 'grokBuild.cliLastOkPath';

export interface OnboardResult {
  ready: boolean;
  detection: CliDetectionResult;
}

/**
 * First-run / activation check: ensure the official Grok CLI is available.
 * Offers install guidance, path configuration, and retry — never blocks activation forever.
 */
export async function ensureCliReady(
  context: vscode.ExtensionContext,
  options?: { force?: boolean }
): Promise<OnboardResult> {
  const log = getLogger();
  let detection = await detectGrokCli();

  if (detection.ok) {
    await context.globalState.update(LAST_OK_KEY, detection.cliPath);
    await maybePersistResolvedPath(detection.cliPath, log);
    return { ready: true, detection };
  }

  if (!options?.force && context.globalState.get<boolean>(SKIP_KEY)) {
    log.warn('CLI missing; onboard previously skipped');
    return { ready: false, detection };
  }

  return showOnboardWizard(context, detection);
}

async function showOnboardWizard(
  context: vscode.ExtensionContext,
  detection: CliDetectionResult
): Promise<OnboardResult> {
  const log = getLogger();
  const install = getInstallInstructions();

  const choice = await vscode.window.showWarningMessage(
    'Grok Build CLI was not found. This extension uses the official `grok` binary via ACP (hybrid architecture) — it does not reimplement the agent.',
    { modal: true },
    'Install instructions',
    'Copy install command',
    'Set CLI path…',
    'Retry',
    'Skip for now'
  );

  switch (choice) {
    case 'Install instructions': {
      await showInstallPanel(install);
      // Re-check after user may have installed
      const again = await detectGrokCli();
      if (again.ok) {
        await context.globalState.update(LAST_OK_KEY, again.cliPath);
        void vscode.window.showInformationMessage(
          `Grok CLI ready${again.version ? `: ${again.version}` : ''}`
        );
        return { ready: true, detection: again };
      }
      return showOnboardWizard(context, again);
    }
    case 'Copy install command': {
      await vscode.env.clipboard.writeText(install.command);
      void vscode.window.showInformationMessage(
        'Install command copied. Run it in a terminal, then use “Grok Build: Check Grok CLI Status”.'
      );
      // Open integrated terminal with the command ready (best-effort)
      try {
        const term = vscode.window.createTerminal('Grok Build install');
        term.show();
        term.sendText(`# ${install.title}\n# ${install.command}`, false);
      } catch {
        /* ignore */
      }
      return { ready: false, detection };
    }
    case 'Set CLI path…': {
      const picked = await vscode.window.showInputBox({
        title: 'Path to grok executable',
        prompt: 'Absolute path to the Grok Build CLI binary',
        placeHolder:
          process.platform === 'win32'
            ? 'C:\\Users\\…\\grok.exe'
            : '/home/…/.local/bin/grok',
        ignoreFocusOut: true,
      });
      if (picked) {
        const cfg = vscode.workspace.getConfiguration('grokBuild');
        await cfg.update('cliPath', picked.trim(), vscode.ConfigurationTarget.Global);
        const again = await detectGrokCli(picked.trim());
        if (again.ok) {
          await context.globalState.update(LAST_OK_KEY, again.cliPath);
          void vscode.window.showInformationMessage(
            `Grok CLI ready${again.version ? `: ${again.version}` : ''}`
          );
          return { ready: true, detection: again };
        }
        void vscode.window.showErrorMessage(
          again.error ?? 'CLI still not found at that path.'
        );
        return showOnboardWizard(context, again);
      }
      return { ready: false, detection };
    }
    case 'Retry': {
      const again = await detectGrokCli();
      if (again.ok) {
        await context.globalState.update(LAST_OK_KEY, again.cliPath);
        void vscode.window.showInformationMessage(
          `Grok CLI ready${again.version ? `: ${again.version}` : ''}`
        );
        return { ready: true, detection: again };
      }
      return showOnboardWizard(context, again);
    }
    case 'Skip for now':
      await context.globalState.update(SKIP_KEY, true);
      log.warn('User skipped CLI onboard');
      return { ready: false, detection };
    default:
      return { ready: false, detection };
  }
}

async function showInstallPanel(
  install: ReturnType<typeof getInstallInstructions>
): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: [
      `# ${install.title}`,
      '',
      'Grok Build for VS Code is a **hybrid ACP client**.',
      'It does **not** reimplement the agent — it talks to the official CLI:',
      '',
      '```',
      'grok agent stdio',
      '```',
      '',
      '## Install',
      '',
      '```bash',
      install.command,
      '```',
      '',
      'Docs: ' + install.docsUrl,
      '',
      '## Notes',
      '',
      ...install.notes.map((n) => `- ${n}`),
      '',
      '## After install',
      '',
      '1. Restart VS Code if PATH changed',
      '2. Command Palette → **Grok Build: Check Grok CLI Status**',
      '3. Open the Grok Build sidebar and start a session',
      '',
    ].join('\n'),
  });
  await vscode.window.showTextDocument(doc, { preview: true });
  await vscode.env.openExternal(vscode.Uri.parse(install.docsUrl));
}

/** Reset skip flag so the wizard can show again. */
export async function resetCliOnboardSkip(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.globalState.update(SKIP_KEY, false);
}

/**
 * If we resolved an absolute path (not bare "grok"), persist it so future
 * spawns don't depend on PATH alone.
 */
async function maybePersistResolvedPath(
  cliPath: string,
  log: ReturnType<typeof getLogger>
): Promise<void> {
  if (!cliPath || cliPath === 'grok') {
    return;
  }
  const looksAbsolute =
    cliPath.includes('/') ||
    cliPath.includes('\\') ||
    /^[a-zA-Z]:/.test(cliPath);
  if (!looksAbsolute) {
    return;
  }
  const cfg = vscode.workspace.getConfiguration('grokBuild');
  const current = cfg.get<string>('cliPath', 'grok');
  if (current === cliPath) {
    return;
  }
  if (current !== 'grok' && current !== '') {
    // User already customized — don't overwrite
    log.info(`CLI found at ${cliPath}; keeping configured cliPath=${current}`);
    return;
  }
  try {
    await cfg.update('cliPath', cliPath, vscode.ConfigurationTarget.Global);
    log.info(`Persisted grokBuild.cliPath = ${cliPath}`);
  } catch (err) {
    log.warn('Could not persist cliPath', err);
  }
}
