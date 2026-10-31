# User Guide — VS Code Client for Grok Build (Unofficial)

Complete usage, examples, and every configuration option.  
Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md) · Multi-agent: [MULTI_AGENT.md](./MULTI_AGENT.md).

> **Unofficial community extension.** Not affiliated with, sponsored by, or endorsed by xAI. Grok is a trademark of xAI; the name is used only to describe compatibility with the official Grok Build CLI.  
> Agent logic, safety, and tools live in the **Grok Build CLI** (`grok agent stdio`). This extension is the native VS Code ACP client.

**Language:** English · Deutsch: [../de/USER_GUIDE.md](../de/USER_GUIDE.md)

---

## 1. Quick start

### Requirements

1. **VS Code** ≥ 1.90 (or compatible, e.g. Cursor)  
2. **Grok Build CLI** installed and signed in  
   - Docs: https://x.ai/cli  
   - Check: `grok --version` — **1.0.70 or newer recommended** (tested with **1.0.70 stable**); older 1.0.x works with a warning banner  
3. Optional for development: **Node.js** ≥ 18  

### Install the extension

Extension id: **`bhu.grok-build-vscode`**. **Full walkthrough:** **[INSTALL_VSIX.md](./INSTALL_VSIX.md)**

**Store (recommended):** VS Code installs from the [**VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=bhu.grok-build-vscode); Cursor, VSCodium, Windsurf and Gitpod install from [**Open VSX**](https://open-vsx.org/extension/bhu/grok-build-vscode). Extensions view → search **`bhu.grok-build-vscode`** → **Install**. Store installs update automatically.

**Alternative:** install a **local `.vsix` file** (A below), e.g. offline or for a specific version.

**A) Release — easiest path (Command Palette)**

1. [GitHub Releases](https://github.com/bhuertgen/grok-build-vscode/releases) → download **`….vsix`** (not Source code zip).  
2. In VS Code: **`Ctrl+Shift+P`** / **`Cmd+Shift+P`** (Command Palette).  
3. Type: **`VSIX`**.  
4. Run: **Extensions: Install from VSIX…**  
   (German UI: **Erweiterungen: Von VSIX installieren…**).  
5. Pick the file → Install → Reload if asked.

**A′) UI path with three dots:** **`Ctrl+Shift+X`** (Extensions) → **top row next to the search box** click **`…`** → **Install from VSIX…**.  
It does **not** appear in Marketplace search results — only via `…` or the Command Palette.
**B) From this repo**

```bash
npm install
npm run build
npm run package
code --install-extension grok-build-vscode-x.y.z.vsix
```

`x.y.z` = the version in the `.vsix` file name (`npm run package` uses the version from `package.json`).

### First chat

1. Open a folder and **trust the workspace** (writes/tools need trust).  
2. Activity Bar **Grok** icon, or **Grok Build: Open Chat** (`Ctrl+Shift+G C` / Mac: `Cmd+Shift+G C`).  
3. Default: chat opens in the **middle** editor; Explorer stays on the left.  
4. Status / banner: CLI must be ready — otherwise **Setup CLI…**.  
5. Mode **Execute**, send a message.

---

## 2. UI overview

```
┌─────────────────────────────────────────────────────────────┐
│ Tabs  [Chat1] [Chat2] [+] [↺]     Model  Perm  Execute     │
├─────────────────────────────────────────────────────────────┤
│ Banners: CLI / Trust / Updates / Memory (resume)            │
│ Status: Ready · execute · tokens…                           │
│ Agents strip (running tools)                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Messages (user / Grok / tools / thoughts)                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Context chips (@files)                                      │
│  [+] [/]  Message Grok…                          [↑]        │
└─────────────────────────────────────────────────────────────┘
```

| Element | Role |
|---------|------|
| **Tabs** | Multiple sessions; `+` new; `↺` history for this project |
| **Model / Perm / Execute** | Model, UI permission mode, Plan ↔ Execute |
| **Tool rows** | Compact, expandable; completed tools often grouped |
| **`+`** | Insert: context, image, active file |
| **`/`** | Actions: slash, history, model, permissions, CLI update… |
| **Input** | `Enter` send, `Shift+Enter` newline |

---

## 3. Composer: `+`, `/`, `@`

### 3.1 `+` — Insert

