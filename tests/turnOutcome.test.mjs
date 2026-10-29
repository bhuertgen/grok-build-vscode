import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { classifyTurnEnd, turnEndNotice, formatHookStopNotice, shortHookName, isGermanLocale } =
  require('../dist-test/turnOutcome.js');

// Verbatim shape from live CLI 1.0.62 repro (PreToolUse hook → continue:false)
const HOOK_RESULT = {
  stopReason: 'cancelled',
  _meta: {
    sessionId: 's',
    cancellationCategory: 'HookStopped',
    cancellationContext: {
      reason: 'Repro: hook stopped turn',
      hook_name: 'project/stop:pre_tool_use[0].hooks[0]',
    },
  },
};

// Verbatim session/prompt result, CLI 1.0.73 alpha, UserPromptSubmit failClosed timeout.
const FAIL_CLOSED_PROMPT = {
  stopReason: 'cancelled',
  _meta: {
    sessionId: 's',
    cancellationCategory: 'HookDenied',
    cancellationContext: {
      reason:
        "fail-closed hook 'global/ups:user_prompt_submit[0].hooks[0]' failed: timed out after 1000ms",
      hook_name: 'global/ups:user_prompt_submit[0].hooks[0]',
    },
  },
};

describe('classifyTurnEnd', () => {
  it('detects HookStopped from _meta', () => {
    const o = classifyTurnEnd(HOOK_RESULT);
    assert.equal(o.kind, 'hook_stopped');
    assert.equal(o.stopReason, 'cancelled');
    assert.equal(o.hookName, 'project/stop:pre_tool_use[0].hooks[0]');
    assert.equal(o.reason, 'Repro: hook stopped turn');
  });
  it('accepts snake_case category and missing context', () => {
    const o = classifyTurnEnd({ stopReason: 'cancelled', _meta: { cancellationCategory: 'hook_stopped' } });
    assert.equal(o.kind, 'hook_stopped');
    assert.equal(o.hookName, undefined);
    assert.equal(o.reason, undefined);
  });
  it('detects failClosed UserPromptSubmit as HookDenied', () => {
    const o = classifyTurnEnd(FAIL_CLOSED_PROMPT);
    assert.equal(o.kind, 'hook_denied');
    assert.equal(o.stopReason, 'cancelled');
    assert.equal(o.hookName, 'global/ups:user_prompt_submit[0].hooks[0]');
    assert.match(o.reason, /timed out after 1000ms/);
  });
  it('accepts hook-denied spelling and does not treat PreToolUse end_turn as a hook stop', () => {
    const denied = classifyTurnEnd({
      stopReason: 'cancelled',
      _meta: { cancellationCategory: 'hook-denied' },
    });
    assert.equal(denied.kind, 'hook_denied');
    // PreToolUse failClosed (CLI 1.0.73): the turn itself still ends end_turn.
    assert.equal(classifyTurnEnd({ stopReason: 'end_turn', _meta: {} }).kind, 'end_turn');
  });
  it('plain cancelled / end_turn / refusal unchanged', () => {
    assert.equal(classifyTurnEnd({ stopReason: 'cancelled' }).kind, 'cancelled');
    assert.equal(classifyTurnEnd({ stopReason: 'cancelled', _meta: { cancellationCategory: 'UserInterrupt' } }).kind, 'cancelled');
    assert.equal(classifyTurnEnd({ stopReason: 'end_turn', _meta: {} }).kind, 'end_turn');
    assert.equal(classifyTurnEnd({ stopReason: 'refusal' }).kind, 'refusal');
    assert.equal(classifyTurnEnd({ stopReason: 'weird' }).kind, 'other');
    assert.equal(classifyTurnEnd(undefined).kind, 'end_turn');
  });
});

describe('turnEndNotice', () => {
  it('hook stop → info line even when agent spoke (EN)', () => {
    const n = turnEndNotice(classifyTurnEnd(HOOK_RESULT), true, 'en');
    assert.equal(n, 'ℹ️ _Turn stopped by hook (`project/stop`): Repro: hook stopped turn_');
  });
  it('hook stop → German line for de / de-DE', () => {
    for (const lang of ['de', 'de-DE', 'DE-at']) {
      const n = turnEndNotice(classifyTurnEnd(HOOK_RESULT), false, lang);
      assert.match(n, /^ℹ️ _Turn durch Hook beendet \(`project\/stop`\): Repro/);
    }
  });
  it('hook stop without context still shows a line', () => {
    assert.equal(formatHookStopNotice({ kind: 'hook_stopped' }, 'en'), 'ℹ️ _Turn stopped by hook_');
    assert.equal(formatHookStopNotice({ kind: 'hook_stopped' }, 'de'), 'ℹ️ _Turn durch Hook beendet_');
  });
  it('failClosed prompt block → info line even when the agent was silent', () => {
    const n = turnEndNotice(classifyTurnEnd(FAIL_CLOSED_PROMPT), false, 'en');
    assert.equal(
      n,
      "ℹ️ _Prompt blocked because a hook failed (`global/ups`): fail-closed hook 'global/ups:user_prompt_submit[0].hooks[0]' failed: timed out after 1000ms_"
    );
    const de = turnEndNotice(classifyTurnEnd(FAIL_CLOSED_PROMPT), true, 'de-DE');
    assert.match(de, /^ℹ️ _Prompt blockiert, weil ein Hook fehlgeschlagen ist \(`global\/ups`\):/);
  });
  it('keeps legacy cancelled / refusal / end_turn behaviour', () => {
    assert.equal(turnEndNotice({ kind: 'cancelled' }, false, 'de'), '_(cancelled)_');
    assert.equal(turnEndNotice({ kind: 'cancelled' }, true, 'en'), undefined);
    assert.equal(turnEndNotice({ kind: 'refusal' }, false, 'en'), '_(agent refused)_');
    assert.equal(turnEndNotice({ kind: 'end_turn' }, false, 'en'), undefined);
  });
  it('helpers', () => {
    assert.equal(shortHookName('global/x:post_tool_use[1].hooks[0]'), 'global/x');
    assert.equal(shortHookName(undefined), undefined);
    assert.equal(isGermanLocale('deu'), false);
    assert.equal(isGermanLocale('en-US'), false);
  });
});
