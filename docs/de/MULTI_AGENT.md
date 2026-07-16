# Multi-Agent-Monitoring (Grok Build for VS Code)

**Sprache:** Deutsch · English: [../en/MULTI_AGENT.md](../en/MULTI_AGENT.md)

## Wie Multi-Agent hier funktioniert

**Sub-Agents** laufen **im offiziellen CLI** (`grok agent stdio`), nicht als eigene VS-Code-Prozesse.

```
VS Code Extension (UI)
        │  ACP session/update (tool_call / tool_call_update)
        ▼
Grok CLI (ein Prozess pro Chat-Session)
        ├── Haupt-Agent
        ├── Sub-Agent A
        └── Sub-Agent B
```

Die Extension **beobachtet** Tool-Aktivität über ACP.

| Update | Bedeutung |
|--------|-----------|
| `tool_call` | Neues Tool / Sub-Task gestartet |
| `tool_call_update` | pending → in_progress → completed / failed |

## Was du in der UI siehst

- **Agents/Tools-Leiste** über dem Chat (laufende Tools, Status-Dots)  
- **Tool-Zeilen** in der Timeline (aufklappbar)  
- **Kein** separates Fenster pro Sub-Agent  

## Testen

1. Workspace **trusted**  
2. Mode **Execute**, `autoAllowInExecuteMode` idealerweise an  
3. Prompt mit paralleler Arbeit, z. B.:

```text
Spawn two sub-agents if possible: one lists files, one summarizes README.
Then merge results. Stay inside this workspace.
```

Setting `grokBuild.noSubagents` muss **false** sein.

## Roadmap (kurz)

- Klick auf Tool-Zeile → Scroll zur Stelle  
- Gruppierung nach Parent-Tool  
- Eigene Subagent-Streams nur, wenn CLI/ACP sie liefert  

Details und Tabelle: [../en/MULTI_AGENT.md](../en/MULTI_AGENT.md).
