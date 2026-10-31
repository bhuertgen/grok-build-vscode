/**
 * Mid-turn follow-up queue (CLI default follow_up_behavior = "queue").
 * Covers the webview composer decision and the gate SessionManager uses:
 * queue while busy, drain after the turn ends, send-now cancels then sends,
 * and a second sendPrompt is rejected without entering the queue.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  BUSY_ERROR,
  FollowUpGate,
  MAX_FOLLOW_UPS,
  decideComposerSubmit,
  settleTurn,
} = require('../dist-test/followUp.js');

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Minimal stand-in for SessionManager.sendPrompt + finishTurn:
 * claim the gate, run one turn, then deliver whatever settleTurn returns.
 * A second call while the first is in flight rejects with Session is busy
 * and does not enqueue.
 */
function createTurnHarness() {
  const gate = new FollowUpGate();
  const events = [];
  let active = 0;
  let finish = null;

  async function sendPrompt(text) {
    if (gate.busy) {
      throw new Error(BUSY_ERROR);
    }
    gate.claimTurn();
    active += 1;
    if (active > 1) {
      events.push({ type: 'overlap', text });
    }
    events.push({ type: 'start', text });
    let resolveTurn;
    const done = new Promise((resolve) => {
      resolveTurn = resolve;
    });
    finish = () => {
      finish = null;
      resolveTurn();
    };
    let dispatched = false;
    try {
      dispatched = true;
      await done;
      events.push({ type: 'end', text });
    } finally {
      active -= 1;
      const next = settleTurn(gate, dispatched);
      if (next) {
        void sendPrompt(next.text).catch((err) => {
          events.push({ type: 'error', message: err.message, text: next.text });
        });
      }
    }
  }

  function sendNow(text) {
    const decision = gate.armSendNow({ text });
    if (decision.action === 'cancel') {
      events.push({ type: 'cancel', text: decision.prompt.text });
      finish?.();
      return decision;
    }
    if (decision.action === 'send') {
      void sendPrompt(decision.prompt.text);
    }
    return decision;
  }

  return { gate, events, sendPrompt, sendNow, finishTurn: () => finish?.() };
}

describe('webview composer', () => {
  it('sends immediately when the session is idle', () => {
    assert.equal(
      decideComposerSubmit({ busy: false, text: 'hello', hasImages: false, queueLength: 0 }),
      'send'
    );
    assert.equal(
      decideComposerSubmit({ busy: false, text: '  ', hasImages: false, queueLength: 0 }),
      'ignore'
    );
    assert.equal(
      decideComposerSubmit({ busy: false, text: '', hasImages: true, queueLength: 0 }),
      'send'
    );
  });

  it('queues a non-empty draft while busy and send-now on an empty Enter', () => {
    assert.equal(
      decideComposerSubmit({ busy: true, text: 'next', hasImages: false, queueLength: 0 }),
      'queue'
    );
    assert.equal(
      decideComposerSubmit({ busy: true, text: '', hasImages: true, queueLength: 1 }),
      'queue'
    );
    assert.equal(
      decideComposerSubmit({ busy: true, text: '', hasImages: false, queueLength: 2 }),
      'send-now'
    );
    assert.equal(
      decideComposerSubmit({ busy: true, text: '  ', hasImages: false, queueLength: 0 }),
      'ignore'
    );
  });

  it('Ctrl/Cmd+Enter is send now when there is a draft or a queue', () => {
    assert.equal(
      decideComposerSubmit({
        busy: true,
        text: 'stop and do this',
        hasImages: false,
        queueLength: 1,
        forceSendNow: true,
      }),
      'send-now'
    );
    assert.equal(
      decideComposerSubmit({
        busy: true,
        text: '',
        hasImages: false,
        queueLength: 1,
        forceSendNow: true,
      }),
      'send-now'
    );
    assert.equal(
      decideComposerSubmit({
        busy: true,
        text: '',
        hasImages: false,
        queueLength: 0,
        forceSendNow: true,
      }),
      'ignore'
    );
  });
});

