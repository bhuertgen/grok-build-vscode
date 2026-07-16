# Grok Build for VS Code

**Hybrid architecture:** native Visual Studio Code UX on top of the official **xAI Grok Build CLI** via the [Agent Client Protocol](https://agentclientprotocol.com/) (`grok agent stdio`).

- The extension does **not** reimplement the agent loop.
- Each chat session owns its **own** `grok agent stdio` process.
- VS Code supplies UI, context, multi-session, native diffs, and editor integration.

> Not affiliated with xAI. Planning, tools, MCP, sub-agents, and safety stay in the official Rust CLI.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Features

| Area | What you get |
|------|----------------|
| **Sidebar chat** | Theme-aware webview with streaming messages, tool cards, plan panel |
| **Multi-session** | Tabs for parallel chats; open a session in an editor group |
| **Plan / Execute** | Toggle modes via UI, command, or keybinding |
| **Safe edits** | Native VS Code diff preview · Apply · Apply All · Apply Always · Reject |
| **Context** | Auto active file/selection · `@file` / `@symbol` / `@git` / folder picker · image attachments |
| **ACP** | Full JSON-RPC over stdio: `initialize`, `session/*`, `fs/*`, `terminal/*`, permissions |
| **Usage** | Token and optional cost display when the agent sends `usage_update` |
| **History** | Sessions persisted in VS Code `globalState` with resume |

## Prerequisites

1. **VS Code** 1.90+ (or Cursor / compatible)
2. **Node.js** 18+ (for development / packaging)
3. **Grok Build CLI** installed and authenticated  
   - Install: follow [xAI CLI docs](https://x.ai/cli) (e.g. `curl -fsSL https://x.ai/cli/install.sh | bash`)  
   - Verify: `grok --version`  
   - ACP mode: `grok agent stdio`

## Install (end users)

### From GitHub Release (recommended)

1. Open [Releases](https://github.com/bhuertgen/grok-build-vscode/releases)
2. Download the latest `.vsix`
3. VS Code → Extensions → `…` → **Install from VSIX…**

Or from a clone:

```bash
npm install
npm run build
npm run package
code --install-extension grok-build-vscode-0.2.0.vsix
```

### From source (Extension Development Host)

```bash
npm install
npm run watch
```

Press **F5** in VS Code (launch config *Run Extension*).

## Automated checks

```bash
npm test                 # unit tests (chat format, @-mention, cwd, models)
npm run test:integration # VS Code Extension Host (downloads VS Code once)
npm run test:all         # unit + integration
npm run smoke            # typecheck + build + security markers + unit tests
npm run check            # alias for smoke
```

Manual UX / security scenarios: [docs/TEST_CONCEPT.md](docs/TEST_CONCEPT.md).  
Scroll regression prompts: [docs/SCROLL_TEST_PROMPT.md](docs/SCROLL_TEST_PROMPT.md).

## Security notes

- No API keys or secrets ship in this repository.
- Optional setting `grokBuild.githubToken` is for **your** machine only (private release checks); leave empty and use VS Code GitHub sign-in when possible.
- Chat history is stored in VS Code `globalState` on the user’s machine, not in this repo.
- The official Grok CLI handles auth (`grok` login); this extension does not embed credentials.

## Connect to Grok Build CLI

Default settings assume `grok` is on your `PATH`:

| Setting | Default | Meaning |
|---------|---------|---------|
| `grokBuild.cliPath` | `grok` | Executable path |
| `grokBuild.cliArgs` | `["agent","stdio"]` | ACP entrypoint |
| `grokBuild.defaultMode` | `execute` | `plan` or `execute` |
| `grokBuild.permissionMode` | `ask` | `ask` · `allow-once` · `allow-session` · `allow-always` |
| `grokBuild.showDiffBeforeApply` | `true` | Queue writes for diff review |

Command palette: **Grok Build: Check Grok CLI Status**.

### Protocol flow

```
VS Code Extension (this repo)
    │  spawn: grok agent stdio
    │  JSON-RPC 2.0 over stdin/stdout
    ▼
Grok Build CLI (Rust agent)
    │  session/update, tool calls, permissions
    ▼
Tools / MCP / sub-agents (inside CLI)
```

1. Extension calls `initialize` (fs + terminal capabilities).  
2. `session/new` → agent `sessionId`.  
3. User message → `session/prompt` with text, resources, images.  
4. Agent streams `session/update` (chunks, tool calls, plan, usage).  
5. Agent may call `fs/*`, `terminal/*`, `session/request_permission` on the client.

## Usage

| Action | How |
|--------|-----|
| Open chat | **Activity Bar** Grok-Symbol (links), oder `Ctrl+Shift+G C` |
| File tree | Activity Bar ganz oben **Explorer**, oder `Ctrl+Shift+E` (wenn Grok offen ist, wechselt die linke Leiste) |
| Chat rechts halten | Grok-Panel-Titel per Drag in die **Secondary Side Bar** ziehen (View → Appearance → Secondary Side Bar) |
| New session | `+` in sidebar, or **Grok Build: New Session** |
| Plan mode | Mode button, or `Ctrl+Shift+G P` |
| Add context | `Alt+G` or **@ Context** |
| Ask about file | Explorer / editor context menu → *Ask Grok Build…* |
| Open in editor | Toolbar window icon or **Open Session in Editor** |
| Cancel turn | Stop button or **Grok Build: Cancel Current Turn** |

## Architecture (hybrid)

```
VS Code UI  ──►  SessionManager  ──►  AcpClient × N  ──►  grok agent stdio
 (webview)        multi-session         1 process/session     (official CLI)
```

```
src/
  extension.ts              # Activation, CLI onboard, status bar
  cli/
    detect.ts / onboard.ts  # Graceful CLI install / path setup
  acp/                      # ACP transport + client + handlers
  session/                  # Multi-session; process map
  context/                  # @file @symbol @git + auto context
  edits/                    # Native diff apply/reject
  providers/                # Sidebar + editor webview
  commands/
  util/
webview/                    # Theme-aware chat UI
docs/ARCHITECTURE.md
```

## Development

```bash
npm install
npm run watch          # esbuild watch + copy webview assets
npm run compile        # tsc --noEmit
npm run build          # production bundle → dist/
npm run package        # .vsix via vsce
```

- **F5** → Extension Development Host  
- Logs: **Output** panel → channel **Grok Build**  
- Set `grokBuild.logLevel` to `debug` for full JSON-RPC traces  

## Suggested GitHub layout

```
github.com/<you>/grok-build-vscode
├── src/ webview/ media/
├── README.md  LICENSE  package.json
├── .github/workflows/ci.yml   # npm ci && npm run compile && npm run build
└── docs/architecture.md       # optional deep dive
```

Suggested repo name: **`grok-build-vscode`**.

## Known limitations & roadmap

**Current limitations**

- Voice input is not implemented (optional nice-to-have).  
- Auxiliary window support is via “Open in Editor” (standard editor group); dedicated aux-window API can be added later.  
- Session resume depends on the CLI advertising `loadSession` / `sessionCapabilities.resume`; otherwise local history is kept and a new agent session is created.  
- Model list is driven by agent `configOptions`; if the agent does not advertise them, use the CLI defaults.  
- Diff review uses a custom content-provider scheme; very large files may need streaming improvements.  
- MCP servers are passed as an empty list by default (CLI still loads user/global MCP config from its own environment).

**Roadmap**

- [ ] Wire workspace MCP config into `session/new`  
- [ ] Richer tool-call UI (live terminal embed, collapsible trees)  
- [ ] Voice input (Web Speech API / VS Code speech)  
- [ ] Graphite-style multi-diff batch apply  
- [ ] Telemetry-free usage dashboard across sessions  
- [ ] Marketplace listing + CI-signed VSIX  

## License

MIT

## References

- [Agent Client Protocol](https://agentclientprotocol.com/)  
- [Grok Build / xAI CLI](https://x.ai/cli)  
- [ACP schema](https://agentclientprotocol.com/protocol/v1/schema)
