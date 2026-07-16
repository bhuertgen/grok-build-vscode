# Grok Build for VS Code

**Hybrid architecture:** native Visual Studio Code UX on top of the official **xAI Grok Build CLI** via the [Agent Client Protocol](https://agentclientprotocol.com/) (`grok agent stdio`).

- The extension does **not** reimplement the agent loop.
- Each chat session owns its **own** `grok agent stdio` process.
- VS Code supplies UI, context, multi-session, diffs, history, and editor integration.

> **Not affiliated with xAI.** Planning, tools, MCP, sub-agents, and safety stay in the official Rust CLI.

**User guide:** [English](docs/en/USER_GUIDE.md) · [Deutsch](docs/de/USER_GUIDE.md)  
**Docs index:** [docs/README.md](docs/README.md) (`docs/en/` + `docs/de/`)  
**UI language:** English.

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

**Detailed click path (EN/DE):**  
[docs/en/INSTALL_VSIX.md](docs/en/INSTALL_VSIX.md) · [docs/de/INSTALL_VSIX.md](docs/de/INSTALL_VSIX.md)

1. Open [Releases](https://github.com/bhuertgen/grok-build-vscode/releases) and download **`grok-build-vscode-….vsix`** (not “Source code”).  
2. In VS Code press **`Ctrl+Shift+X`** (Mac: **`Cmd+Shift+X`**) to open **Extensions**.  
3. At the **top** of that view, next to the search box, click the **`…`** (three dots).  
4. Choose **Install from VSIX…**  
   - German VS Code: **Von VSIX installieren…**  
5. Select the downloaded `.vsix` → Install → **Reload** if asked.

**If you cannot find `…`:** press **`Ctrl+Shift+P`** → type `Install from VSIX` → run  
**Extensions: Install from VSIX…** (DE: **Erweiterungen: Von VSIX installieren…**).

**Terminal alternative:**

```bash
code --install-extension path/to/grok-build-vscode-0.2.1.vsix
```

### Build locally

```bash
npm install
npm run build
npm run package
code --install-extension grok-build-vscode-0.2.1.vsix
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

More examples and **every setting**: [docs/en/USER_GUIDE.md](docs/en/USER_GUIDE.md) ([DE](docs/de/USER_GUIDE.md)).

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
→ [docs/en/USER_GUIDE.md §6](docs/en/USER_GUIDE.md#6-all-settings-grokbuild) · [DE overview](docs/de/USER_GUIDE.md#6-settings-grokbuild)

## Documentation index

| | English | Deutsch |
|--|---------|---------|
| User guide | [en/USER_GUIDE](docs/en/USER_GUIDE.md) | [de/USER_GUIDE](docs/de/USER_GUIDE.md) |
| Architecture | [en/ARCHITECTURE](docs/en/ARCHITECTURE.md) | [de/ARCHITECTURE](docs/de/ARCHITECTURE.md) |
| Multi-agent | [en/MULTI_AGENT](docs/en/MULTI_AGENT.md) | [de/MULTI_AGENT](docs/de/MULTI_AGENT.md) |
| Tests | [en/TEST_CONCEPT](docs/en/TEST_CONCEPT.md) | [de/TEST_CONCEPT](docs/de/TEST_CONCEPT.md) |
| Scroll tests | [en/SCROLL_TEST](docs/en/SCROLL_TEST_PROMPT.md) | [de/SCROLL_TEST](docs/de/SCROLL_TEST_PROMPT.md) |
| Index | [docs/README](docs/README.md) | same |

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