| Item | Effect |
|------|--------|
| **Context / file** | Picker: file, symbol, git, folder, active |
| **Image** | Attach image file(s) |
| **Active file** | Current editor / selection |

### 3.2 `/` — Actions (filterable)

| Section | Examples |
|---------|----------|
| **Session** | Slash commands, new chat, history |
| **Model & mode** | Select model, permission mode, Plan/Execute |
| **Context** | Add context, active file |
| **System** | CLI setup, CLI status, update CLI |

Keys: filter box, `↑`/`↓`, `Enter`, `Esc`.

### 3.3 `@` — Workspace file

1. Type `@` (or `@partial-name`) in the input.  
2. Filter and pick a workspace file.  
3. You see e.g. `@notes/a.md` in the message **and** a context chip.  
4. On send, file content is attached as an ACP resource.

**Example**

```text
@README.md
Summarize the install steps in 3 bullets.
```

### 3.4 Slash in the input

Type `/` at the start of the line for local/agent slash commands (`/help`, `/plan`, `/model`, CLI skills…).  
Many commands come from the **CLI** dynamically; the extension always adds helpers such as `help`, `plan`, `execute`, `clear`, `new`, `context`.

---

## 4. Example workflows

### 4.1 Explain code

```text
@src/extension.ts
Explain activate() and the main event handlers.
```

### 4.2 Create / edit files (Execute)

Mode: **Execute**, workspace trusted.

```text
Create docs/hello.md with a short project intro.
Do not write outside this workspace.
```

### 4.3 Plan only

Mode: **Plan** (button or `Ctrl+Shift+G P`).

```text
Propose a plan to add a Screenshots section to the README.
Do not write files yet.
```

### 4.4 Switch model

1. `/` → **Select model…** (or the **Model** chip).  
2. e.g. `grok-4.5` or `grok-composer-2.5-fast`.  
3. System line: **Active session model: …**  
4. Agent restarts with `-m <id> --no-leader`.

**Note:** For “which model are you?”, trust the **session model id** in the UI/system line, not free-form self-descriptions.

### 4.5 History / resume

- Reopening the same project folder restores the last chat text.  
- Banners:
  - **Session resumed** → CLI resume OK; agent has conversation memory.  
  - **UI history only** → local transcript; optional **Load history into context**.  
- `↺` or `/` → History: other chats for **this** project.

### 4.6 Permissions

| Setting / UI | Meaning |
|--------------|---------|
| **Ask** | Each tool: Allow / Reject (card in chat) |
| **Allow** (card button) | Allows **this call only** (`allow_once`); the next call prompts again. Falls back to `allow_always` only if the agent offers no one-shot option |
| **Allow always** (card button) | Allows this kind of call for the rest of the session |
| **Allow once / session / always** (permission mode) | Fewer prompts |
| **autoAllowInExecuteMode** (default on) | In Execute, tools are not blocked on a hidden dialog |
| **CLI alwaysApprove** | Agent process auto-approves all tools (strong) |

The resolved card shows the decision (**Allowed**, **Allowed always**, **Rejected**, **Cancelled**). Write approvals for a binary or unreadable file (CLI ≥ 1.0.54) show the badge **unreadable – no preview** instead of a diff.

