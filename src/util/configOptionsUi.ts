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
export const EFFORT_CATEGORIES: readonly string[] = ['thought_level', 'thought'];

/**
 * Category first (CLI 1.0.52 sends `thought_level`), id/name regex only as
 * fallback when the agent sends no category.
 */
export function isEffortConfigOption(opt: ConfigOptionLike): boolean {
  if (typeof opt.category === 'string' && opt.category) {
    if (EFFORT_CATEGORIES.includes(opt.category)) {
      return true;
    }
  }
  return /effort|reasoning/i.test(String(opt.id ?? '')) || /effort|reasoning/i.test(String(opt.name ?? ''));
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

/** One entry of Grok's `_x.ai/models/update` catalog. */
export interface GrokModelEntry {
  modelId: string;
  name?: string;
  description?: string;
  _meta?: {
    supportsReasoningEffort?: boolean;
    reasoningEffort?: string;
    reasoningEfforts?: Array<{
      id?: string;
      value?: string;
      label?: string;
      description?: string;
      default?: boolean;
    }>;
    [k: string]: unknown;
  };
}

/** Params of `_x.ai/models/update` (process-wide, no sessionId). */
export interface GrokModelsUpdate {
  currentModelId?: string;
  availableModels?: GrokModelEntry[];
}

/**
 * Refresh the model and Effort options from Grok's `_x.ai/models/update`
 * catalog (P2). On a cold start `session/new` returns a fallback catalog
 * without reasoning efforts and no `model_changed` follows, so the Effort
 * chip stayed missing until the next session; this notification carries
 * the real catalog.
 *
 * - Model option: choices = available models, current = `currentModelId`
 *   (or the existing current value if `currentModelId` is missing but valid).
 * - Effort option: choices from the current model's `reasoningEfforts`.
 *   A still-valid current value is kept (user override), otherwise the
 *   model's `reasoningEffort`, otherwise the choice flagged `default`.
 *   Removed when the current model does not support reasoning effort.
 * - Other options are kept unchanged. Returns `undefined` → nothing to do.
 */
export function applyModelsUpdate(
  options: ConfigOptionLike[] | undefined | null,
  update: GrokModelsUpdate | undefined | null
): { options: ConfigOptionLike[]; modelId?: string } | undefined {
  const models = (update?.availableModels ?? []).filter(
    (m) => m && typeof m.modelId === 'string' && m.modelId.trim()
  );
  if (!models.length) {
    return undefined;
  }
  const list = options?.length ? options.map((o) => ({ ...o })) : [];
  const modelIdx = list.findIndex((o) => isModelConfigOption(o));
  const prevModel = modelIdx >= 0 ? list[modelIdx] : undefined;
  const prevModelValue =
    typeof prevModel?.currentValue === 'string' ? prevModel.currentValue : undefined;
  const ids = models.map((m) => m.modelId);
  const announced = update?.currentModelId?.trim();
  const currentId =
    announced && ids.includes(announced)
      ? announced
      : prevModelValue && ids.includes(prevModelValue)
        ? prevModelValue
        : announced || ids[0];

  const modelOpt: ConfigOptionLike = {
    ...(prevModel ?? {}),
    id: prevModel?.id ?? 'model',
    name: prevModel?.name ?? 'Model',
    category: prevModel?.category ?? 'model',
    type: 'select',
    currentValue: currentId,
    options: models.map((m) => ({
      value: m.modelId,
      name: m.name?.trim() || m.modelId,
      ...(m.description ? { description: m.description } : {}),
    })),
  };
  if (modelIdx >= 0) {
    list[modelIdx] = modelOpt;
  } else {
    list.unshift(modelOpt);
  }

  const entry = models.find((m) => m.modelId === currentId);
  const meta = entry?._meta;
  const effortChoices: ConfigOptionChoice[] = [];
  let defaultEffort: string | undefined;
  for (const e of meta?.reasoningEfforts ?? []) {
    const value = String(e?.value ?? e?.id ?? '').trim();
    if (!value || effortChoices.some((c) => c.value === value)) {
      continue;
    }
    effortChoices.push({
      value,
      name: e.label?.trim() || value,
      ...(e.description ? { description: e.description } : {}),
    });
    if (e.default) {
      defaultEffort = value;
    }
  }
  const effortIdx = list.findIndex((o) => !isModelConfigOption(o) && isEffortConfigOption(o));
  const supports = meta?.supportsReasoningEffort !== false && effortChoices.length > 0;
  if (!supports) {
    if (effortIdx >= 0 && entry && meta?.supportsReasoningEffort === false) {
      list.splice(effortIdx, 1);
    }
    return { options: list, modelId: currentId };
  }
  const prevEffort = effortIdx >= 0 ? list[effortIdx] : undefined;
  const prevEffortValue =
    typeof prevEffort?.currentValue === 'string' ? prevEffort.currentValue : undefined;
  const has = (v: string | undefined): v is string =>
    !!v && effortChoices.some((c) => c.value === v);
  const effortValue = has(prevEffortValue)
    ? prevEffortValue
    : has(meta?.reasoningEffort)
      ? meta!.reasoningEffort!
      : has(defaultEffort)
        ? defaultEffort
        : effortChoices[0].value;
  const effortOpt: ConfigOptionLike = {
    ...(prevEffort ?? {}),
    id: prevEffort?.id ?? 'reasoning_effort',
    name: prevEffort?.name ?? 'Reasoning Effort',
    category: prevEffort?.category ?? 'thought_level',
    type: 'select',
    currentValue: effortValue,
    options: effortChoices,
  };
  if (effortIdx >= 0) {
    list[effortIdx] = effortOpt;
  } else {
    list.push(effortOpt);
  }
  return { options: list, modelId: currentId };
}

/** Fields Grok sends on `_x.ai/session_notification` `model_changed` / `model_switch`. */
export interface ModelChangedUpdate {
  sessionUpdate?: string;
  model_id?: string;
  modelId?: string;
  currentModelId?: string;
  reasoning_effort?: string;
  reasoningEffort?: string;
  /** Why the model moved. `model_switch` is the session/new setup, not a removal. */
  reason?: string;
  cause?: string;
  source?: string;
  availableModels?: GrokModelEntry[];
  available_models?: GrokModelEntry[];
}

export interface ApplyModelChangedInput {
  options: ConfigOptionLike[] | undefined | null;
  /** Model the session was using before this notification. */
  previousModel?: string;
  /** Last `_x.ai/models/update` catalog, when the notification has none. */
  catalog?: GrokModelEntry[] | null;
  update: ModelChangedUpdate | undefined | null;
  /**
   * True while the session is still starting. The first `model_changed`
   * (and every `model_switch`) only sets the model; it is not "removed".
   */
  initial: boolean;
}

export interface ApplyModelChangedResult {
  options: ConfigOptionLike[];
  modelId?: string;
  /** Set when an established model disappeared from the available list. */
  notice?: string;
}

/** `Model X is no longer available, switched to Y` */
export function modelRemovedNotice(previous: string, next: string): string {
  return `Model ${previous} is no longer available, switched to ${next}`;
}

function changedModelId(update: ModelChangedUpdate): string {
  const raw = update.model_id ?? update.modelId ?? update.currentModelId;
  return typeof raw === 'string' ? raw.trim() : '';
}

function changedEffort(update: ModelChangedUpdate): string {
  const raw = update.reasoning_effort ?? update.reasoningEffort;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Session start advertises the model with `model_switch` (or `reason:
 * "model_switch"`). That is the model being set, not a later removal.
 */
export function isModelSwitchSetup(update: ModelChangedUpdate | undefined | null): boolean {
  if (!update) {
    return false;
  }
  if (update.sessionUpdate === 'model_switch') {
    return true;
  }
  const reason = String(update.reason ?? update.cause ?? update.source ?? '')
    .trim()
    .toLowerCase();
  return reason === 'model_switch' || reason === 'initial' || reason === 'session_new';
}

function catalogFrom(
  update: ModelChangedUpdate,
  fallback: GrokModelEntry[] | null | undefined
): GrokModelEntry[] | undefined {
  const raw = update.availableModels ?? update.available_models;
  if (Array.isArray(raw) && raw.length) {
    return raw;
  }
  return fallback?.length ? fallback : undefined;
}

function modelIdsOf(
  options: ConfigOptionLike[],
  catalog: GrokModelEntry[] | undefined
): string[] {
  if (catalog?.length) {
    return catalog.map((m) => m.modelId).filter((id) => typeof id === 'string' && id.trim());
  }
  const model = options.find((o) => isModelConfigOption(o));
  return (model?.options ?? []).map((c) => c.value).filter((id) => !!id);
}

/** Point the model chip at `modelId` without inventing a one-entry catalog. */
function syncModelCurrent(options: ConfigOptionLike[], modelId: string): ConfigOptionLike[] {
  const list = options.map((o) => ({ ...o, options: o.options?.map((c) => ({ ...c })) }));
  const idx = list.findIndex((o) => isModelConfigOption(o));
  if (idx < 0) {
    list.unshift({
      id: 'model',
      name: 'Model',
      category: 'model',
      type: 'select',
      currentValue: modelId,
      options: [{ value: modelId, name: modelId }],
    });
    return list;
  }
  const opt = list[idx];
  const choices = opt.options ?? [];
  const has = choices.some((c) => c.value === modelId);
  list[idx] = {
    ...opt,
    type: opt.type || 'select',
    currentValue: modelId,
    options: !choices.length || has ? choices : [...choices, { value: modelId, name: modelId }],
  };
  return list;
}

function overlayEffort(options: ConfigOptionLike[], effort: string, hadCatalog: boolean): ConfigOptionLike[] {
  const idx = options.findIndex((o) => !isModelConfigOption(o) && isEffortConfigOption(o));
  if (idx < 0) {
    // The catalog said this model has no effort. Do not invent the chip.
    return hadCatalog ? options : upsertEffortCurrent(options, effort);
  }
  const choices = options[idx].options ?? [];
  if (choices.length && !choices.some((c) => c.value === effort)) {
    return options;
  }
  const next = options.map((o) => ({ ...o }));
  next[idx] = { ...next[idx], currentValue: effort };
  return next;
}

/**
 * Apply `model_changed` / `model_switch`.
 *
 * - Model chip `currentValue` follows the announced id.
 * - Effort choices are rebuilt for that model from the catalog
 *   (`applyModelsUpdate`). A `reasoning_effort` on the notification wins
 *   when the new model still offers it.
 * - When the session was already running and the previous model is gone
 *   from the list, `notice` is the info line to show. The session/new
 *   `model_switch` (and any update before the session has settled) does
 *   not notice: the model is only being set.
 * - No model id and no effort → `undefined` (caller leaves configOptions
 *   alone). A cold start that never sends `model_changed` does not call
 *   this; `configOptions` from `session/new` stay authoritative.
 */
export function applyModelChanged(
  input: ApplyModelChangedInput
): ApplyModelChangedResult | undefined {
  const update = input.update;
  if (!update) {
    return undefined;
  }
  const modelId = changedModelId(update);
  const effort = changedEffort(update);
  if (!modelId && !effort) {
    return undefined;
  }

  const catalog = catalogFrom(update, input.catalog);
  let options: ConfigOptionLike[] = input.options?.length
    ? input.options.map((o) => ({ ...o, options: o.options?.map((c) => ({ ...c })) }))
    : [];

  if (modelId && catalog?.length) {
    const applied = applyModelsUpdate(options, {
      currentModelId: modelId,
      availableModels: catalog,
    });
    if (applied) {
      options = applied.options;
    }
    // The announced id wins even when a stale catalog still prefers the old one.
    options = syncModelCurrent(options, modelId);
  } else if (modelId) {
    options = syncModelCurrent(options, modelId);
  }

  if (effort) {
    options = overlayEffort(options, effort, !!catalog?.length);
  }

  const previous = (input.previousModel ?? '').trim();
  const ids = modelIdsOf(options, catalog);
  const initial = input.initial || isModelSwitchSetup(update);
  let notice: string | undefined;
  if (
    !initial &&
    modelId &&
    previous &&
    previous !== modelId &&
    ids.length > 0 &&
    !ids.includes(previous)
  ) {
    notice = modelRemovedNotice(previous, modelId);
  }

  return { options, modelId: modelId || undefined, notice };
}
