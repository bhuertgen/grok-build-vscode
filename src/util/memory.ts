/**
 * Memory setting → Grok CLI mapping.
 *
 * Since CLI 1.0.51 memory is a single on/off switch (`[memory] enabled`).
 * `grok agent` (verified 1.0.52) rejects `--no-memory` and `--experimental-memory`,
 * so the extension maps the setting to the documented env var `GROK_MEMORY`
 * (`1` = on, `0` = off) and never passes a memory CLI flag.
 */
export type MemoryMode = 'default' | 'on' | 'off';

export interface MemorySettings {
  /** New single setting `grokBuild.memory`. */
  memory?: string | null;
  /** Deprecated `grokBuild.noMemory`. */
  noMemory?: boolean;
  /** Deprecated `grokBuild.experimentalMemory`. */
  experimentalMemory?: boolean;
}

/** Resolve effective mode. Explicit `memory` wins; else legacy (noMemory beats experimentalMemory). */
export function resolveMemoryMode(s: MemorySettings): MemoryMode {
  if (s.memory === 'on' || s.memory === 'off') {
    return s.memory;
  }
  if (s.noMemory) {
    return 'off';
  }
  if (s.experimentalMemory) {
    return 'on';
  }
  return 'default';
}

/** Apply mode to a spawn env (mutates + returns). `default` leaves GROK_MEMORY untouched. */
export function applyMemoryEnv(
  env: Record<string, string | undefined>,
  mode: MemoryMode
): Record<string, string | undefined> {
  if (mode === 'on') {
    env.GROK_MEMORY = '1';
  } else if (mode === 'off') {
    env.GROK_MEMORY = '0';
  }
  return env;
}
