import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseHookAsk, formatHookAskLabel, permissionRequestFields } = require('../dist-test/hookAsk.js');
const { denyHookAskOutcome, pickAutoAllowOption } = require('../dist-test/permissionOutcome.js');

/**
 * Verbatim session/request_permission from Probe C2 (CLI alpha 1.0.77,
 * PreToolUse {"decision":"ask","reason":"Confirm this deploy"}).
 * Session ids in the capture were truncated; the hook fields are exact.
 */
const C2 = {
  sessionId: '01a1ab08-da5e-0000-0000-000000000000',
  toolCall: {
    toolCallId: 'call-0',
    kind: 'execute',
    title:
      "Execute `echo deploy-probe` — hook 'project/probe:pre_tool_use[0].hooks[0]' asks: Confirm this deploy",
    rawInput: {
      variant: 'Bash',
      command: 'echo deploy-probe',
      description: 'Echo the deploy-probe token',
      is_background: false,
    },
    _meta: {
      'x.ai/tool': {
        version: 1,
        name: 'run_terminal_command',
        kind: 'execute',
        namespace: 'grok_build',
        label: 'Run Command',
        read_only: false,
        input: {
          command: 'echo deploy-probe',
          description: 'Echo the deploy-probe token',
        },
      },
      'x.ai/requestingSessionId': '01a1ab08-da5e-0000-0000-000000000000',
    },
  },
  options: [
    { optionId: 'always-allow', name: "Yes, and don't ask again for bash commands", kind: 'allow_always' },
    { optionId: 'allow-once', name: 'Yes, proceed', kind: 'allow_once' },
    { optionId: 'reject-once', name: 'No, and tell Grok what to do differently', kind: 'reject_once' },
    { optionId: 'reject-always', name: "No, and don't ask again for this command", kind: 'reject_always' },
  ],
  _meta: {
    hookAsk: {
      hookName: 'project/probe:pre_tool_use[0].hooks[0]',
      reason: 'Confirm this deploy',
    },
  },
};

describe('hook ask from Probe C2 params._meta (#30)', () => {
  it('reads hookName and reason; shortHookName drops the event suffix', () => {
    const ask = parseHookAsk(C2._meta);
    assert.deepEqual(ask, {
      hookName: 'project/probe:pre_tool_use[0].hooks[0]',
      reason: 'Confirm this deploy',
      shortName: 'project/probe',
      label: 'Hook `project/probe` asks: Confirm this deploy',
    });
  });

  it('does not treat toolCall._meta (x.ai/tool) as a hook ask', () => {
    assert.equal(parseHookAsk(C2.toolCall._meta), undefined);
    assert.equal(parseHookAsk(undefined), undefined);
    assert.equal(parseHookAsk({}), undefined);
    assert.equal(parseHookAsk({ hookAsk: {} }), undefined);
    assert.equal(parseHookAsk({ hookAsk: 'Confirm this deploy' }), undefined);
  });

  it('card fields pass _meta through and do not repeat the title suffix', () => {
    const fields = permissionRequestFields(C2.toolCall.title, C2._meta);
    assert.equal(fields.displayTitle, 'Execute `echo deploy-probe`');
    assert.equal(fields.unreadable, false);
    assert.deepEqual(fields._meta, C2._meta);
    assert.equal(fields.hookAsk.label, 'Hook `project/probe` asks: Confirm this deploy');
    assert.equal(fields.hookAsk.shortName, 'project/probe');
    assert.ok(!fields.displayTitle.includes('hook'), fields.displayTitle);
    assert.ok(!fields.displayTitle.includes('Confirm this deploy'), fields.displayTitle);
  });

  it('a request without hookAsk is unchanged aside from forwarding _meta', () => {
    const fields = permissionRequestFields('Write `src/a.ts`', { 'x.ai/tool': { kind: 'write' } });
    assert.deepEqual(fields, {
      displayTitle: 'Write `src/a.ts`',
      unreadable: false,
      _meta: { 'x.ai/tool': { kind: 'write' } },
    });
    assert.equal(permissionRequestFields('Write `src/a.ts`', undefined).displayTitle, 'Write `src/a.ts`');
    assert.equal('hookAsk' in permissionRequestFields('Write `src/a.ts`', undefined), false);
    assert.equal('_meta' in permissionRequestFields('Write `src/a.ts`', undefined), false);
  });

  it('partial hookAsk still produces a line', () => {
    assert.equal(
      formatHookAskLabel('project/probe', 'Confirm this deploy'),
      'Hook `project/probe` asks: Confirm this deploy'
    );
    const nameOnly = parseHookAsk({ hookAsk: { hookName: 'global/x:pre_tool_use[0].hooks[0]' } });
    assert.equal(nameOnly.shortName, 'global/x');
    assert.equal(nameOnly.label, 'Hook `global/x` asks');
    const reasonOnly = parseHookAsk({ hookAsk: { reason: 'Confirm this deploy' } });
    assert.equal(reasonOnly.label, 'Hook asks: Confirm this deploy');
    assert.equal(reasonOnly.shortName, undefined);
  });
});

describe('hook ask is not silently auto-allowed (#30)', () => {
  const pick = (ctx) => pickAutoAllowOption(C2.options, ctx)?.optionId;

  it('allow-once, allow-session and a remembered allow do not answer', () => {
    assert.equal(pick({ mode: 'ask', hookAsk: true }), undefined);
    assert.equal(pick({ mode: 'allow-once', hookAsk: true }), undefined);
    assert.equal(pick({ mode: 'allow-session', hookAsk: true }), undefined);
    assert.equal(pick({ mode: 'ask', sessionKeyAllowed: true, hookAsk: true }), undefined);
  });

  it('permissionMode allow-always / global allow-always still blanket-approves', () => {
    assert.equal(pick({ mode: 'allow-always', hookAsk: true }), 'always-allow');
    assert.equal(pick({ mode: 'ask', globalAllowAlways: true, hookAsk: true }), 'always-allow');
  });

  it('without hookAsk the same options auto-allow as before', () => {
    assert.equal(pick({ mode: 'allow-once' }), 'allow-once');
    assert.equal(pick({ mode: 'ask', sessionKeyAllowed: true }), 'allow-once');
  });

  it('timeout fallback rejects (reject-once), and cancels when no reject exists', () => {
    assert.deepEqual(denyHookAskOutcome(C2.options), {
      outcome: 'selected',
      optionId: 'reject-once',
    });
    assert.deepEqual(
      denyHookAskOutcome([
        { optionId: 'always-allow', kind: 'allow_always' },
        { optionId: 'allow-once', kind: 'allow_once' },
      ]),
      { outcome: 'cancelled' }
    );
    assert.deepEqual(denyHookAskOutcome([]), { outcome: 'cancelled' });
    assert.deepEqual(denyHookAskOutcome(null), { outcome: 'cancelled' });
  });
});
