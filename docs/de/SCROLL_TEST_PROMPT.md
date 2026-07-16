# Scroll-Test-Prompts (VS Code / Grok Build)

**Sprache:** Deutsch · English: [../en/SCROLL_TEST_PROMPT.md](../en/SCROLL_TEST_PROMPT.md)

Ziel: **Sticky-Bottom**, **kein Wackeln**, **Scroll-up bleibt** während Streaming.

## Vorbereitung

1. Extension-Host **F5**  
2. Sandbox-Ordner (trusted)  
3. Grok-Chat in der **Mitte**, Mode **Execute**  

## Pass-Kriterien

| ID | Erwartung |
|----|-----------|
| S1 | Ansicht bleibt am **Ende** während der Antwort |
| S2 | Kein Hoch-Runter-Wackeln |
| S3 | Manuell hochscrollen → bleibt dort |
| S4 | Wieder nach unten → folgt dem Stream |
| S5 | Neuer Turn (Send) → sofort am Ende |
| S6 | Tool-Zeilen mitten im Stream → Pin hält |

## Prompt A — Langer Stream (S1, S2)

```text
SCROLL-TEST A — Langer Textstrom ohne Tools.

Schreibe eine fortlaufende Antwort auf Deutsch mit GENAU 40 nummerierten Absätzen.
Jeder Absatz beginnt mit "Absatz N:" und hat 2–3 Sätze Fülltext (Thema „Testprotokoll Scroll“).
Keine Codeblöcke, keine Tools, keine Dateien.
Am Schluss eine Zeile: SCROLL-TEST-A-DONE
```

## Prompt B — Tools + Text (S6)

```text
SCROLL-TEST B — Tools und Text gemischt.

1) Erzeuge scroll-test/note.md mit "hello scroll".
2) Lies die Datei.
3) Danach GENAU 25 Absätze "Absatz N: …".
4) Ende: SCROLL-TEST-B-DONE
```

## Prompt C — User scrollt weg (S3, S4)

1. A oder B starten  
2. Nach ~5 Absätzen **hochscrollen**  
3. 5 s warten → bleibt oben  
4. Ans Ende → folgt wieder  

Weitere Prompts (D, E, Notizvorlage): [englische Version](../en/SCROLL_TEST_PROMPT.md).
