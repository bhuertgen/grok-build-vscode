/**
 * CLI notices that must not warn: mcp_initialized and setup phase model_catalog,
 * plus ext_method shapes for plan approval, MCP input, and question cards.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  elicitationToMcpResult,
  formatMcpInitializedLog,
  mcpElicitAsElicitation,
  parseAskUserQuestion,
  parseExtMethod,
  parseMcpInitialized,
  parsePlanApproval,
  parseSetupPhase,
} = require('../dist-test/extMethod.js');

describe('mcp_initialized', () => {
  it('reads tool count and elapsed time and formats an output-channel line', () => {
    const notice = parseMcpInitialized({
      sessionId: 'sess-1',
      mcpToolCount: 4,
      elapsedMs: 120,
    });
    assert.deepEqual(notice, { sessionId: 'sess-1', mcpToolCount: 4, elapsedMs: 120 });
    assert.equal(formatMcpInitializedLog(notice), 'MCP initialized: 4 tools in 120ms');
    assert.equal(
      formatMcpInitializedLog({ mcpToolCount: 1, elapsedMs: 8 }),
      'MCP initialized: 1 tool in 8ms'
    );
  });

  it('ignores a payload without counts', () => {
    assert.equal(parseMcpInitialized({ sessionId: 's' }), null);
    assert.equal(parseMcpInitialized(null), null);
  });
});

describe('session setup phases', () => {
  it('accepts model_catalog and any other phase without treating it as unknown', () => {
    assert.deepEqual(parseSetupPhase({ method: 'session/new', phase: 'model_catalog', sessionId: 's' }), {
      method: 'session/new',
      phase: 'model_catalog',
      sessionId: 's',
    });
    assert.equal(parseSetupPhase({ phase: 'mcp_merge' }).phase, 'mcp_merge');
    assert.equal(parseSetupPhase({}), null);
    assert.equal(parseSetupPhase({ phase: '   ' }), null);
  });
});

describe('ext_method', () => {
  it('parses plan approval', () => {
    const call = parseExtMethod({
      method: '_x.ai/exit_plan_mode',
      params: { sessionId: 's', toolCallId: 't', planContent: '# Plan' },
    });
    assert.equal(call.method, 'x.ai/exit_plan_mode');
    assert.deepEqual(parsePlanApproval(call.params), {
      sessionId: 's',
      toolCallId: 't',
      planContent: '# Plan',
    });
    assert.equal(parsePlanApproval({ sessionId: 's' }), null);
  });

  it('maps MCP input onto an elicitation and back', () => {
    const elicit = mcpElicitAsElicitation({
      sessionId: 's',
      toolCallId: 'm1',
      serverName: 'github',
      message: 'Need a token',
      mode: 'form',
      requestedSchema: { type: 'object', properties: { token: { type: 'string' } } },
    });
    assert.equal(elicit.mode, 'form');
    assert.match(elicit.message, /^MCP server github: Need a token$/);
    assert.deepEqual(elicitationToMcpResult({ action: 'accept', content: { token: 'x' } }), {
      outcome: 'accept',
      content: { token: 'x' },
    });
    assert.deepEqual(elicitationToMcpResult({ action: 'decline' }), { outcome: 'decline' });
    assert.deepEqual(elicitationToMcpResult({ action: 'cancel' }), { outcome: 'cancel' });
  });

  it('parses a question card', () => {
    const parsed = parseAskUserQuestion({
      sessionId: 's',
      questions: [
        {
          question: 'Which database?',
          options: [
            { label: 'Postgres', description: 'Primary' },
            { label: 'SQLite', description: 'Local' },
          ],
        },
      ],
    });
    assert.equal(parsed.sessionId, 's');
    assert.deepEqual(parsed.questions, [
      { question: 'Which database?', options: ['Postgres', 'SQLite'] },
    ]);
    assert.equal(parseAskUserQuestion({ questions: [] }), null);
  });
});

describe('client handles the notices quietly', () => {
  const src = fs.readFileSync(new URL('../src/acp/client.ts', import.meta.url), 'utf8');

  it('logs mcp_initialized and accepts model_catalog setup without a warning', () => {
    assert.match(src, /mcp_initialized/);
    assert.match(src, /formatMcpInitializedLog/);
    assert.match(src, /model_catalog/);
    assert.match(src, /parseSetupPhase/);
    assert.equal(/log\.warn\([^)]*mcp_initialized/.test(src), false);
    assert.equal(/log\.warn\([^)]*model_catalog/.test(src), false);
  });
});
