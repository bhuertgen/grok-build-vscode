/**
 * Grok ACP ext_method / ext notifications that the TUI already understands.
 * Pure parsers — no vscode. Unknown shapes return null so the caller can
 * ignore them without a warning.
 *
 * - `ext_method` `x.ai/exit_plan_mode` — plan approval (CLI 1.0.85 attention)
 * - `ext_method` `x.ai/mcp/elicit` — MCP input, same card family as elicitation
 * - `ext_method` `x.ai/ask_user_question` — question card
 * - notification `x.ai/mcp_initialized` `{ mcpToolCount, elapsedMs }`
 * - notification `x.ai/session/setup` phase `model_catalog` (and any other phase)
 */

import type { CreateElicitationRequest, CreateElicitationResponse } from './types';
import { parseElicitationCreateParams } from './elicitation';

export interface ExtMethodCall {
  method: string;
  params: unknown;
}

export function parseExtMethod(raw: unknown): ExtMethodCall | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const method = (raw as { method?: unknown }).method;
  if (typeof method !== 'string' || !method.trim()) {
    return null;
  }
  const params = (raw as { params?: unknown }).params ?? {};
  return { method: method.trim().replace(/^_/, ''), params };
}

export interface PlanApprovalRequest {
  sessionId: string;
  toolCallId: string;
  planContent?: string;
}

export function parsePlanApproval(params: unknown): PlanApprovalRequest | null {
  if (!params || typeof params !== 'object') {
    return null;
  }
  const p = params as { sessionId?: unknown; toolCallId?: unknown; planContent?: unknown };
  if (typeof p.sessionId !== 'string' || !p.sessionId.trim()) {
    return null;
  }
  if (typeof p.toolCallId !== 'string' || !p.toolCallId.trim()) {
    return null;
  }
  const planContent = typeof p.planContent === 'string' ? p.planContent : undefined;
  return {
    sessionId: p.sessionId,
    toolCallId: p.toolCallId,
    planContent,
  };
}

export type PlanApprovalOutcome = 'approved' | 'cancelled' | 'abandoned';

export interface PlanApprovalResponse {
  outcome: PlanApprovalOutcome;
  feedback?: string;
}

/** MCP elicit uses the elicitation card. Prefix the server name the way the CLI does. */
export function mcpElicitAsElicitation(params: unknown): CreateElicitationRequest | null {
  if (!params || typeof params !== 'object') {
    return null;
  }
  const p = params as Record<string, unknown>;
  const server = typeof p.serverName === 'string' ? p.serverName.trim() : '';
  const message = typeof p.message === 'string' ? p.message : '';
  const prefixed =
    server && message && !message.startsWith('MCP server ')
      ? `MCP server ${server}: ${message}`
      : message;
  return parseElicitationCreateParams({ ...p, message: prefixed });
}

export function elicitationToMcpResult(response: CreateElicitationResponse): {
  outcome: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown> | null;
} {
  if (response.action === 'accept') {
    return response.content != null
      ? { outcome: 'accept', content: response.content }
      : { outcome: 'accept' };
  }
  if (response.action === 'decline') {
    return { outcome: 'decline' };
  }
  return { outcome: 'cancel' };
}

export interface AskUserQuestionItem {
  question: string;
  options: string[];
}

export interface AskUserQuestionRequest {
  sessionId?: string;
  questions: AskUserQuestionItem[];
}

export function parseAskUserQuestion(params: unknown): AskUserQuestionRequest | null {
  if (!params || typeof params !== 'object') {
    return null;
  }
  const p = params as { sessionId?: unknown; questions?: unknown };
  if (!Array.isArray(p.questions) || p.questions.length === 0) {
    return null;
  }
  const questions: AskUserQuestionItem[] = [];
  for (const raw of p.questions) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const q = raw as { question?: unknown; options?: unknown };
    const question = typeof q.question === 'string' ? q.question.trim() : '';
    if (!question) {
      continue;
    }
    const options: string[] = [];
    if (Array.isArray(q.options)) {
      for (const opt of q.options) {
        if (!opt || typeof opt !== 'object') {
          continue;
        }
        const label = (opt as { label?: unknown }).label;
        if (typeof label === 'string' && label.trim()) {
          options.push(label.trim());
        }
      }
    }
    questions.push({ question, options });
  }
  if (!questions.length) {
    return null;
  }
  return {
    sessionId: typeof p.sessionId === 'string' ? p.sessionId : undefined,
    questions,
  };
}

export type AskUserQuestionResponse =
  | { outcome: 'accepted'; answers: Record<string, string[]> }
  | { outcome: 'cancelled' };

export function acceptedQuestion(
  answers: Record<string, string[]>
): AskUserQuestionResponse {
  return { outcome: 'accepted', answers };
}

export function cancelledQuestion(): AskUserQuestionResponse {
  return { outcome: 'cancelled' };
}

export interface McpInitializedNotice {
  sessionId?: string;
  mcpToolCount: number;
  elapsedMs: number;
}

export function parseMcpInitialized(params: unknown): McpInitializedNotice | null {
  if (!params || typeof params !== 'object') {
    return null;
  }
  const p = params as { sessionId?: unknown; mcpToolCount?: unknown; elapsedMs?: unknown };
  const mcpToolCount = finiteNumber(p.mcpToolCount);
  const elapsedMs = finiteNumber(p.elapsedMs);
  if (mcpToolCount === undefined || elapsedMs === undefined) {
    return null;
  }
  return {
    sessionId: typeof p.sessionId === 'string' ? p.sessionId : undefined,
    mcpToolCount,
    elapsedMs,
  };
}

export function formatMcpInitializedLog(notice: McpInitializedNotice): string {
  const tools = notice.mcpToolCount === 1 ? '1 tool' : `${notice.mcpToolCount} tools`;
  return `MCP initialized: ${tools} in ${notice.elapsedMs}ms`;
}

export interface SetupPhaseNotice {
  phase: string;
  method?: string;
  sessionId?: string;
}

/** Any setup phase, including `model_catalog`, is known and not a warning. */
export function parseSetupPhase(params: unknown): SetupPhaseNotice | null {
  if (!params || typeof params !== 'object') {
    return null;
  }
  const p = params as { phase?: unknown; method?: unknown; sessionId?: unknown };
  if (typeof p.phase !== 'string' || !p.phase.trim()) {
    return null;
  }
  return {
    phase: p.phase.trim(),
    method: typeof p.method === 'string' ? p.method : undefined,
    sessionId: typeof p.sessionId === 'string' ? p.sessionId : undefined,
  };
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}
