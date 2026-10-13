/**
 * Pure helpers for ACP session config options (footer chips).
 * No vscode — unit-tested. Model stays on the dedicated model chip.
 */

export interface ConfigOptionChoice {
  value: string;
  name: string;
  description?: string;
}

export interface ConfigOptionLike {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type?: string;
  currentValue?: string | boolean;
  options?: ConfigOptionChoice[];
}

export type UiConfigControl =
  | {
      kind: 'select';
      id: string;
      name: string;
      description?: string;
      category?: string;
      currentValue: string;
      options: ConfigOptionChoice[];
    }
  | {
      kind: 'boolean';
      id: string;
      name: string;
      description?: string;
      category?: string;
      currentValue: boolean;
    };

const MODEL_ID = /^model$/i;

/** True when this option is the model picker (rendered separately). */
export function isModelConfigOption(opt: ConfigOptionLike): boolean {
  if (opt.category === 'model') {
    return true;
  }
  if (MODEL_ID.test(opt.id)) {
    return true;
  }
  return /model/i.test(opt.id) || /model/i.test(opt.name);
}

/** Effort / reasoning-effort style options get a short "Effort" label. */
export function isEffortConfigOption(opt: ConfigOptionLike): boolean {
  return (
    opt.category === 'thought' ||
    opt.category === 'thought_level' ||
    /effort|reasoning/i.test(opt.id) ||
    /effort|reasoning/i.test(opt.name)
  );
}

export function configOptionChipLabel(opt: ConfigOptionLike): string {
  if (isEffortConfigOption(opt)) {
    return 'Effort';
  }
  const name = (opt.name || opt.id || 'Option').trim();
  return name.length > 18 ? name.slice(0, 16) + '…' : name;
}

function currentString(opt: ConfigOptionLike): string {
  if (typeof opt.currentValue === 'string') {
    return opt.currentValue;
  }
  if (typeof opt.currentValue === 'boolean') {
    return opt.currentValue ? 'true' : 'false';
  }
  return '';
}

/**
 * Footer-ready controls. Unknown types (not select/boolean) are omitted
 * so the UI degrades gracefully.
 */
export function uiConfigControls(
  options: ConfigOptionLike[] | undefined | null
): UiConfigControl[] {
  if (!options?.length) {
    return [];
  }
  const out: UiConfigControl[] = [];
  for (const opt of options) {
    if (!opt?.id || isModelConfigOption(opt)) {
      continue;
    }
    const type = (opt.type || 'select').toLowerCase();
    if (type === 'boolean') {
      out.push({
        kind: 'boolean',
        id: opt.id,
        name: opt.name || opt.id,
        description: opt.description,
        category: opt.category,
        currentValue: opt.currentValue === true || opt.currentValue === 'true',
      });
      continue;
    }
    if (type === 'select') {
      const choices = (opt.options ?? []).filter((c) => c && c.value);
      if (!choices.length) {
        // Select with no advertised choices cannot be operated — hide.
        continue;
      }
      out.push({
        kind: 'select',
        id: opt.id,
        name: opt.name || opt.id,
        description: opt.description,
        category: opt.category,
        currentValue: currentString(opt),
        options: choices,
      });
      continue;
    }
    // number / custom / unknown → hidden (read-only would still be noise)
  }
  return out;
}

export function formatConfigValue(value: string | boolean): string {
  if (typeof value === 'boolean') {
    return value ? 'on' : 'off';
  }
  return value;
}

/**
 * Keep a previous option list when a later payload is empty, and keep an
 * Effort option if a later list only restates the model (or drops effort).
 * Used so the chip from the first session/new (or model_changed) payload
 * is not wiped before the header paints.
 */
export function retainConfigOptions<T extends ConfigOptionLike>(
  previous: T[] | undefined | null,
  incoming: T[] | undefined | null
): T[] | undefined {
  const prev = previous?.length ? previous : undefined;
  if (!incoming?.length) {
    return prev;
  }
  const incomingHasEffort = incoming.some((o) => isEffortConfigOption(o));
  if (!incomingHasEffort && prev) {
    const effort = prev.filter((o) => isEffortConfigOption(o));
    if (effort.length) {
      return [...incoming, ...effort];
    }
  }
  return incoming;
}

/**
 * Seed or update the effort option from a current value advertised at
 * session start (`model_changed.reasoning_effort` or configOptions).
 * Includes the known Grok choices so the chip is operable immediately;
 * a later full configOptions list replaces this.
 */
export function upsertEffortCurrent(
  options: ConfigOptionLike[] | undefined | null,
  effort: string
): ConfigOptionLike[] {
  const value = effort.trim();
  const list = options?.length ? options.map((o) => ({ ...o })) : [];
  const known = [
    { value: 'xhigh', name: 'Extra High' },
    { value: 'high', name: 'High' },
    { value: 'medium', name: 'Medium' },
    { value: 'low', name: 'Low' },
  ];
  const choices = known.some((c) => c.value === value)
    ? known
    : [{ value, name: value }, ...known];
  const idx = list.findIndex((o) => isEffortConfigOption(o));
  if (idx >= 0) {
    const cur = list[idx];
    const opts = cur.options?.length ? cur.options : choices;
    list[idx] = {
      ...cur,
      currentValue: value,
      type: cur.type || 'select',
      options: opts.some((c) => c.value === value)
        ? opts
        : [...opts, { value, name: value }],
    };
    return list;
  }
  list.push({
    id: 'reasoning_effort',
    name: 'Reasoning Effort',
    category: 'thought_level',
    type: 'select',
    currentValue: value,
    options: choices,
  });
  return list;
}
