# Scroll-Test-Prompts (VS Code / Grok Build)

**Sprache:** Deutsch · English: [../en/SCROLL_TEST_PROMPT.md](../en/SCROLL_TEST_PROMPT.md)

Ziel: **Sticky-Bottom**, **kein Wackeln**, **Scroll-up bleibt** während des Streamings.

## Vorbereitung

1. Extension-Host **F5** (aktueller Build).
2. Leeren oder Sandbox-Ordner öffnen (trusted).
3. Grok-Chat in der **Mitte**, Mode **Execute**.
4. Optional: Webview-DevTools → beobachten, ob `scrollTop` springt.

## Pass-Kriterien (alle erforderlich)

| ID | Erwartung |
|----|-----------|
| S1 | Während der Antwort bleibt die Ansicht am **Ende** (neuester Text sichtbar). |
| S2 | **Kein** sichtbares Hoch-Runter-Wackeln (kein Sprung nach oben und zurück). |
| S3 | Manuell **hochgescrollt** bleibt die Ansicht dort, während das Streaming weiterläuft. |
| S4 | Wieder **ans Ende** gescrollt → folgt dem Live-Stream. |
| S5 | Nach **Send** in einem neuen Turn → springt sofort ans Ende. |
| S6 | Tool-Zeilen mitten im Stream → der Pin am Ende hält. |

---

## Prompt A — Langer Stream (S1, S2)

In den Chat kopieren:

```text
SCROLL-TEST A — Langer Textstrom ohne Tools.

Schreibe eine fortlaufende Antwort auf Deutsch mit GENAU 40 nummerierten Absätzen.
Jeder Absatz beginnt mit "Absatz N:" und hat 2–3 Sätze Fülltext (beliebig, Thema „Testprotokoll Scroll“).
Keine Codeblöcke, keine Listen mit Bullets, keine Tools, keine Dateien anfassen.
Streame so lange wie nötig — ich prüfe, ob die Ansicht am Ende bleibt und nicht wackelt.
Am Schluss eine Zeile: SCROLL-TEST-A-DONE
```

**Prüfen:** Während des Schreibens ist immer der letzte Absatz sichtbar; kein Flackern nach oben.

---

## Prompt B — Tools + Text (S1, S2, S6)

```text
SCROLL-TEST B — Tools und Text gemischt.

1) Erzeuge im Workspace die Datei scroll-test/note.md mit dem Inhalt "hello scroll".
2) Lies die Datei wieder ein.
3) Schreibe danach GENAU 25 nummerierte Absätze "Absatz N: …" (je 1–2 Sätze) über das Ergebnis.
4) Keine weiteren Dateien. Ende mit SCROLL-TEST-B-DONE
```

**Prüfen:** Beim Erscheinen der Tool-Zeilen (Edit/Read) bleibt der Viewport am Ende; der Antworttext danach ist sichtbar.

---

## Prompt C — User scrollt weg (S3, S4)

1. Prompt A oder B starten.
2. Sobald ~5 Absätze sichtbar sind: **Mausrad nach oben** (mindestens 2 Bildschirmhöhen).
3. Warten, während der Stream weiterläuft (mindestens 5 Sekunden).

**Pass S3:** Ansicht bleibt oben; der Text wächst unten unbemerkt.  
**Pass S4:** Danach ans Ende scrollen → folgt wieder dem Live-Text.

---

## Prompt D — Zweiter Turn (S5)

Direkt nach A oder B:

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

**Pass:** Ruckelfreies Mitlaufen; die CPU-Last darf steigen, aber kein Scroll-Jojo.

---

## Manuelle Notizen (1 Minute)

```text
Datum:
Build/Commit:
S1 am Ende:      OK / FAIL
S2 kein Wackeln: OK / FAIL
S3 scroll up:    OK / FAIL
S4 re-pin:       OK / FAIL
S5 2. Turn:      OK / FAIL
S6 Tools:        OK / FAIL
Notiz:
```

## Technischer Hintergrund (für Entwickler)

- Sticky-Flag `stickToBottom` mit Hysterese (Pin ≤40px, Unpin >140px).
- Streaming-Text-Deltas: **inkrementeller DOM-Patch** (kein Full-Wipe), solange die Timeline-Struktur gleich bleibt; Full-Rebuild nur bei Strukturwechsel (neue Nachricht/Tool, Aufklappen, Session).
- Nach einem DOM-Rebuild: **doppeltes `requestAnimationFrame`** vor `scrollTop = scrollHeight`; `rebuildGuard` ignoriert Scroll-Events durch den Wipe, ein Pre-Wipe-`forcePin` hält den Pin.
- `overflow-anchor: none` am `.messages`-Container.
- Send / Session-Wechsel → erzwungener Pin.
