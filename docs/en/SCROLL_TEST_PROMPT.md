# Scroll test prompts (VS Code / Grok Build)

**Language:** English · Deutsch: [../de/SCROLL_TEST_PROMPT.md](../de/SCROLL_TEST_PROMPT.md)

Goal: **sticky bottom**, **no jitter**, **scroll-up stays put** during streaming.

## Setup

1. Extension Host **F5** (current build).
2. Open an empty or sandbox folder (trusted).
3. Grok chat in the **middle**, mode **Execute**.
4. Optional: Webview DevTools → watch whether `scrollTop` jumps.

## Pass criteria (all required)

| ID | Expectation |
|----|-------------|
| S1 | During the answer, the view stays at the **bottom** (latest text visible). |
| S2 | **No** visible up/down jitter (no jump to top then back). |
| S3 | Manual **scroll up** stays there while streaming continues. |
| S4 | Scroll **to bottom** again → follows the live stream. |
| S5 | After **Send** on a new turn → jumps to bottom immediately. |
| S6 | Tool rows mid-stream → bottom pin still holds. |

---

## Prompt A — Long stream (S1, S2)

Copy into the chat:

```text
SCROLL TEST A — long text stream without tools.

Write one continuous answer in English with EXACTLY 40 numbered paragraphs.
Each paragraph starts with "Paragraph N:" and has 2–3 sentences of filler text (any content, topic "scroll test log").
No code blocks, no bullet lists, no tools, do not touch any files.
Stream as long as needed — I am checking whether the view stays at the bottom and does not jitter.
End with one line: SCROLL-TEST-A-DONE
```

**Check:** while it is writing, the last paragraph is always visible; no flicker towards the top.

---

## Prompt B — Tools + text (S1, S2, S6)

```text
SCROLL TEST B — tools and text mixed.

1) Create the file scroll-test/note.md in the workspace with the content "hello scroll".
2) Read the file back.
3) Then write EXACTLY 25 numbered paragraphs "Paragraph N: …" (1–2 sentences each) about the result.
4) No other files. End with SCROLL-TEST-B-DONE
```

**Check:** when the tool rows (Edit/Read) appear, the viewport stays at the bottom; the answer text after them is visible.

---

## Prompt C — User scrolls away (S3, S4)

1. Start prompt A or B.
2. As soon as ~5 paragraphs are visible: **scroll up with the mouse wheel** (at least 2 screen heights).
3. Wait while the stream continues (at least 5 seconds).

**Pass S3:** the view stays up; text grows below unnoticed.  
**Pass S4:** then scroll to the end → it follows the live text again.

---

## Prompt D — Second turn (S5)

Right after A or B:

```text
SCROLL TEST D — second turn.
Reply with 15 short numbered lines "D-N: ok".
End: SCROLL-TEST-D-DONE
```

**Pass:** after Enter the view jumps to the end and stays there.

---

## Prompt E — Stress (optional)

```text
SCROLL TEST E — stress.
Output 60 very short lines, format "E-001" … "E-060", one per line, as fast as possible.
NO blank lines in between. End: SCROLL-TEST-E-DONE
```

**Pass:** smooth following; CPU may rise, but no scroll yo-yo.

---

## Manual notes (1 minute)

```text
Date:
Build/commit:
S1 at bottom:   OK / FAIL
S2 no jitter:   OK / FAIL
S3 scroll up:   OK / FAIL
S4 re-pin:      OK / FAIL
S5 2nd turn:    OK / FAIL
S6 tools:       OK / FAIL
Note:
```

## Technical background (for developers)

- Sticky flag `stickToBottom` with hysteresis (pin ≤40px, unpin >140px).
- Streaming text deltas: **incremental DOM patch** (no full wipe) as long as the timeline structure stays the same; full rebuild only on structural changes (new message/tool, expand, session).
- After a DOM rebuild: **double `requestAnimationFrame`** before `scrollTop = scrollHeight`; `rebuildGuard` ignores scroll events caused by the wipe, and a pre-wipe `forcePin` keeps the pin.
- `overflow-anchor: none` on the `.messages` container.
- Send / session switch → forced pin.
