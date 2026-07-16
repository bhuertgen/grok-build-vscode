# Architektur — Grok Build for VS Code (Hybrid)

**Sprache:** Deutsch · English: [../en/ARCHITECTURE.md](../en/ARCHITECTURE.md)

## Entscheidung: Hybrid (Option 1)

| Schicht | Verantwortung |
|---------|----------------|
| **Diese Extension** | VS Code UX: Chat-Webview, Multi-Session, Context, Diffs, Commands, Permissions-UI |
| **Offizielles Grok Build CLI** | Agent-Loop, Planung, Tools, MCP, Sub-Agents, Safety, Reasoning (`grok agent stdio`) |
| **Protokoll** | [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) — JSON-RPC 2.0 über stdio |

Wir bauen den Agenten **nicht** nach. Verhalten wie die Terminal-TUI, gleiche Rust-Binary.

```
VS Code UI  →  SessionManager  →  AcpClient × N  →  grok agent stdio
 (webview)      1 Prozess / Session              (offizielle CLI)
```

## Multi-Prozess-Sessions

- Jede UI-Session → eigener `spawn(cliPath, agent … stdio)`.  
- Tab schließen → Prozess beenden.  
- Parallele Chats teilen keinen Agent-Kontext (außer CLI-seitig).

## ACP-Oberfläche (Client-Rolle)

**Extension → CLI:** `initialize`, `session/new|load|resume|prompt|cancel|set_mode|set_config_option|close`

**CLI → Extension:** `session/update`, `fs/*`, `terminal/*`, `session/request_permission`

## Was nicht in der Extension liegt

- Modellgewichte / Inferenz  
- Tool-Implementierung jenseits ACP-Client  
- MCP-Hosting (CLI lädt User-MCP)  
- Interne Sub-Agent-Orchestrierung  

## CLI-Umgang

1. Activate → CLI erkennen (`grok --version`).  
2. Fehlt → Setup-Wizard.  
3. Commands: Check / Setup / Update CLI.  
4. Spawn-Form: `grok agent --no-leader -m <model> [flags…] stdio`.

Ausführliche Ordnerstruktur und Details: englische Version [ARCHITECTURE.md](../en/ARCHITECTURE.md).
