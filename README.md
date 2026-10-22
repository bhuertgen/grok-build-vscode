# VS Code Client for Grok Build (Unofficial)

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/bhu.grok-build-vscode.svg?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=bhu.grok-build-vscode)
[![Open VSX](https://img.shields.io/open-vsx/v/bhu/grok-build-vscode?label=Open%20VSX)](https://open-vsx.org/extension/bhu/grok-build-vscode)

> **Deutsch:** [docs/de/README.md](docs/de/README.md) — full documentation in German (same content as English).

**Hybrid architecture:** native Visual Studio Code UX on top of the official **xAI Grok Build CLI** via the [Agent Client Protocol](https://agentclientprotocol.com/) (`grok agent stdio`).

- The extension does **not** reimplement the agent loop.
- Each chat session owns its **own** `grok agent stdio` process.
- VS Code supplies UI, context, multi-session, diffs, history, and editor integration.

> **Unofficial community project.** Not affiliated with, sponsored by, or endorsed by xAI. "Grok" and "Grok Build" are trademarks of xAI and are used here only to describe compatibility with the official Grok Build CLI. Planning, tools, MCP, sub-agents, and safety stay in the official CLI.

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
| **Folder trust** | Banner when Grok skips project hooks / `AGENTS.md` / skills; **Trust folder** restarts with `--trust` |
| **Updates** | CLI (`grok update --check`) + extension (store auto-update, or GitHub Releases check for manual VSIX installs) |
| **ACP** | `initialize`, `session/*`, `fs/*`, `terminal/*`, permissions |

## Prerequisites

1. **VS Code** 1.90+ (or compatible)  
2. **Grok Build CLI** installed and authenticated — [x.ai/cli](https://x.ai/cli)  
   - `grok --version` — **1.0.67 or newer recommended** (tested with **1.0.67 stable**; older 1.0.x works with a warning banner)  
3. **Node.js** 18+ only if you build from source  

## Install

Extension id: **`bhu.grok-build-vscode`**. Step-by-step guide (EN/DE): [docs/en/INSTALL_VSIX.md](docs/en/INSTALL_VSIX.md) · [docs/de/INSTALL_VSIX.md](docs/de/INSTALL_VSIX.md)

### VS Code: VS Code Marketplace (recommended)

1. Open **Extensions** (`Ctrl+Shift+X`, Mac: `Cmd+Shift+X`).
2. Search for **`bhu.grok-build-vscode`** and click **Install**.

Or open the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=bhu.grok-build-vscode), or run `code --install-extension bhu.grok-build-vscode`.

### Cursor, VSCodium, Windsurf, Gitpod: Open VSX

These editors install from [Open VSX](https://open-vsx.org/extension/bhu/grok-build-vscode): Extensions view → search **`bhu.grok-build-vscode`** → **Install** (e.g. `cursor --install-extension bhu.grok-build-vscode`, `codium --install-extension bhu.grok-build-vscode`).

Store installs are updated by the editor automatically; the built-in GitHub release check is disabled for them.

### Manual VSIX install (alternative)

Use this for offline machines, a specific version, or editors without store access.

1. [Releases](https://github.com/bhuertgen/grok-build-vscode/releases) → download **`grok-build-vscode-….vsix`** (not "Source code").
2. Press **`Ctrl+Shift+P`** (Mac: **`Cmd+Shift+P`**) → run **Extensions: Install from VSIX…** (German UI: **Erweiterungen: Von VSIX installieren…**) → pick the file → **Reload** if asked.
   Alternative: Extensions view → **`…`** menu (next to the search box) → **Install from VSIX…**.
3. Or from a terminal:

```bash
code --install-extension path/to/grok-build-vscode-x.y.z.vsix
```

Manual VSIX installs check GitHub Releases for newer versions and show a hint in the chat header (turn off with `grokBuild.checkExtensionUpdates`).

> Installed an earlier VSIX (publisher `bhuertgen`, versions ≤ 0.3.3)? The publisher changed to `bhu`, so VS Code treats the new build as a different extension. Uninstall the old **Grok Build for VS Code** entry first to avoid two copies.

### Build locally

```bash
npm install
npm run build
npm run package
code --install-extension grok-build-vscode-x.y.z.vsix
```

`x.y.z` = the version in the `.vsix` file name (`npm run package` uses the version from `package.json`).

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
| Insert context | Composer **`+`**, `Ctrl+Shift+G A` (`Cmd+Shift+G A`), or type **`@`** |
| Actions / model / perms | Composer **`/`** (filterable) |
| Slash commands | Type `/` at start of input |
| Plan mode | Mode button or `Ctrl+Shift+G P` |
| History | `↺` or `/` → Chat-History |
| Focus chat input | `Ctrl+Shift+G I` (`Cmd+Shift+G I`) |
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
| `grokBuild.cliPath` | `grok` | CLI executable. `grok`/empty: PATH + standard install locations; an explicit path is used as-is (error banner if invalid) |
| `grokBuild.openLocation` | `editor` | Chat in middle (`editor`, recommended) or sidebar — keeps Explorer left |
| `grokBuild.defaultMode` | `execute` | `plan` \| `execute` |
| `grokBuild.defaultModel` | `""` | CLI `-m` (empty = CLI default) |
| `grokBuild.permissionMode` | `ask` | UI permission prompts |
| `grokBuild.autoAllowInExecuteMode` | `true` | Auto-allow tools in Execute (avoids hidden permission stalls) |
| `grokBuild.alwaysApprove` | `false` | CLI `--always-approve` |
| `grokBuild.cliPermissionMode` | `""` | CLI `--permission-mode`; `plan` starts sessions in **Plan** (really plan mode from CLI 1.0.65) |
| `grokBuild.checkExtensionUpdates` | `true` | GitHub release check (manual VSIX installs only; store installs never check) |
| `grokBuild.updateRepo` | `bhuertgen/grok-build-vscode` | Repo for extension update checks |
| `grokBuild.logLevel` | `info` | Output channel **Grok Build** |

**Trust the workspace** for writes/tools. First-run recommendations: [INSTALL_VSIX §7](docs/en/INSTALL_VSIX.md#7-recommended-settings-after-install) · [DE](docs/de/INSTALL_VSIX.md#7-empfohlene-settings-nach-der-installation).

**Complete parameter reference** (CLI flags, UI permissions, context, updates):  
→ [docs/en/USER_GUIDE.md §6](docs/en/USER_GUIDE.md#6-all-settings-grokbuild) · [DE](docs/de/USER_GUIDE.md#6-alle-einstellungen-grokbuild)

## Documentation index

| | English | Deutsch |
|--|---------|---------|
| User guide | [en/USER_GUIDE](docs/en/USER_GUIDE.md) | [de/USER_GUIDE](docs/de/USER_GUIDE.md) |
| Architecture | [en/ARCHITECTURE](docs/en/ARCHITECTURE.md) | [de/ARCHITECTURE](docs/de/ARCHITECTURE.md) |
| Multi-agent | [en/MULTI_AGENT](docs/en/MULTI_AGENT.md) | [de/MULTI_AGENT](docs/de/MULTI_AGENT.md) |
| Tests | [en/TEST_CONCEPT](docs/en/TEST_CONCEPT.md) | [de/TEST_CONCEPT](docs/de/TEST_CONCEPT.md) |
| Scroll tests | [en/SCROLL_TEST](docs/en/SCROLL_TEST_PROMPT.md) | [de/SCROLL_TEST](docs/de/SCROLL_TEST_PROMPT.md) |
| Index | [docs/en/README](docs/en/README.md) | [docs/de/README](docs/de/README.md) |
| Install from VSIX | [en/INSTALL_VSIX](docs/en/INSTALL_VSIX.md) | [de/INSTALL_VSIX](docs/de/INSTALL_VSIX.md) |

## Architecture (hybrid)

```
VS Code UI  ──►  SessionManager  ──►  AcpClient × N  ──►  grok agent stdio
 (webview)        multi-session         1 process/session     (official CLI)
```

Effective spawn shape:

```text
grok [--permission-mode … --max-turns … top-level flags…] agent --no-leader -m <model> [--reasoning-effort … --always-approve --debug] stdio
```

Policy flags (`--permission-mode`, `--max-turns`, `--no-subagents`, `--no-plan`, `--disable-web-search`, `--sandbox`, `--tools`, `--disallowed-tools`, `--rules`) are **top-level** `grok` options and go **before** `agent` — `grok agent` rejects them (#37).

## Automated checks

```bash
npm test                 # unit tests
npm run smoke            # typecheck + build + static checks + unit
npm run test:integration # real Extension Host
npm run test:all
```

## Privacy / Data collection

- **No telemetry.** The extension itself sends no telemetry and collects no usage data.
- **Chats, prompts and files** are processed by the locally installed Grok CLI (`grok agent stdio`), under your own xAI / Grok account and [xAI's terms](https://x.ai/legal). The extension only passes your prompts and the context you attach (files, selection, images) to that local process. The CLI also runs its own update check (`grok update --check`).
- **Update check (manual VSIX installs only):** the extension asks the GitHub Releases API (`api.github.com`) for a newer version. Store installs (VS Code Marketplace / Open VSX) skip it. Turn it off with `grokBuild.checkExtensionUpdates: false`.
- **GitHub token:** the optional `grokBuild.githubToken`, or an existing VS Code GitHub sign-in, is sent only to `api.github.com` for that check (e.g. for a private repo) and is used nowhere else.
- **Local storage:** chat history stays on your machine in VS Code's extension storage.
- **VS Code telemetry** is governed by VS Code's own settings (`telemetry.telemetryLevel`), not by this extension.

Details: [docs/en/USER_GUIDE.md §8.1](docs/en/USER_GUIDE.md#81-privacy--data-collection) · [DE](docs/de/USER_GUIDE.md#81-datenschutz--datenerhebung)

## Security

- No API keys in this repository.  
- CLI auth is handled by the official `grok` login.  
- Optional `grokBuild.githubToken` is local-only for private release checks.  
- Chat history lives in VS Code `globalState` on the user machine.  
- Prefer a **trusted** workspace for writes and tools.

## Known limitations

- MCP: CLI loads its own user/global MCP config; extension passes an empty MCP list into `session/new` by default.  
- Sub-agents: monitored via tool timeline / status strip (no per-subagent editor tabs).  
- Install path: VS Code Marketplace and Open VSX; manual VSIX from GitHub Releases as an alternative.  
- Session resume needs CLI `session/resume` (or load); otherwise local history + new agent process.  

## License

MIT

## Trademarks

This is an independent, unofficial community extension. It is not affiliated with, sponsored by, or endorsed by xAI. Grok is a trademark of xAI. All other trademarks belong to their respective owners.

## References

- [Agent Client Protocol](https://agentclientprotocol.com/)  
- [Grok Build / xAI CLI](https://x.ai/cli)  
- [ACP schema](https://agentclientprotocol.com/protocol/v1/schema)  
- [Releases](https://github.com/bhuertgen/grok-build-vscode/releases)
