# Grok Build for VS Code

**Hybrid architecture:** native Visual Studio Code UX on top of the official **xAI Grok Build CLI** via the [Agent Client Protocol](https://agentclientprotocol.com/) (`grok agent stdio`).

- The extension does **not** reimplement the agent loop.
- Each chat session owns its **own** `grok agent stdio` process.
- VS Code supplies UI, context, multi-session, diffs, history, and editor integration.

> **Not affiliated with xAI.** Planning, tools, MCP, sub-agents, and safety stay in the official Rust CLI.

**Full user guide (settings, examples, commands):** [docs/USER_GUIDE.md](docs/USER_GUIDE.md)  
**Docs language:** English (repository standard). Multi-language would mean separate files under e.g. `docs/de/` — not maintained in parallel unless requested.

## Features

| Area | What you get |
|------|----------------|
| **Chat UI** | Theme-aware webview, streaming, collapsible tools/thoughts |
| **Composer** | `+` insert · `/` actions · `@` workspace files |
| **Multi-session** | Tabs; one CLI process per chat |
| **Plan / Execute** | UI, commands, keybindings |
| **Context** | `@file`, chips, auto active file/selection, images, explorer menus |
| **History** | Per-folder restore; resume or seed local transcript |
| **Models** | Picker + `-m` respawn; grounded model id in prompts |
| **Permissions** | UI ask/allow + optional Execute auto-allow |
| **Updates** | CLI (`grok update --check`) + extension (GitHub Releases) |
| **ACP** | `initialize`, `session/*`, `fs/*`, `terminal/*`, permissions |

## Prerequisites

1. **VS Code** 1.90+ (or compatible)  
2. **Grok Build CLI** installed and authenticated — [x.ai/cli](https://x.ai/cli)  
   - `grok --version`  
3. **Node.js** 18+ only if you build from source  

## Install

### From GitHub Release (recommended)

1. [Releases](https://github.com/bhuertgen/grok-build-vscode/releases)  
2. Download the latest `.vsix`  
3. Extensions → `…` → **Install from VSIX…**

### Build locally

```bash
npm install
npm run build
npm run package
code --install-extension grok-build-vscode-0.2.0.vsix
```

### Development

```bash
npm install
npm run watch   # F5 → Extension Development Host
```

## Quick usage

| Action | How |
|--------|-----|
| Open chat | Activity Bar **Grok**, or `Ctrl+Shift+G C` (`Cmd+Shift+G C` on Mac) |
| New session | `+` tab or `Ctrl+Shift+G N` |
| Insert context | Composer **`+`**, or `Alt+G`, or type **`@`** |
| Actions / model / perms | Composer **`/`** (filterable) |
| Slash commands | Type `/` at start of input |
| Plan mode | Mode button or `Ctrl+Shift+G P` |
| History | `↺` or `/` → Chat-History |
| Cancel turn | Stop or `Ctrl+Shift+G Escape` (when busy) |

### Example prompts

```text
@README.md
Summarize installation in 3 bullets.
```

```text
Create docs/notes.md with a short project intro. Stay inside this workspace.
```

More examples and **every setting**: [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

## Important settings

| Setting | Default | Role |
|---------|---------|------|
| `grokBuild.cliPath` | `grok` | CLI executable |
| `grokBuild.openLocation` | `editor` | Chat in middle (`editor`) or sidebar |
| `grokBuild.defaultMode` | `execute` | `plan` \| `execute` |
| `grokBuild.defaultModel` | `""` | CLI `-m` (empty = CLI default) |
| `grokBuild.permissionMode` | `ask` | UI permission prompts |
| `grokBuild.autoAllowInExecuteMode` | `true` | Auto-allow tools in Execute |
| `grokBuild.alwaysApprove` | `false` | CLI `--always-approve` |
| `grokBuild.updateRepo` | `bhuertgen/grok-build-vscode` | Extension update checks |
| `grokBuild.logLevel` | `info` | Output channel **Grok Build** |

**Complete parameter reference** (CLI flags, UI permissions, context, updates):  
→ [docs/USER_GUIDE.md §6](docs/USER_GUIDE.md#6-alle-settings-grokbuild)

## Documentation index

| Doc | Contents |
|-----|----------|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | **User manual**: UI, examples, all settings, troubleshooting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Hybrid design, ACP surface, folder layout |
| [docs/MULTI_AGENT.md](docs/MULTI_AGENT.md) | Sub-agent monitoring |
| [docs/TEST_CONCEPT.md](docs/TEST_CONCEPT.md) | QA matrix (usability / function / security) |
| [docs/SCROLL_TEST_PROMPT.md](docs/SCROLL_TEST_PROMPT.md) | Scroll regression prompts |

## Architecture (hybrid)

```
VS Code UI  ──►  SessionManager  ──►  AcpClient × N  ──►  grok agent stdio
 (webview)        multi-session         1 process/session     (official CLI)
```

Effective spawn shape:

```text
grok agent --no-leader -m <model> [flags…] stdio
```

## Automated checks

```bash
npm test                 # unit tests
npm run smoke            # typecheck + build + static checks + unit
npm run test:integration # real Extension Host
npm run test:all
```

## Security

- No API keys in this repository.  
- CLI auth is handled by the official `grok` login.  
- Optional `grokBuild.githubToken` is local-only for private release checks.  
- Chat history lives in VS Code `globalState` on the user machine.  
- Prefer a **trusted** workspace for writes and tools.

## Known limitations

- MCP: CLI loads its own user/global MCP config; extension passes an empty MCP list into `session/new` by default.  
- Sub-agents: monitored via tool timeline / status strip (no per-subagent editor tabs).  
- Install path: primarily **VSIX / GitHub Releases** (Marketplace optional later).  
- Session resume needs CLI `session/resume` (or load); otherwise local history + new agent process.  

## License

MIT

## References

- [Agent Client Protocol](https://agentclientprotocol.com/)  
- [Grok Build / xAI CLI](https://x.ai/cli)  
- [ACP schema](https://agentclientprotocol.com/protocol/v1/schema)  
- [Releases](https://github.com/bhuertgen/grok-build-vscode/releases)
