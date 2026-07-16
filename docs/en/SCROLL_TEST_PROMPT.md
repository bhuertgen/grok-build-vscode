# Scroll test prompts (VS Code / Grok Build)

**Language:** English (prompts may use any language for LLM stress).

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

## Prompt A — Langer Stream (S1, S2)

In den Chat kopieren:

```text
SCROLL-TEST A — Langer Textstrom ohne Tools.

Schreibe eine fortlaufende Antwort auf Deutsch mit GENAU 40 nummerierten Absätzen.
Jeder Absatz beginnt mit "Absatz N:" und hat 2–3 Sätze Fülltext (beliebig, thematisch „Testprotokoll Scroll“).
Keine Codeblöcke, keine Listen mit Bullets, keine Tools, keine Dateien anfassen.
Streaming so lange wie nötig — ich prüfe, ob die Ansicht am Ende bleibt und nicht wackelt.
Am Schluss eine Zeile: SCROLL-TEST-A-DONE
```

**Prüfen:** Während des Schreibens immer den letzten Absatz sehen; kein Flackern nach oben.

---

## Prompt B — Tools + Text (S1, S2, S6)

```text
SCROLL-TEST B — Tools und Text gemischt.

1) Erzeuge im Workspace die Datei scroll-test/note.md mit dem Inhalt "hello scroll".
2) Lies die Datei wieder ein.
3) Schreibe danach GENAU 25 nummerierte Absätze "Absatz N: …" (je 1–2 Sätze) über das Ergebnis.
4) Keine weiteren Dateien. Ende mit SCROLL-TEST-B-DONE
```

**Prüfen:** Beim Erscheinen der Tool-Zeilen (Edit/Read) bleibt der Viewport am Bottom; Antwort-Text danach sichtbar.

---

## Prompt C — User scrollt weg (S3, S4)

1. Prompt A oder B starten.
2. Sobald ~5 Absätze da sind: **Mausrad nach oben** (mind. 2 Bildschirmhöhen).
3. Warten bis der Stream weiterläuft (mind. 5 Sekunden).

**Pass S3:** Ansicht bleibt oben; Text wächst unten unbemerkt.  
**Pass S4:** Danach ans Ende scrollen → folgt wieder dem Live-Text.

---

## Prompt D — Zweiter Turn (S5)

Nach A oder B sofort:

```text
SCROLL-TEST D — Zweiter Turn.
Antworte mit 15 kurzen nummerierten Zeilen "D-N: ok".
Ende: SCROLL-TEST-D-DONE
```

**Pass:** Nach Enter springt die Ansicht ans Ende und bleibt dort.

---

## Prompt E — Stress (optional)

```text
SCROLL-TEST E — Stress.
Gib 60 sehr kurze Zeilen aus, Format "E-001" … "E-060", eine pro Zeile, möglichst schnell.
Dazwischen KEINE Leerzeilen. Ende: SCROLL-TEST-E-DONE
```

**Pass:** Ruckelfreies Mitlaufen; CPU darf steigen, aber kein Scroll-Yoyo.

---

## Manuelle Notizen (1 Minute)

```text
Datum:
Build/Commit:
S1 am Ende:     OK / FAIL
S2 kein Wackeln: OK / FAIL
S3 scroll up:   OK / FAIL
S4 re-pin:      OK / FAIL
S5 2. Turn:     OK / FAIL
S6 tools:       OK / FAIL
Notiz:
```

## Tech-Hintergrund (für Entwickler)

- Sticky-Flag `stickToBottom` mit Hysterese (pin ≤40px, unpin >140px).
- Nach DOM-Rebuild: **double `requestAnimationFrame`** vor `scrollTop = scrollHeight`.
- `overflow-anchor: none` am `.messages`-Container.
- Send / Session-Wechsel → erzwungenes Pin.
