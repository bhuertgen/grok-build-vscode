/**
 * Re-detect the Grok CLI when settings that select the binary change.
 * Pure module (no vscode) — unit-tested.
 *
 * Background: CLI detection (`grok --version` → header version, compat
 * banner, update check) ran once at activation. Agent spawns already read
 * `grokBuild.cliPath` fresh, so after editing the path the next session ran
 * the new binary while the header still showed the old version until
 * "Developer: Reload Window".
 */

/** Settings whose change requires a new CLI detection. */
export const CLI_DETECTION_SETTINGS: readonly string[] = ['grokBuild.cliPath'];

/** `affects` = `(s) => event.affectsConfiguration(s)` */
export function affectsCliDetection(affects: (section: string) => boolean): boolean {
  return CLI_DETECTION_SETTINGS.some((s) => affects(s));
}

/**
 * Debounced, serialized runner: bursts of config events (settings.json saves)
 * trigger one detection; a change during a running detection schedules one
 * more run afterwards so the final path always wins.
 *
 * After dispose() nothing runs any more (#49): trigger() is a no-op, a
 * pending follow-up run is dropped, and the AbortSignal passed to `run` is
 * aborted so an in-flight detection can skip its UI updates.
 */
export function createCliRedetector(
  run: (signal: AbortSignal) => Promise<void>,
  delayMs = 300
): { trigger(): void; dispose(): void; readonly disposed: boolean } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pending = false;
  let disposed = false;
  const abort = new AbortController();
  const exec = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await run(abort.signal);
    } catch {
      // detection errors are reported through CliStatus by `run`
    } finally {
      running = false;
    }
    if (pending && !disposed) {
      pending = false;
      await exec();
    }
  };
  return {
    trigger() {
      if (disposed) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        void exec();
      }, delayMs);
    },
    dispose() {
      disposed = true;
      pending = false;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      abort.abort();
    },
    get disposed() {
      return disposed;
    },
  };
}
