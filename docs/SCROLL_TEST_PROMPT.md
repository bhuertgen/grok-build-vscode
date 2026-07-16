# Scroll-Test Prompt (VS Code / Grok Build)

Ziel: **Sticky-Bottom**, **kein Wackeln**, **Scroll-up bleibt stehen** während Streaming.

## Vorbereitung

1. Extension-Host **F5** (aktueller Build).
2. Leeren oder Sandbox-Ordner öffnen (trusted).
3. Grok-Chat in der **Mitte**, Mode **Execute**.
4. Optional: DevTools im Webview (Command: *Developer: Open Webview Developer Tools*) → beobachten, ob `scrollTop` springt.

## Pass-Kriterien (alle müssen greifen)

| ID | Erwartung |
|----|-----------|
| S1 | Während der Antwort bleibt die Ansicht am **Ende** (neuester Text sichtbar). |
| S2 | **Kein** sichtbares Hoch-Runter-Wackeln (kein Jump to top + back). |
| S3 | Manuell **hochscrollen** → bleibt dort, auch wenn weiter gestreamt wird. |
| S4 | Wieder **nach unten** scrollen (oder ans Ende) → folgt dem Stream wieder. |
| S5 | Nach **Send** einer neuen Frage → sofort wieder am Ende. |
| S6 | Tool-Zeilen (Bash/Read) mitten im Stream → kein Verlust der Bottom-Pin. |

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
