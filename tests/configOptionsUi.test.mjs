import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  uiConfigControls,
  isModelConfigOption,
  isEffortConfigOption,
  configOptionChipLabel,
  retainConfigOptions,
  upsertEffortCurrent,
  applyModelsUpdate,
} = require('../dist-test/configOptionsUi.js');

describe('uiConfigControls', () => {
  it('hides the model option and unknown types', () => {
    const controls = uiConfigControls([
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        currentValue: 'grok-4.5',
        options: [{ value: 'grok-4.5', name: 'Grok 4.5' }],
      },
      {
        id: 'reasoning_effort',
        name: 'Reasoning effort',
        category: 'thought',
        type: 'select',
        currentValue: 'medium',
        options: [
          { value: 'low', name: 'Low' },
          { value: 'medium', name: 'Medium' },
          { value: 'high', name: 'High' },
        ],
      },
      { id: 'temperature', name: 'Temperature', type: 'number', currentValue: '0.2' },
      { id: 'empty_select', name: 'Empty', type: 'select', options: [] },
    ]);
    assert.equal(controls.length, 1);
    assert.equal(controls[0].kind, 'select');
    assert.equal(controls[0].id, 'reasoning_effort');
    assert.equal(controls[0].currentValue, 'medium');
    assert.equal(controls[0].options.length, 3);
  });

  it('maps booleans and drops model-by-name', () => {
    const controls = uiConfigControls([
      { id: 'active_model', name: 'Model id', type: 'select', options: [{ value: 'a', name: 'A' }] },
      { id: 'web', name: 'Web search', type: 'boolean', currentValue: true },
    ]);
    assert.deepEqual(
      controls.map((c) => c.id),
      ['web']
    );
    assert.equal(controls[0].kind, 'boolean');
    assert.equal(controls[0].currentValue, true);
  });

  it('returns [] for missing input', () => {
    assert.deepEqual(uiConfigControls(undefined), []);
    assert.deepEqual(uiConfigControls(null), []);
  });
});

describe('labels', () => {
  it('detects effort by category thought_level even with a non-matching id/name', () => {
    const opt = { id: 'depth_knob', name: 'Thinking depth', category: 'thought_level' };
    assert.equal(isEffortConfigOption(opt), true);
    assert.equal(configOptionChipLabel(opt), 'Effort');
    const legacy = { id: 'x', name: 'Y', category: 'thought' };
    assert.equal(isEffortConfigOption(legacy), true);
    // fallback: no category, name matches
    assert.equal(isEffortConfigOption({ id: 'reasoning_effort', name: 'Reasoning' }), true);
    // neither category nor name/id
    assert.equal(isEffortConfigOption({ id: 'depth_knob', name: 'Thinking depth', category: 'other' }), false);
  });

  it('flags effort and model', () => {
    const effort = { id: 'effort', name: 'Effort', category: 'thought' };
    assert.equal(isEffortConfigOption(effort), true);
    assert.equal(configOptionChipLabel(effort), 'Effort');
    assert.equal(
      isModelConfigOption({ id: 'model', name: 'Model', category: 'model' }),
      true
    );
    assert.equal(isModelConfigOption(effort), false);
  });
});

/** Live grok 1.0.46 session/new payload (category thought_level, not thought). */
const initialSessionConfig = [
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'grok-4.7',
    options: [
      { value: 'grok-4.7', name: 'Grok 4.7' },
      { value: 'grok-4.5', name: 'Grok 4.5' },
    ],
  },
  {
    id: 'reasoning_effort',
    name: 'Reasoning Effort',
    category: 'thought_level',
    type: 'select',
    currentValue: 'high',
    options: [
      { value: 'xhigh', name: 'Extra High' },
      { value: 'high', name: 'High' },
      { value: 'medium', name: 'Medium' },
      { value: 'low', name: 'Low' },
    ],
  },
];

describe('initial configOptions before any user change', () => {
  it('renders the Effort chip from the session/new list immediately', () => {
    const controls = uiConfigControls(initialSessionConfig);
    assert.equal(controls.length, 1);
    assert.equal(controls[0].id, 'reasoning_effort');
    assert.equal(controls[0].kind, 'select');
    assert.equal(controls[0].currentValue, 'high');
    assert.equal(controls[0].category, 'thought_level');
    const effortOpt = initialSessionConfig[1];
    assert.equal(isEffortConfigOption(effortOpt), true);
    assert.equal(isModelConfigOption(effortOpt), false);
    assert.equal(configOptionChipLabel(effortOpt), 'Effort');
  });

  it('keeps the initial effort chip if a later payload is empty or model-only', () => {
    assert.equal(
      uiConfigControls(retainConfigOptions(initialSessionConfig, undefined))[0]
        .currentValue,
      'high'
    );
    assert.equal(
      uiConfigControls(retainConfigOptions(initialSessionConfig, null))[0].id,
      'reasoning_effort'
    );
    const modelOnly = initialSessionConfig.filter((o) => o.id === 'model');
    const merged = retainConfigOptions(initialSessionConfig, modelOnly);
    const controls = uiConfigControls(merged);
    assert.deepEqual(
      controls.map((c) => c.id),
      ['reasoning_effort']
    );
    assert.equal(controls[0].currentValue, 'high');
  });

  it('seeds an Effort chip from model_changed reasoning_effort alone', () => {
    const seeded = upsertEffortCurrent(undefined, 'high');
    const controls = uiConfigControls(seeded);
    assert.equal(controls.length, 1);
    assert.equal(controls[0].id, 'reasoning_effort');
    assert.equal(controls[0].currentValue, 'high');
    assert.ok(controls[0].options.some((o) => o.value === 'high'));
    const updated = upsertEffortCurrent(initialSessionConfig, 'low');
    const again = uiConfigControls(updated);
    assert.equal(again[0].currentValue, 'low');
    assert.equal(again[0].options.length, 4);
  });
});

