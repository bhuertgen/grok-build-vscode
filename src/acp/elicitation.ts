/**
 * Pure helpers for ACP elicitation/create (+ complete).
 * No vscode dependency — unit-testable.
 */
import type {
  CreateElicitationRequest,
  CreateElicitationResponse,
  ElicitationContentValue,
  ElicitationPropertySchema,
  ElicitationSchema,
} from './types';

export function isFormElicitation(
  params: CreateElicitationRequest
): params is Extract<CreateElicitationRequest, { mode: 'form' }> {
  return params?.mode === 'form' && !!params && 'requestedSchema' in params;
}

export function isUrlElicitation(
  params: CreateElicitationRequest
): params is Extract<CreateElicitationRequest, { mode: 'url' }> {
  return (
    params?.mode === 'url' &&
    typeof (params as { url?: unknown }).url === 'string' &&
    typeof (params as { elicitationId?: unknown }).elicitationId === 'string'
  );
}

/** Extract hostname for URL consent UI (no navigation). */
export function extractUrlHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export function isSuspiciousUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      return true;
    }
    // Punycode / xn-- often used in lookalike domains
    if (u.hostname.includes('xn--')) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** Defaults from schema for pre-filling the form. */
export function collectSchemaDefaults(
  schema?: ElicitationSchema
): Record<string, ElicitationContentValue> {
  const out: Record<string, ElicitationContentValue> = {};
  if (!schema?.properties) {
    return out;
  }
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop && 'default' in prop && prop.default !== undefined) {
      const v = coerceContentValue(prop.default);
      if (v !== undefined) {
        out[key] = v;
      }
    }
  }
  return out;
}

function coerceContentValue(raw: unknown): ElicitationContentValue | undefined {
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return raw;
  }
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
    return raw as string[];
  }
  return undefined;
}

export interface FormValidationResult {
  ok: boolean;
  errors: string[];
  content: Record<string, ElicitationContentValue>;
}

/**
 * Lightweight client-side validation before accept.
 * Agents SHOULD re-validate; this avoids obvious empty/required misses.
 */
export function validateFormContent(
  schema: ElicitationSchema | undefined,
  content: Record<string, unknown>
): FormValidationResult {
  const errors: string[] = [];
  const out: Record<string, ElicitationContentValue> = {};
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);

  for (const key of required) {
    const raw = content[key];
    if (raw === undefined || raw === null || raw === '') {
      errors.push(`Missing required field: ${key}`);
    }
  }

  for (const [key, raw] of Object.entries(content)) {
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }
    const prop = props[key];
    const coerced = coerceField(prop, raw, key, errors);
    if (coerced !== undefined) {
      out[key] = coerced;
    }
  }

  return { ok: errors.length === 0, errors, content: out };
}

function coerceField(
  prop: ElicitationPropertySchema | undefined,
  raw: unknown,
  key: string,
  errors: string[]
): ElicitationContentValue | undefined {
  const type = prop?.type ?? typeof raw;
  if (type === 'boolean') {
    if (typeof raw === 'boolean') {
      return raw;
    }
    if (raw === 'true' || raw === 'false') {
      return raw === 'true';
    }
    errors.push(`Field ${key} must be boolean`);
    return undefined;
  }
  if (type === 'integer') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(n)) {
      errors.push(`Field ${key} must be an integer`);
      return undefined;
    }
    if (prop?.minimum != null && n < prop.minimum) {
      errors.push(`Field ${key} below minimum ${prop.minimum}`);
    }
    if (prop?.maximum != null && n > prop.maximum) {
      errors.push(`Field ${key} above maximum ${prop.maximum}`);
    }
    return n;
  }
  if (type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isNaN(n)) {
      errors.push(`Field ${key} must be a number`);
      return undefined;
    }
    if (prop?.minimum != null && n < prop.minimum) {
      errors.push(`Field ${key} below minimum ${prop.minimum}`);
    }
    if (prop?.maximum != null && n > prop.maximum) {
      errors.push(`Field ${key} above maximum ${prop.maximum}`);
    }
    return n;
  }
  if (type === 'array') {
    const arr = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? raw.split(',').map((s) => s.trim()).filter(Boolean)
        : null;
    if (!arr || !arr.every((x) => typeof x === 'string')) {
      errors.push(`Field ${key} must be a string array`);
      return undefined;
    }
    return arr as string[];
  }
  // string / enum / default
  const s = String(raw);
  if (prop?.enum && prop.enum.length && !prop.enum.includes(s)) {
    errors.push(`Field ${key} must be one of: ${prop.enum.join(', ')}`);
  }
  if (prop?.oneOf?.length) {
    const allowed = prop.oneOf.map((o) => o.const);
    if (!allowed.includes(s)) {
      errors.push(`Field ${key} must be one of: ${allowed.join(', ')}`);
    }
  }
  if (prop?.minLength != null && s.length < prop.minLength) {
    errors.push(`Field ${key} shorter than minLength ${prop.minLength}`);
  }
  if (prop?.maxLength != null && s.length > prop.maxLength) {
    errors.push(`Field ${key} longer than maxLength ${prop.maxLength}`);
  }
  if (prop?.pattern) {
    try {
      if (!new RegExp(prop.pattern).test(s)) {
        errors.push(`Field ${key} does not match pattern`);
      }
    } catch {
      /* ignore invalid pattern from agent */
    }
  }
  return s;
}

export function acceptForm(
  content: Record<string, ElicitationContentValue>
): CreateElicitationResponse {
  return { action: 'accept', content };
}

export function acceptUrl(): CreateElicitationResponse {
  return { action: 'accept' };
}

export function declineElicitation(): CreateElicitationResponse {
  return { action: 'decline' };
}

export function cancelElicitation(): CreateElicitationResponse {
  return { action: 'cancel' };
}

/** Normalize inbound JSON-RPC params into a typed request (best-effort). */
export function parseElicitationCreateParams(
  params: unknown
): CreateElicitationRequest | null {
  if (!params || typeof params !== 'object') {
    return null;
  }
  const p = params as Record<string, unknown>;
  const message = typeof p.message === 'string' ? p.message : '';
  const mode = typeof p.mode === 'string' ? p.mode : '';
  if (!mode || !message) {
    return null;
  }
  const base = {
    message,
    sessionId: typeof p.sessionId === 'string' ? p.sessionId : undefined,
    toolCallId: typeof p.toolCallId === 'string' ? p.toolCallId : undefined,
    requestId:
      typeof p.requestId === 'string' || typeof p.requestId === 'number'
        ? p.requestId
        : undefined,
    _meta:
      p._meta && typeof p._meta === 'object'
        ? (p._meta as Record<string, unknown>)
        : undefined,
  };
  if (mode === 'form') {
    return {
      ...base,
      mode: 'form',
      requestedSchema: (p.requestedSchema as ElicitationSchema) ?? {
        type: 'object',
        properties: {},
      },
    };
  }
  if (mode === 'url') {
    if (typeof p.url !== 'string' || typeof p.elicitationId !== 'string') {
      return null;
    }
    return {
      ...base,
      mode: 'url',
      url: p.url,
      elicitationId: p.elicitationId,
    };
  }
  return { ...base, mode, ...p } as CreateElicitationRequest;
}
