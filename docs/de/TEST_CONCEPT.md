# Testkonzept — Grok Build for VS Code

**Sprache:** Deutsch · English: [../en/TEST_CONCEPT.md](../en/TEST_CONCEPT.md)

Ziel: Usability, Funktionalität und Security **selbstständig** prüfen — Sandbox-Ordner, nicht dieses Extension-Repo als Agent-Workspace.

## Grundsätze

| Prinzip | Bedeutung |
|---------|-----------|
| Isolierte Sandbox | Frischer/leerer Projektordner |
| Workspace Trust | Trusted und Restricted Mode testen |
| Beobachtbarkeit | Output **Grok Build**, Banner, Tools, Chips |
| Pass/Fail klar | Erwartung + Abbruchkriterium |
| Keine Secrets | Keine echten Keys in Logs/Screenshots |

## Umgebungen

| Env | Zweck |
|-----|--------|
| A | Sandbox trusted |
| B | Restricted Mode |
| C | Zweites Projekt (History-Isolation) |
| D | Extension Development Host (F5) |

## Automatisierte Checks

```bash
npm test                 # Unit
npm run smoke            # Build + static + unit
npm run test:integration # Extension Host
npm run test:all
```

## Manuelle Schwerpunkte (Kurz)

| ID | Thema |
|----|--------|
| Smoke | `PONG` |
| @-Context | Dateiname sichtbar in Bubble |
| History | Restore + Banner Resume/UI-only |
| Model | Wechsel + Systemzeile |
| Trust | Write blockiert ohne Trust |
| Scroll | [SCROLL_TEST_PROMPT.md](./SCROLL_TEST_PROMPT.md) |
| Multi-Agent | [MULTI_AGENT.md](./MULTI_AGENT.md) |

## P0 vor Demo/Release

- Smoke, Trust-Block, Permission-Reject, Outside-Write, Cancel  
- Scroll S1/S2  

## Ausführliche Matrix, Prompts, Security-Checkliste

Die detaillierte englische Fassung (Tabellen, Phasen, Security-Release-Liste):

→ **[../en/TEST_CONCEPT.md](../en/TEST_CONCEPT.md)**

Benutzerhandbuch: [USER_GUIDE.md](./USER_GUIDE.md)
