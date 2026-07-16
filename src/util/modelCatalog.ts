/**
 * Resolve model IDs / display names from ~/.grok/models_cache.json when present.
 * Pure FS read — no vscode import (unit-testable with a path override).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  agentType?: string;
  systemPromptLabel?: string;
}

interface CacheFile {
  models?: Record<
    string,
    {
      info?: {
        id?: string;
        model?: string;
        name?: string;
        description?: string;
        agent_type?: string;
        system_prompt_label?: string;
        hidden?: boolean;
      };
    }
  >;
}

/** Minimal built-in list if models_cache.json is missing entirely. */
const FALLBACK: ModelInfo[] = [
  {
    id: 'grok-4.5',
    name: 'Grok 4.5',
    description: 'Default full model',
    agentType: 'grok-build-plan',
  },
  {
    id: 'grok-composer-2.5-fast',
    name: 'Composer 2.5',
    description: "Cursor's latest coding model (fast)",
    agentType: 'cursor',
  },
  {
    id: 'grok-4',
    name: 'Grok 4',
    description: 'Grok 4',
  },
  {
    id: 'grok-3',
    name: 'Grok 3',
    description: 'Grok 3',
  },
  {
    id: 'grok-code-fast-1',
    name: 'Grok Code Fast 1',
    description: 'Fast coding model',
  },
  {
    id: 'grok-build',
    name: 'Grok Build',
    description: 'Build-oriented model id',
  },
];

let cached: ModelInfo[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

export function defaultModelsCachePath(): string {
  return path.join(os.homedir(), '.grok', 'models_cache.json');
}

/** Clear in-memory cache (tests). */
export function clearModelCatalogCache(): void {
  cached = null;
  cachedAt = 0;
}

export function loadModelCatalog(cachePath?: string): ModelInfo[] {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS && !cachePath) {
    return cached;
  }
  const file = cachePath ?? defaultModelsCachePath();
  try {
    if (!fs.existsSync(file)) {
      cached = FALLBACK;
      cachedAt = now;
      return FALLBACK;
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as CacheFile;
    const out: ModelInfo[] = [];
    for (const [key, entry] of Object.entries(raw.models ?? {})) {
      const info = entry?.info;
      if (!info || info.hidden) {
        continue;
      }
      const id = String(info.id || info.model || key);
      out.push({
        id,
        name: String(info.name || id),
        description: info.description ? String(info.description) : undefined,
        agentType: info.agent_type ? String(info.agent_type) : undefined,
        systemPromptLabel: info.system_prompt_label
          ? String(info.system_prompt_label)
          : undefined,
      });
    }
    if (out.length === 0) {
      cached = FALLBACK;
      cachedAt = now;
      return FALLBACK;
    }
    // Prefer known defaults first
    out.sort((a, b) => {
      if (a.id === 'grok-4.5') {
        return -1;
      }
      if (b.id === 'grok-4.5') {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
    if (!cachePath) {
      cached = out;
      cachedAt = now;
    }
    return out;
  } catch {
    cached = FALLBACK;
    cachedAt = now;
    return FALLBACK;
  }
}

export function getModelInfo(id: string, cachePath?: string): ModelInfo | undefined {
  const list = loadModelCatalog(cachePath);
  return list.find((m) => m.id === id || m.name === id);
}

export function formatModelLabel(id: string, cachePath?: string): string {
  const info = getModelInfo(id, cachePath);
  if (!info) {
    return id;
  }
  if (info.name && info.name !== id) {
    return `${info.name} (\`${id}\`)`;
  }
  return `\`${id}\``;
}

/**
 * Meta block injected into each prompt so the agent cannot invent a wrong model id.
 * Inference still follows CLI `-m`; this only grounds self-report.
 */
export function sessionModelContextBlock(modelId: string | undefined): string {
  const id = (modelId || '').trim();
  if (!id) {
    return '';
  }
  const info = getModelInfo(id);
  const name = info?.name || id;
  const agentType = info?.agentType ? ` agent_type=${info.agentType}` : '';
  return [
    '[Grok Build session binding — trust this over free-form self-description]',
    `Active model id: ${id}`,
    `Display name: ${name}${agentType}`,
    'When asked which model you are, answer with this model id (and display name). Do not claim you are a different model, and do not say this id is "only for subagents" unless the user explicitly asked about subagent configuration.',
  ].join('\n');
}