describe('follow-up gate', () => {
  it('queues while busy and does not start another turn', () => {
    const gate = new FollowUpGate();
    gate.claimTurn();
    const queued = gate.enqueue('follow up');
    assert.equal(queued.text, 'follow up');
    assert.equal(gate.snapshot().length, 1);
    assert.throws(() => gate.claimTurn(), { message: BUSY_ERROR });
    assert.equal(gate.snapshot().length, 1);
    assert.equal(gate.snapshot()[0].text, 'follow up');
  });

  it('drains the oldest unheld prompt when the turn ends', () => {
    const gate = new FollowUpGate();
    gate.claimTurn();
    gate.enqueue('first');
    gate.enqueue('second');
    const next = settleTurn(gate, true);
    assert.equal(next.text, 'first');
    assert.equal(gate.busy, false);
    assert.deepEqual(
      gate.snapshot().map((item) => item.text),
      ['second']
    );
    gate.claimTurn();
    assert.equal(settleTurn(gate, true).text, 'second');
    assert.equal(gate.snapshot().length, 0);
  });

  it('skips a row that is being edited, then sends it after the hold ends', () => {
    const gate = new FollowUpGate();
    gate.claimTurn();
    const editing = gate.enqueue('draft');
    gate.enqueue('ready');
    gate.hold(editing.id, true);
    assert.equal(settleTurn(gate, true).text, 'ready');
    assert.equal(gate.snapshot()[0].id, editing.id);
    assert.equal(gate.snapshot()[0].held, true);
    gate.hold(editing.id, false);
    assert.equal(gate.takeIfIdle().text, 'draft');
  });

  it('send now cancels the turn and that prompt is next, ahead of the queue', () => {
    const gate = new FollowUpGate();
    gate.claimTurn();
    const queued = gate.enqueue('later');
    const decision = gate.armSendNow({ text: 'do this instead' });
    assert.equal(decision.action, 'cancel');
    assert.equal(decision.origin, 'draft');
    assert.equal(decision.prompt.text, 'do this instead');
    assert.equal(gate.busy, true);
    const next = settleTurn(gate, true);
    assert.equal(next.text, 'do this instead');
    assert.equal(gate.snapshot()[0].id, queued.id);
  });

  it('send now of a row removes that row and leaves the rest in order', () => {
    const gate = new FollowUpGate();
    gate.claimTurn();
    gate.enqueue('a', undefined, 'a');
    gate.enqueue('b', undefined, 'b');
    gate.enqueue('c', undefined, 'c');
    const decision = gate.armSendNow({ id: 'b' });
    assert.equal(decision.action, 'cancel');
    assert.equal(decision.prompt.text, 'b');
    assert.equal(settleTurn(gate, true).text, 'b');
    assert.deepEqual(
      gate.snapshot().map((item) => item.text),
      ['a', 'c']
    );
  });

  it('does not send a held top row on empty send-now', () => {
    const gate = new FollowUpGate();
    gate.claimTurn();
    const top = gate.enqueue('editing');
    gate.hold(top.id, true);
    assert.deepEqual(gate.armSendNow({}), { action: 'ignore' });
    assert.equal(gate.busy, true);
    assert.equal(gate.snapshot()[0].text, 'editing');
  });

  it('puts a replaced send-now prompt back on the queue', () => {
    const gate = new FollowUpGate();
    gate.claimTurn();
    gate.armSendNow({ text: 'one' });
    gate.armSendNow({ text: 'two' });
    assert.equal(settleTurn(gate, true).text, 'two');
    assert.equal(gate.snapshot()[0].text, 'one');
  });

  it('restores the next prompt when the turn never reached the agent', () => {
    const gate = new FollowUpGate();
    gate.claimTurn();
    gate.enqueue('keep me');
    assert.equal(settleTurn(gate, false), null);
    assert.equal(gate.busy, false);
    assert.equal(gate.snapshot()[0].text, 'keep me');
  });

  it('snapshot omits image bytes and counts them', () => {
    const gate = new FollowUpGate();
    const prompt = gate.enqueue('', [{ mimeType: 'image/png', data: 'AAAA' }]);
    assert.equal(prompt.text, '(image)');
    assert.equal(prompt.images[0].data, 'AAAA');
    const view = gate.snapshot()[0];
    assert.equal(view.imageCount, 1);
    assert.equal(Object.hasOwn(view, 'images'), false);
    assert.equal(JSON.stringify(view).includes('AAAA'), false);
  });

  it('rejects an empty follow-up and a full queue', () => {
    const gate = new FollowUpGate();
    assert.throws(() => gate.enqueue('   '), /Empty follow-up/);
    for (let i = 0; i < MAX_FOLLOW_UPS; i++) {
      gate.enqueue(`p${i}`);
    }
    assert.throws(() => gate.enqueue('overflow'), /full/);
  });
});

