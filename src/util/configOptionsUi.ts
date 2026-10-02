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
