import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  uiConfigControls,
  isModelConfigOption,
  isEffortConfigOption,
  configOptionChipLabel,
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