**Git worktrees (CLI ≥ 1.0.67):** if you open a git worktree as the workspace folder (see #15), Grok also applies the main checkout's saved **always allow** answers there (commands, MCP tools, web-fetch domains); saved **never allow** answers apply either way and win. Answers you give in the worktree stay in the worktree. To keep the main checkout's "always allow" answers out of worktrees, set `worktree_inherits_main_approvals = false` under `[features]` in `~/.grok/config.toml` (or `GROK_WORKTREE_INHERITS_MAIN_APPROVALS=false`).

### 4.7 CLI / extension updates

- On start: `grok update --check --json` → **CLI update** banner + status bar.  
- Extension: GitHub Releases for `grokBuild.updateRepo` → **Extension update** banner. Only for manual VSIX installs (`grokBuild.checkExtensionUpdates`); Marketplace / Open VSX installs are updated by the editor and never check GitHub.  
- Commands: **Check Grok CLI Status**, **Update Grok CLI**.

---

## 4.8 Session config (Effort)

When the CLI advertises `configOptions` (select or boolean), the chat header shows a chip next to **Model** — Effort is labeled **Effort**. Model stays on its own chip.

- Select → dropdown, boolean → click toggles on/off.
- Change applies to the **running session** (`session/set_config_option`). The header updates from the agent response / `config_option_update`.
- Unknown option types are hidden.
- `grokBuild.reasoningEffort` remains the process default for the next session (CLI `--reasoning-effort`). It is not rewritten by the chip.
- If the agent advertises no extra options, no chip is shown.
- The Effort choices follow the current model. On a cold CLI start, `session/new` can return a fallback model list without efforts; the chip appears as soon as Grok sends its real catalog (`_x.ai/models/update`), without a new session. A model without reasoning effort shows no Effort chip.

## 4.9 `@file#start-end`

1. Select lines in the editor.
2. `Alt+K` (or **+ → Selection range**) inserts `@rel/path#12-34` into the composer and attaches that range as context.
3. Click the chip to jump back to the range.
4. On send, the mention is parsed and the line slice is sent as a resource block plus the mention text.
5. Empty selection or multi-cursor: a warning, nothing inserted.
6. `Ctrl+Shift+G A` (`Cmd+Shift+G A` on Mac) opens the context picker. You can also add a file by typing `@` in the prompt.

## 4.10 Info lines in the chat

| Line / badge | When |
|--------------|------|
| ℹ️ *Turn stopped by hook (`<hook>`): <reason>* | A CLI hook ended the turn with `continue: false` (CLI ≥ 1.0.60). Shown instead of `(cancelled)` or nothing. The hook id is shortened (`project/stop:pre_tool_use[0]…` → `project/stop`). |
| ℹ️ *Prompt blocked because a hook failed (`<hook>`): <reason>* | A `failClosed` UserPromptSubmit hook timed out or crashed (CLI alpha ≥ 1.0.71). The prompt never reaches the model. A fail-closed PreToolUse hook does not end the turn: the tool row shows **failed** and, when expanded, the CLI text `Hook denied: …`. |
| **unreadable – no preview** | A write approval targets a binary/unreadable file (CLI ≥ 1.0.54); no diff is attempted. |
| `grok update` hint | `cliPermissionMode: plan` on a CLI older than 1.0.65 (the session starts in `defaultMode`). |
| **Session resumed** / **Local history loaded** | A stored chat was restored. A chat keeps at most one of each after its last message, also after several reloads (#52). |
| **Folder trusted for Grok** | You chose **Trust folder**; see §4.11. |

With a German VS Code display language, the hook-stop line, the unreadable badge and the permission decision labels are localized ("Turn durch Hook beendet", "nicht lesbar – keine Vorschau", "Erlaubt" / "Immer erlaubt" / "Abgelehnt" / "Abgebrochen"); all other UI text is English.

## 4.11 Grok folder trust (project hooks, rules, skills)

Grok CLI loads a project's **hooks**, **project rules** (`AGENTS.md`, `CLAUDE.md`, `.grok/rules/` …), **project skills** (`.grok/skills/` …) and **project MCP servers** (`.mcp.json`, `.grok/config.toml`) only from a folder it trusts. Over ACP there is no trust prompt: in an untrusted folder these files are **skipped silently**. Your user-level hooks and rules (`~/.grok/…`) still apply.

When the workspace folder has such files and Grok does not trust it, the chat shows an amber banner **Grok ignores project settings in "<folder>"** that lists what was found, e.g. *hooks (.grok/hooks/pre.json), project rules (AGENTS.md)*.

- **Trust folder** (only in a trusted VS Code workspace) asks for confirmation (**Trust and Restart Agent**), then restarts the folder's agents with the top-level `--trust` flag (`grok --trust agent … stdio`). Grok saves the decision in `~/.grok/trusted_folders.toml` (or `$GROK_HOME`), so later starts need no flag. A chat with a conversation keeps it (the agent session is resumed): project hooks and MCP servers are active right away, project rules and skills are read when a chat starts, so open a new chat (**+**) to apply them. An empty chat gets a fresh agent session with everything loaded. Busy chats are not interrupted. The chat shows a **Folder trusted for Grok** line.
- In **Restricted Mode** the banner has no **Trust folder** button: trust the workspace in VS Code first.
- **Dismiss** hides the banner for this folder (remembered per workspace). The command **Grok Build: Trust Folder for Grok CLI** stays available.
- A grant covers subfolders of the same git repository; a nested git checkout needs its own. Grok does not gate the home directory or the filesystem root.
- No banner when folder trust is turned off in the CLI (`GROK_FOLDER_TRUST=0` or `[folder_trust] enabled = false` in `~/.grok/config.toml`).
- To revoke, delete the folder's entry from `~/.grok/trusted_folders.toml` (or use `/hooks-trust` in the Grok TUI).

Only trust folders whose hooks and MCP servers you have reviewed: hooks run shell commands.

## 4.12 Clickable paths and pull requests

In **Grok's answers** (your own messages stay plain text):

- A path that looks like a file is a link: `src/cli/compat.ts`, `./README.md`, `../docs/en/USER_GUIDE.md`, `src/cli/compat.ts:42`, `src/cli/compat.ts:42:7`. Click it to open the file. With a line (and optional column) the editor selects that position; lines and columns start at 1. `path:10-20` selects that line range.
- The file has to exist. A relative path is resolved against the open workspace folders (first match). An absolute path, including one outside the workspace, opens when that file exists. Otherwise the editor shows **File not found**.
- These stay plain text: a bare name (`README.md`), a package version (`1.0.72`, `lodash@4.17.21`), a URL, and a markdown `[label](https://…)` link. Those https links still open in the browser.
- `#123` opens that issue or pull request when the workspace has a git remote (GitHub, GitLab, Bitbucket, or a similar forge; read once from `origin`, otherwise the first remote). With no remote, `#123` stays plain text. GitHub-style remotes use `/issues/123` (GitHub sends pull requests there). GitLab remotes use `/-/issues/123`.
- Subagent and task ids are not links.

## 5. Commands (Command Palette: “Grok Build”)

| Command | Purpose |
|---------|---------|
| Open Chat | Open chat |
| Open in Editor (middle) | Chat in the middle editor |
| Open Beside / In Sidebar | Layout variants |
| New Session | New chat + new CLI process |
| Chat History (this project) | Saved sessions |
| Clear Chat History | Clear project or all |
| Toggle / Set Plan / Execute | Mode |
| Select Model / Permission Mode | Pickers |
| Add Context / File / Folder / Selection | Context |
| Insert Selection as @file#range | `@path#start-end` from the editor selection |
| Cancel Current Turn | Abort running prompt |
| Apply / Reject / Apply All Edits | Diffs when offered |
| Show Diff | Show diff |
| Check / Setup / Update CLI | CLI management |
| Trust Folder for Grok CLI | Restart the agent with `--trust` so Grok loads project hooks, rules, skills and MCP servers (§4.11) |
| Focus Chat Input | Focus the input |

### Keybindings

Every entry in `contributes.keybindings`. A chord is two steps: press `Ctrl+Shift+G` (Mac: `Cmd+Shift+G`), release, then the letter or Escape. `Ctrl+Shift+G I` runs **Focus Chat Input**: it opens the Grok UI if needed and focuses the composer. It does not move focus back to the editor. `Alt+G` is not bound (on Windows/Linux it opens the Go menu). `Ctrl+Esc` is not bound either: Windows opens the Start menu and VS Code never receives it.

| Action | Windows / Linux | Mac | When |
|--------|-----------------|-----|------|
| Add Context (Quick Pick) | `Ctrl+Shift+G` then `A` | `Cmd+Shift+G` then `A` | Always (no `when`) |
| Insert `@file#start-end` for the editor selection | `Alt+K` | `Option+K` | Text editor focused (`editorTextFocus`) |
| New Session | `Ctrl+Shift+G` then `N` | `Cmd+Shift+G` then `N` | Always (no `when`) |
| Toggle Plan Mode | `Ctrl+Shift+G` then `P` | `Cmd+Shift+G` then `P` | Always (no `when`) |
| Open Chat | `Ctrl+Shift+G` then `C` | `Cmd+Shift+G` then `C` | Always (no `when`) |
| Cancel current turn | `Ctrl+Shift+G` then `Escape` | `Cmd+Shift+G` then `Escape` | A turn is running (`grokBuild.isBusy`) |
| Cancel current turn (webview) | `Escape` | `Escape` | Chat focused and a turn is running (closes menus first) |
| Focus chat input | `Ctrl+Shift+G` then `I` | `Cmd+Shift+G` then `I` | Always (no `when`) |

Composer keys (`Enter` to send, `@`, `/`, arrow keys) are not extension keybindings. See §3.

---

## 6. All settings (`grokBuild.*`)

Open Settings (`Ctrl+,`) and search **Grok Build**.

### Recommended (QA / first-run)

| Setting | Value | Why we set / recommend it |
|---------|-------|---------------------------|
| **Workspace Trust** | Trust the folder | Without trust, writes and tools stay blocked |
| `openLocation` | `editor` | Files + chat side by side; Explorer stays left (`Open Beside` is best for coding) |
| `defaultMode` | `execute` | Agent can run tools after permissions; use Plan toggle when you only want a plan |
| `autoAllowInExecuteMode` | `true` | Execute does not stall on a hidden permission dialog |
| `permissionMode` | `ask` | Still prompt when Plan or auto-allow is off |

Install walkthrough also lists these: [INSTALL_VSIX.md §7](./INSTALL_VSIX.md#7-recommended-settings-after-install).

### 6.1 Startup & layout

| Setting | Default | Description |
|---------|---------|-------------|
| `cliPath` | `grok` | Path to the CLI. Empty or `grok`: PATH, then `~/.local/bin`, `~/.grok/bin`, `/usr/local/bin`. An explicit path is used **as-is** for both detection and agent start (no fallback); a missing / non-executable path shows an **Invalid grokBuild.cliPath** banner with **Open Setting**. Changing the setting re-detects the CLI right away (header version, compat banner, update check) and clears the banner as soon as the path is fixed — no window reload needed. |
| `cliArgs` | `["agent","stdio"]` | Base args for ACP |
| `openLocation` | `editor` | `editor` = middle (recommended for Files + Chat); `sidebar` = activity bar |
| `defaultMode` | `execute` | `plan` \| `execute` — prefer execute for agent work, Plan for review-only |
| `logLevel` | `info` | `error` \| `warn` \| `info` \| `debug` |

### 6.2 Model & CLI agent flags

| Setting | Default | CLI / effect |
|---------|---------|----------------|
| `defaultModel` | `""` | `-m` / `--model` (empty = CLI default) |
| `reasoningEffort` | `""` | `--reasoning-effort` (default for **new** sessions). If the agent advertises an Effort / config option, the chat header chip overrides it **for the live session** via ACP `session/set_config_option` without rewriting this setting. |
| `cliPermissionMode` | `""` | `--permission-mode` (`default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`), top-level flag. **`plan`:** per the CLI changelog, from CLI **1.0.65** the agent really starts in plan mode; new sessions then start in **Plan** in the UI (overrides `defaultMode`), so tool calls are prompted instead of auto-allowed. Grok does not report the mode over ACP, so the UI derives it from this setting and the CLI version. Older CLIs start in the default mode; the chat shows a hint to run `grok update`. **`auto`:** Grok checks tool calls and runs routine ones without asking; a call it will not auto-allow shows the normal permission card in the chat. Since CLI **1.0.64** a shell command runs without a prompt only if **every** sub-command (each part of a `&&`, `;` or `|` chain) matches an allowlist rule, and rules read words the way bash does (quotes, escapes). Chained commands therefore prompt more often than before. Not passed when `alwaysApprove` is on. |
| `alwaysApprove` | `false` | `--always-approve` |
| `maxTurns` | `null` | `--max-turns` |
| `noSubagents` | `false` | `--no-subagents` |
| `noPlan` | `false` | `--no-plan` |
| `memory` | `"default"` | Env `GROK_MEMORY`: `on` → `1`, `off` → `0`, `default` → CLI config (`[memory] enabled`). CLI ≥1.0.51 has memory on/off only; no CLI flag is passed. |
| `noMemory` | `false` | **Deprecated** → use `memory: "off"`. Still mapped to `GROK_MEMORY=0` when `memory` is `default`. |
| `experimentalMemory` | `false` | **Deprecated** → use `memory: "on"`. Still mapped to `GROK_MEMORY=1` when `memory` is `default` (`noMemory` wins). |
| `disableWebSearch` | `false` | `--disable-web-search` |
| `sandbox` | `""` | `--sandbox <PROFILE>` |
| `tools` | `""` | `--tools` allow-list (comma-separated) |
| `disallowedTools` | `""` | `--disallowed-tools` |
| `rules` | `""` | `--rules` extra system rules |
| `debug` | `false` | `--debug` |
| `extraCliArgs` | `[]` | Extra args after `agent` (agent-level only; top-level flags have dedicated settings) |

**Example** `settings.json`:

```json
{
  "grokBuild.defaultModel": "grok-4.5",
  "grokBuild.reasoningEffort": "high",
  "grokBuild.debug": true,
  "grokBuild.logLevel": "debug"
}
```

### 6.3 UI permissions & context

| Setting | Default | Description |
|---------|---------|-------------|
| `permissionMode` | `ask` | How the UI answers `session/request_permission`. Options are picked by ACP kind, never by name or order: `ask` prompts; `allow-once` auto-selects the one-shot **allow_once** option (no session-wide grant; prompts if the agent offers none); `allow-session` auto-selects **allow_once** for every request in this VS Code session (falls back to allow_always only if no one-shot option exists), so switching back to `ask` takes effect immediately; `allow-always` selects **allow_always** and starts the CLI with `--always-approve`. Reject-kind options ("Disallow", "Don't allow") are never auto-selected |
| `autoAllowInExecuteMode` | `true` | Auto-allow tools in Execute (recommended so Execute is not blocked on a hidden dialog) |
| `showDiffBeforeApply` | `false` | Toast “Show Diff” after write (write does **not** block the agent) |
| `autoIncludeActiveFile` | `true` | Attach active editor file as context |
| `autoIncludeSelection` | `true` | Attach current selection |
| `maxContextFileBytes` | `200000` | Max bytes per context file |
| `sessionHistoryLimit` | `50` | Max stored sessions |
| `enableTerminal` | `true` | Allow ACP `terminal/*` |

### 6.4 Updates

| Setting | Default | Description |
|---------|---------|-------------|
| `checkExtensionUpdates` | `true` | GitHub release check for manual VSIX installs (store builds never check) |
| `updateRepo` | `bhuertgen/grok-build-vscode` | GitHub `owner/repo` for extension releases |
| `githubToken` | `""` | Optional token (private); prefer VS Code GitHub sign-in |
| `checkPrereleaseUpdates` | `false` | Include pre-releases |

---

## 7. CLI args the extension builds

Effective shape (simplified):

```text
grok [top-level flags…] agent --no-leader -m <model> [agent flags…] stdio
```

- **Top-level flags** sit **before** `agent`: `--trust` (only after **Trust folder**, §4.11), `--permission-mode`, `--max-turns`, `--no-subagents`, `--no-plan`, `--disable-web-search`, `--sandbox`, `--tools`, `--disallowed-tools`, `--rules`. `grok agent` rejects them with `unexpected argument` (#37).
- **Agent flags** sit **between** `agent` and `stdio` (not after `stdio`): `-m`, `--reasoning-effort`, `--always-approve`, `--no-leader`, `--debug`, plus `extraCliArgs`.  
- `--no-leader`: one process per session so `-m` applies.  
- Logs: Output channel **Grok Build** → `Starting agent: …`.

---

## 8. History, trust, security

| Topic | Behavior |
|-------|----------|
| **History** | Local VS Code `globalState`, scoped by workspace `cwd` |
| **Trust** | Restricted Mode → banner. Write-like permissions (ACP kind `edit`, `delete`, `move`, `execute`; for kind `other` a title with write/edit/create/delete/move/rename) are auto-rejected and the trust prompt opens. Reads, searches and fetches are **not** rejected and do not prompt. File writes by the agent (`fs/write_text_file`) fail with a clear error until you trust the folder |
| **Grok folder trust** | Separate from VS Code workspace trust: Grok itself skips project hooks, rules, skills and MCP servers in folders it does not trust. Banner + **Trust folder** (§4.11) |
| **Auth** | CLI only (`grok` login); no keys in the repo |
| **Outside workspace** | Agent file reads and writes through the extension (ACP `fs/read_text_file`, `fs/write_text_file`) are limited to the open workspace folders (all folders of a multi-root workspace; the agent `cwd` when no folder is open). `..` and symlinks are resolved first; Windows paths compare case-insensitively, and a `\\?\` or `\\?\UNC\` prefix, a `\\.\C:\` drive path, `/` versus `\`, and trailing dots or spaces are the same file. Any other path opens a modal "Grok wants to read / write to a file outside the workspace." with the resolved path: **Allow once** (this request; re-reads of the same file during the next minute do not ask again, writes stay one-shot), **Allow for this session** (that path, until the agent restarts; a write approval also covers reads) or **Cancel** = deny; the agent then gets a clear error and Output **Grok Build** logs a warning. Reads of a file that does not exist outside the workspace fail with "not found" without a dialog (the CLI reads a new file before writing it). This applies in trusted workspaces too. Commands the CLI runs itself (shell tools) are not covered; there the CLI permission prompt and sandbox apply |

---

## 8.1 Privacy / data collection

Deutsch: [../de/USER_GUIDE.md §8.1](../de/USER_GUIDE.md#81-datenschutz--datenerhebung)

- **No telemetry.** The extension itself sends no telemetry and collects no usage data.
- **Chats, prompts and files** are processed by the locally installed Grok CLI (`grok agent stdio`), under your own xAI / Grok account and [xAI's terms](https://x.ai/legal). The extension only passes your prompts and the context you attach (files, selection, images) to that local process. The CLI also runs its own update check (`grok update --check`).
- **Update check (manual VSIX installs only):** the extension asks the GitHub Releases API (`api.github.com`) for a newer version. Store installs (VS Code Marketplace / Open VSX) skip it. Turn it off with `grokBuild.checkExtensionUpdates: false`.
- **GitHub token:** the optional `grokBuild.githubToken`, or an existing VS Code GitHub sign-in, is sent only to `api.github.com` for that check (e.g. for a private repo) and is used nowhere else.
- **Local storage:** chat history stays on your machine in VS Code's extension storage (`globalState`).
- **VS Code telemetry** is governed by VS Code's own settings (`telemetry.telemetryLevel`), not by this extension.

## 9. Troubleshooting

| Symptom | What to try |
|---------|-------------|
| CLI missing | **Setup CLI…** / set `cliPath` |
| "Invalid grokBuild.cliPath" banner | Click **Open Setting**, fix or clear the path |
| No writes | **Trust** the workspace |
| `AGENTS.md`, project hooks or skills ignored | Grok does not trust the folder: use **Trust folder** in the banner or **Grok Build: Trust Folder for Grok CLI** (§4.11) |
| No Effort chip | The current model has no reasoning effort, or the CLI has not sent its model catalog yet (cold start); it appears without a new session (§4.8) |
| Chat tab reloads after **Don't Trust** | Expected: VS Code restarts the extension host when a local folder goes from Trusted to Restricted Mode. Grok replaces its editor tab with a fresh one (same sessions, Restricted Mode banner). Trusting again needs no restart. If a stale tab remains, close it or run **Developer: Reload Window** |
| Model switch “hangs” | “Switching model…”; 45s timeout; check **Grok Build** output |
| Agent names wrong model | UI system line / chip is authoritative |
| `@` empty | Workspace needs files |
| Scroll jitter | Current build; [SCROLL_TEST_PROMPT.md](./SCROLL_TEST_PROMPT.md) |
| No extension update banner | Need a newer GitHub Release than installed version; private repos need GitHub sign-in; store installs and `checkExtensionUpdates: false` never show it |
| CLI experiments change agent behavior | `GROK_DISABLE_EXPERIMENTS` (or `[experiments] enabled = false` in `~/.grok/config.toml`) disables all `[[experiments]]`. The extension does not set this; `grok agent stdio` inherits the variable |

---

## 10. Development

```bash
npm install
npm run watch              # esbuild + webview copy
npm run compile            # tsc
npm run build              # production → dist/
npm run package            # .vsix
npm test                   # unit
npm run smoke              # build + static checks + unit
npm run test:integration   # Extension Host
```

- **F5** → Extension Development Host  
- Logs: **Grok Build**; `logLevel: debug` for more detail  

Related docs:

| File | Contents |
|------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Hybrid design, ACP roles |
| [MULTI_AGENT.md](./MULTI_AGENT.md) | Sub-agents, UI monitoring |
| [TEST_CONCEPT.md](./TEST_CONCEPT.md) | Systematic U/F/S tests |
| [SCROLL_TEST_PROMPT.md](./SCROLL_TEST_PROMPT.md) | Scroll regression |

---

## 11. Known limits

- MCP: CLI loads its own config; extension passes an empty MCP list into `session/new` by default.  
- Sub-agents: tool timeline / status strip only (no per-subagent editor tabs).  
- Install: VS Code Marketplace and Open VSX; manual VSIX from GitHub Releases as an alternative.  
- Voice input: not implemented.  

---

*Docs for extension v0.3.x — for setting enums, `package.json` contributions are the source of truth.*
