import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  toolRowStatus,
  isRunningToolStatus,
  isTerminalToolStatus,
  mergeToolCallStatus,
  cancelOpenToolCalls,
  canonicalToolStatus,
} = require('../dist-test/toolStatus.js');

describe('toolRowStatus (#29)', () => {
  it('renders cancelled as a neutral terminal label, not running and not failed', () => {
    for (const status of ['cancelled', 'Cancelled', ' CANCELLED ']) {
      const view = toolRowStatus(status, '4s');
      assert.equal(view.running, false);
      assert.equal(view.dot, 'cancelled');
      assert.equal(view.label, 'Cancelled');
      assert.equal(view.groupAsCompleted, false);
      assert.notEqual(view.label, 'failed');
      assert.notEqual(view.dot, 'failed');
      assert.notEqual(view.label, 'done');
      assert.notEqual(view.label, '4s');
    }
  });

  it('only pending and in_progress count as running', () => {
    assert.equal(toolRowStatus('pending').running, true);
    assert.equal(toolRowStatus('in_progress').label, 'running');
    assert.equal(toolRowStatus('pending').dot, 'pending');
    assert.equal(toolRowStatus('In_Progress').dot, 'in_progress');
    assert.equal(isRunningToolStatus('pending'), true);
    assert.equal(isRunningToolStatus('in_progress'), true);
    assert.equal(isRunningToolStatus('cancelled'), false);
    assert.equal(isRunningToolStatus('completed'), false);
    assert.equal(isRunningToolStatus('failed'), false);
    assert.equal(isRunningToolStatus('mystery'), false);
    assert.equal(isRunningToolStatus(undefined), false);
  });

  it('completed uses the duration and is the only status grouped as done', () => {
    assert.deepEqual(toolRowStatus('completed', '12s'), {
      running: false,
      dot: 'completed',
      label: '12s',
      groupAsCompleted: true,
    });
    assert.equal(toolRowStatus('completed', '  ').label, 'done');
    assert.equal(toolRowStatus('failed').groupAsCompleted, false);
    assert.equal(toolRowStatus('failed').label, 'failed');
    assert.equal(toolRowStatus('failed').dot, 'failed');
  });

  it('does not display an unknown status as completed', () => {
    const view = toolRowStatus('blocked');
    assert.equal(view.running, false);
    assert.equal(view.dot, 'unknown');
    assert.equal(view.label, 'blocked');
    assert.equal(view.groupAsCompleted, false);
    assert.equal(toolRowStatus('').label, 'unknown');
    assert.equal(toolRowStatus(null).label, 'unknown');
    assert.equal(canonicalToolStatus(' completed '), 'completed');
    assert.equal(canonicalToolStatus('blocked'), 'blocked');
  });
});

describe('mergeToolCallStatus', () => {
  it('does not let a later completed or failed reset cancelled', () => {
    assert.equal(mergeToolCallStatus('cancelled', 'completed'), 'cancelled');
    assert.equal(mergeToolCallStatus('cancelled', 'failed'), 'cancelled');
    assert.equal(mergeToolCallStatus('cancelled', 'pending'), 'cancelled');
    assert.equal(mergeToolCallStatus('Cancelled', 'in_progress'), 'cancelled');
    assert.equal(mergeToolCallStatus('cancelled', ''), 'cancelled');
    assert.equal(mergeToolCallStatus('cancelled', undefined), 'cancelled');
  });

  it('still advances a live call', () => {
    assert.equal(mergeToolCallStatus('pending', 'in_progress'), 'in_progress');
    assert.equal(mergeToolCallStatus('in_progress', 'completed'), 'completed');
    assert.equal(mergeToolCallStatus('in_progress', 'failed'), 'failed');
    assert.equal(mergeToolCallStatus('pending', 'cancelled'), 'cancelled');
    assert.equal(mergeToolCallStatus(undefined, undefined), 'pending');
  });

  it('treats cancelled, completed, and failed as terminal', () => {
    assert.equal(isTerminalToolStatus('cancelled'), true);
    assert.equal(isTerminalToolStatus('completed'), true);
    assert.equal(isTerminalToolStatus('failed'), true);
    assert.equal(isTerminalToolStatus('pending'), false);
    assert.equal(isTerminalToolStatus('in_progress'), false);
    assert.equal(isTerminalToolStatus('blocked'), false);
  });
});

describe('cancelOpenToolCalls', () => {
  it('cancels only pending and in_progress rows of the given list', () => {
    const tabA = [
      { id: 'done', status: 'completed', finishedAt: 1 },
      { id: 'open', status: 'in_progress' },
      { id: 'wait', status: 'pending' },
      { id: 'bad', status: 'failed', finishedAt: 2 },
      { id: 'already', status: 'cancelled', finishedAt: 3 },
      { id: 'odd', status: 'blocked' },
    ];
    const tabB = [
      { id: 'open', status: 'in_progress' },
      { id: 'wait', status: 'pending' },
    ];
    const n = cancelOpenToolCalls(tabA, 50);
    assert.equal(n, 2);
    assert.equal(tabA[0].status, 'completed');
    assert.equal(tabA[0].finishedAt, 1);
    assert.equal(tabA[1].status, 'cancelled');
    assert.equal(tabA[1].finishedAt, 50);
    assert.equal(tabA[2].status, 'cancelled');
    assert.equal(tabA[2].finishedAt, 50);
    assert.equal(tabA[3].status, 'failed');
    assert.equal(tabA[4].status, 'cancelled');
    assert.equal(tabA[4].finishedAt, 3);
    assert.equal(tabA[5].status, 'blocked');
    assert.equal(tabB[0].status, 'in_progress');
    assert.equal(tabB[1].status, 'pending');
    assert.equal(tabB[0].finishedAt, undefined);
  });

  it('is a no-op when nothing is open', () => {
    const tools = [{ status: 'completed', finishedAt: 1 }];
    assert.equal(cancelOpenToolCalls(tools, 9), 0);
    assert.equal(tools[0].finishedAt, 1);
  });
});