describe('webview wiring', () => {
  const src = fs.readFileSync(new URL('../webview/main.js', import.meta.url), 'utf8');

  it('submits a busy composer into the queue instead of returning early', () => {
    assert.match(src, /enqueueFollowUp/);
    assert.match(src, /sendFollowUpNow/);
    assert.match(src, /holdFollowUp/);
    assert.match(src, /decideComposerSubmitFallback/);
    assert.equal(/if \(!s \|\| s\.busy\) \{\s*return;\s*\}/.test(src), false);
    assert.match(src, /btnSend\.classList\.remove\('hidden'\)/);
  });
});

describe('sendPrompt busy guard', () => {
  it('queues while a turn is running and drains it only after that turn ends', async () => {
    const h = createTurnHarness();
    const pending = h.sendPrompt('first');
    await tick();
    h.gate.enqueue('second');
    await assert.rejects(() => h.sendPrompt('third'), { message: BUSY_ERROR });
    assert.equal(
      h.events.filter((e) => e.type === 'start').map((e) => e.text).join(','),
      'first'
    );
    assert.deepEqual(
      h.gate.snapshot().map((item) => item.text),
      ['second']
    );
    h.finishTurn();
    await pending;
    await tick();
    assert.deepEqual(
      h.events.filter((e) => e.type === 'start').map((e) => e.text),
      ['first', 'second']
    );
    assert.equal(h.events.some((e) => e.type === 'overlap'), false);
    h.finishTurn();
    await tick();
    assert.equal(h.gate.snapshot().length, 0);
  });

  it('send now cancels the in-flight turn and then sends that prompt before the queue', async () => {
    const h = createTurnHarness();
    const pending = h.sendPrompt('first');
    await tick();
    h.gate.enqueue('queued');
    const decision = h.sendNow('NOW');
    assert.equal(decision.action, 'cancel');
    await pending;
    await tick();
    assert.deepEqual(
      h.events.filter((e) => e.type === 'cancel').map((e) => e.text),
      ['NOW']
    );
    assert.deepEqual(
      h.events.filter((e) => e.type === 'start').map((e) => e.text),
      ['first', 'NOW']
    );
    assert.equal(h.events.some((e) => e.type === 'overlap'), false);
    assert.equal(h.gate.snapshot()[0].text, 'queued');
    h.finishTurn();
    await tick();
    assert.deepEqual(
      h.events.filter((e) => e.type === 'start').map((e) => e.text),
      ['first', 'NOW', 'queued']
    );
  });

  it('a second sendPrompt is rejected and is not inserted into the queue', async () => {
    const h = createTurnHarness();
    const pending = h.sendPrompt('running');
    await tick();
    const before = h.gate.snapshot().map((item) => item.text);
    await assert.rejects(() => h.sendPrompt('sneak'), { message: BUSY_ERROR });
    assert.deepEqual(
      h.gate.snapshot().map((item) => item.text),
      before
    );
    assert.equal(h.events.filter((e) => e.type === 'start').length, 1);
    h.finishTurn();
    await pending;
    await tick();
    assert.deepEqual(
      h.events.filter((e) => e.type === 'start').map((e) => e.text),
      ['running']
    );
  });
});
