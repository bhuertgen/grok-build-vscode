/**
 * Unit model of webview/main.js chat scroll controller
 * (stickToBottom hysteresis + renderMessages wipe race).
 * See docs/en/SCROLL_TEST_PROMPT.md (S1–S6) and GitHub scroll jitter issue.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const STICK_PIN_PX = 40;
const STICK_UNPIN_PX = 140;

function createScrollModel(initial = {}) {
  let stickToBottom = initial.stickToBottom ?? true;
  let scrollTop = initial.scrollTop ?? 0;
  let scrollHeight = initial.scrollHeight ?? 1000;
  let clientHeight = initial.clientHeight ?? 400;
  let scrollRaf = 0;
  let rebuildGuard = false;

  function distanceFromBottom() {
    return scrollHeight - scrollTop - clientHeight;
  }

  function updateStickFromUserScroll() {
    const dist = distanceFromBottom();
    if (dist <= STICK_PIN_PX) {
      stickToBottom = true;
    } else if (dist > STICK_UNPIN_PX) {
      stickToBottom = false;
    }
  }

  function onScrollEvent() {
    if (scrollRaf || rebuildGuard) return;
    updateStickFromUserScroll();
  }

  /** Pre-fix 0.2.2 buggy path: wipe scroll falsely re-pins via forcePin||stick */
  function renderMessagesBuggy(newScrollHeight) {
    const prevScroll = scrollTop;
    const forcePin = stickToBottom;
    if (!forcePin) updateStickFromUserScroll();
    scrollHeight = 0;
    scrollTop = 0;
    onScrollEvent(); // re-pins
    scrollHeight = newScrollHeight;
    const pin = forcePin || stickToBottom;
    if (pin || stickToBottom) {
      scrollTop = scrollHeight - clientHeight;
      stickToBottom = true;
    } else {
      scrollTop = Math.max(0, prevScroll);
    }
    return { stickToBottom, scrollTop };
  }

  /** Fixed path (rebuildGuard + pre-wipe forcePin only + sync scroll) */
  function renderMessagesFixed(newScrollHeight) {
    const prevScroll = scrollTop;
    let forcePin = stickToBottom;
    if (!forcePin) {
      updateStickFromUserScroll();
      forcePin = stickToBottom;
    }
    rebuildGuard = true;
    scrollHeight = 0;
    scrollTop = 0;
    onScrollEvent(); // ignored
    scrollHeight = newScrollHeight;
    if (forcePin) {
      scrollTop = scrollHeight - clientHeight;
    } else {
      scrollTop = Math.max(0, prevScroll);
    }
    rebuildGuard = false;
    // schedule apply uses forcePin only
    if (forcePin) {
      scrollTop = scrollHeight - clientHeight;
      stickToBottom = true;
    } else {
      scrollTop = Math.max(0, prevScroll);
    }
    return { stickToBottom, scrollTop, forcePin };
  }

  /** Incremental path: no wipe — only grow scrollHeight, preserve scrollTop */
  function renderMessagesIncremental(newScrollHeight) {
    const prevScroll = scrollTop;
    const forcePin = stickToBottom;
    scrollHeight = newScrollHeight;
    if (forcePin) {
      scrollTop = scrollHeight - clientHeight;
      stickToBottom = true;
    } else {
      scrollTop = prevScroll;
    }
    return { stickToBottom, scrollTop, forcePin, wiped: false };
  }

  return {
    get stickToBottom() {
      return stickToBottom;
    },
    get scrollTop() {
      return scrollTop;
    },
    userScrollTo(top) {
      scrollTop = top;
      onScrollEvent();
    },
    renderMessagesBuggy,
    renderMessagesFixed,
    renderMessagesIncremental,
  };
}

describe('scroll stick hysteresis', () => {
  it('pins when within STICK_PIN_PX of bottom', () => {
    const m = createScrollModel({ stickToBottom: false, scrollTop: 560, scrollHeight: 1000, clientHeight: 400 });
    m.userScrollTo(560);
    assert.equal(m.stickToBottom, true);
  });

  it('unpins when farther than STICK_UNPIN_PX', () => {
    const m = createScrollModel({ stickToBottom: true, scrollTop: 800, scrollHeight: 1000, clientHeight: 400 });
    m.userScrollTo(100);
    assert.equal(m.stickToBottom, false);
  });

  it('hysteresis band 40..140 keeps prior stick state', () => {
    const m = createScrollModel({ stickToBottom: true, scrollTop: 560, scrollHeight: 1000, clientHeight: 400 });
    m.userScrollTo(500);
    assert.equal(m.stickToBottom, true);
    m.userScrollTo(100);
    assert.equal(m.stickToBottom, false);
    m.userScrollTo(500);
    assert.equal(m.stickToBottom, false);
  });
});

describe('renderMessages wipe race (S2/S3)', () => {
  it('BUGGY: mid-stream scroll-up → wipe falsely re-pins (yank)', () => {
    const m = createScrollModel({
      stickToBottom: true,
      scrollTop: 600,
      scrollHeight: 1000,
      clientHeight: 400,
    });
    m.userScrollTo(50);
    assert.equal(m.stickToBottom, false);
    const r = m.renderMessagesBuggy(2000);
    assert.equal(r.stickToBottom, true);
    assert.equal(m.scrollTop, 1600);
  });

  it('FIXED: mid-stream scroll-up keeps reading position (S3)', () => {
    const m = createScrollModel({
      stickToBottom: true,
      scrollTop: 600,
      scrollHeight: 1000,
      clientHeight: 400,
    });
    m.userScrollTo(50);
    assert.equal(m.stickToBottom, false);
    const r = m.renderMessagesFixed(2000);
    assert.equal(r.stickToBottom, false);
    assert.equal(m.scrollTop, 50);
  });

  it('FIXED: while pinned, continues to follow bottom (S1)', () => {
    const m = createScrollModel({
      stickToBottom: true,
      scrollTop: 600,
      scrollHeight: 1000,
      clientHeight: 400,
    });
    const r = m.renderMessagesFixed(2000);
    assert.equal(r.stickToBottom, true);
    assert.equal(m.scrollTop, 1600);
  });
});


describe('incremental streaming patch (no wipe)', () => {
  it('incremental: pinned stream follows bottom without wipe (S1/S2)', () => {
    const m = createScrollModel({
      stickToBottom: true,
      scrollTop: 600,
      scrollHeight: 1000,
      clientHeight: 400,
    });
    const r = m.renderMessagesIncremental(2000);
    assert.equal(r.wiped, false);
    assert.equal(r.stickToBottom, true);
    assert.equal(m.scrollTop, 1600);
  });

  it('incremental: mid-scroll stays put while content grows (S3)', () => {
    const m = createScrollModel({
      stickToBottom: true,
      scrollTop: 600,
      scrollHeight: 1000,
      clientHeight: 400,
    });
    m.userScrollTo(80);
    assert.equal(m.stickToBottom, false);
    const r = m.renderMessagesIncremental(2500);
    assert.equal(r.wiped, false);
    assert.equal(r.stickToBottom, false);
    assert.equal(m.scrollTop, 80);
  });
});