// `_x.ai/models/update` payload shape from CLI 1.0.67 (trimmed live capture)
const EFFORTS = [
  { id: 'xhigh', value: 'xhigh', label: 'Extra High', description: 'Most thorough' },
  { id: 'high', value: 'high', label: 'High', description: 'Thorough', default: true },
  { id: 'medium', value: 'medium', label: 'Medium' },
  { id: 'low', value: 'low', label: 'Low' },
];
const MODELS_UPDATE = {
  currentModelId: 'grok-4.7',
  availableModels: [
    {
      modelId: 'grok-4.7',
      name: 'Grok 4.7',
      description: "SpaceXAI's latest frontier model",
      _meta: { totalContextTokens: 256000, supportsReasoningEffort: true, reasoningEffort: 'high', reasoningEfforts: EFFORTS },
    },
    { modelId: 'grok-4.7-fast', name: 'Grok 4.7 Fast', _meta: { supportsReasoningEffort: false } },
    { modelId: 'grok-code-fast-2', name: 'Grok Code Fast 2', _meta: { supportsReasoningEffort: false } },
    { modelId: 'grok-4.20-0309-reasoning', name: 'Grok 4.20 Reasoning', _meta: { supportsReasoningEffort: true, reasoningEffort: 'medium', reasoningEfforts: EFFORTS } },
  ],
};
// Cold start: session/new returns a fallback catalog (no efforts) before the real one
const COLD_SESSION_NEW_OPTIONS = [
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'grok-4.20-0309-non-reasoning',
    options: Array.from({ length: 14 }, (_, i) => ({
      value: i === 0 ? 'grok-4.20-0309-non-reasoning' : `fallback-${i}`,
      name: i === 0 ? 'grok-4.20-0309-non-reasoning' : `fallback-${i}`,
    })),
  },
];

describe('applyModelsUpdate (_x.ai/models/update)', () => {
  it('cold start: adds the Effort chip and the real model list', () => {
    assert.equal(uiConfigControls(COLD_SESSION_NEW_OPTIONS).length, 0); // the bug: no Effort chip
    const res = applyModelsUpdate(COLD_SESSION_NEW_OPTIONS, MODELS_UPDATE);
    assert.equal(res.modelId, 'grok-4.7');
    const model = res.options.find((o) => isModelConfigOption(o));
    assert.equal(model.currentValue, 'grok-4.7');
    assert.deepEqual(model.options.map((c) => c.value), MODELS_UPDATE.availableModels.map((m) => m.modelId));
    const controls = uiConfigControls(res.options);
    assert.equal(controls.length, 1);
    assert.equal(configOptionChipLabel(controls[0]), 'Effort');
    assert.equal(controls[0].id, 'reasoning_effort');
    assert.equal(controls[0].category, 'thought_level');
    assert.equal(controls[0].currentValue, 'high');
    assert.deepEqual(controls[0].options.map((c) => c.value), ['xhigh', 'high', 'medium', 'low']);
    assert.equal(controls[0].options[0].name, 'Extra High');
    // input not mutated
    assert.equal(COLD_SESSION_NEW_OPTIONS.length, 1);
    assert.equal(COLD_SESSION_NEW_OPTIONS[0].currentValue, 'grok-4.20-0309-non-reasoning');
  });

  it('keeps a valid user effort and the existing option ids', () => {
    const warm = [
      { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'grok-4.7', options: [{ value: 'grok-4.7', name: 'Grok 4.7' }] },
      { id: 'reasoning_effort', name: 'Reasoning Effort', category: 'thought_level', type: 'select', currentValue: 'low', options: [{ value: 'low', name: 'Low' }] },
    ];
    const res = applyModelsUpdate(warm, MODELS_UPDATE);
    const effort = res.options.find((o) => o.id === 'reasoning_effort');
    assert.equal(effort.currentValue, 'low');
    assert.equal(effort.options.length, 4);
    assert.equal(res.options.length, 2);
  });

  it('falls back to the model default when the current effort is not offered', () => {
    const prev = [{ id: 'reasoning_effort', name: 'Reasoning Effort', category: 'thought_level', currentValue: 'ultra' }];
    const res = applyModelsUpdate(prev, { ...MODELS_UPDATE, currentModelId: 'grok-4.20-0309-reasoning' });
    assert.equal(res.options.find((o) => o.id === 'reasoning_effort').currentValue, 'medium');
  });

  it('removes Effort when the current model does not support it', () => {
    const prev = upsertEffortCurrent([], 'high');
    const res = applyModelsUpdate(prev, { ...MODELS_UPDATE, currentModelId: 'grok-4.7-fast' });
    assert.equal(res.modelId, 'grok-4.7-fast');
    assert.equal(res.options.some((o) => isEffortConfigOption(o) && !isModelConfigOption(o)), false);
  });

  it('missing currentModelId keeps a valid current model; empty catalog is a no-op', () => {
    const prev = [{ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'grok-4.20-0309-reasoning', options: [] }];
    const res = applyModelsUpdate(prev, { availableModels: MODELS_UPDATE.availableModels });
    assert.equal(res.modelId, 'grok-4.20-0309-reasoning');
    assert.equal(applyModelsUpdate(prev, { currentModelId: 'x', availableModels: [] }), undefined);
    assert.equal(applyModelsUpdate(prev, null), undefined);
  });
});
