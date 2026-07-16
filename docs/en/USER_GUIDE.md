# User Guide — Grok Build for VS Code

Complete usage, examples, and every configuration option.  
Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md) · Multi-agent: [MULTI_AGENT.md](./MULTI_AGENT.md).

> **Not affiliated with xAI.** Agent logic, safety, and tools live in the **Grok Build CLI** (`grok agent stdio`). This extension is the native VS Code ACP client.

**Language:** English · Deutsch: [../de/USER_GUIDE.md](../de/USER_GUIDE.md)

---

## 1. Quick start

### Requirements

1. **VS Code** ≥ 1.90 (or compatible, e.g. Cursor)  
2. **Grok Build CLI** installed and signed in  
   - Docs: https://x.ai/cli  
   - Check: `grok --version`  
3. Optional for development: **Node.js** ≥ 18  

### Install the extension

The extension is **not** in Marketplace search. You install a **local `.vsix` file**.  
**Full walkthrough (recommended):** **[INSTALL_VSIX.md](./INSTALL_VSIX.md)**

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
code --install-extension grok-build-vscode-0.2.2.vsix
```

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
| **Allow once / session / always** | Fewer prompts |
| **autoAllowInExecuteMode** (default on) | In Execute, tools are not blocked on a hidden dialog |
| **CLI alwaysApprove** | Agent process auto-approves all tools (strong) |

### 4.7 CLI / extension updates

- On start: `grok update --check --json` → **CLI update** banner + status bar.  
- Extension: GitHub Releases for `grokBuild.updateRepo` → **Extension update** banner.  
- Commands: **Check Grok CLI Status**, **Update Grok CLI**.

---

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
| Cancel Current Turn | Abort running prompt |
| Apply / Reject / Apply All Edits | Diffs when offered |
| Show Diff | Show diff |
| Check / Setup / Update CLI | CLI management |
| Focus Chat Input | Focus the input |

### Keybindings

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+G C` (`Cmd+Shift+G C`) | Open Chat |
| `Ctrl+Shift+G N` | New Session |
| `Ctrl+Shift+G P` | Toggle Plan Mode |
| `Ctrl+Shift+G I` | Focus Input |
| `Ctrl+Shift+G Escape` | Cancel (when busy) |
| `Alt+G` | Add Context |

---

## 6. All settings (`grokBuild.*`)

Open Settings (`Ctrl+,`) and search **Grok Build**.

### 6.1 Startup & layout

| Setting | Default | Description |
|---------|---------|-------------|
| `cliPath` | `grok` | Path to the CLI |
| `cliArgs` | `["agent","stdio"]` | Base args for ACP |
| `openLocation` | `editor` | `editor` = middle; `sidebar` = activity bar |
| `defaultMode` | `execute` | `plan` \| `execute` |
| `logLevel` | `info` | `error` \| `warn` \| `info` \| `debug` |

### 6.2 Model & CLI agent flags

| Setting | Default | CLI / effect |
|---------|---------|----------------|
| `defaultModel` | `""` | `-m` / `--model` (empty = CLI default) |
| `reasoningEffort` | `""` | `--reasoning-effort` |
| `cliPermissionMode` | `""` | `--permission-mode` (`default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`) |
| `alwaysApprove` | `false` | `--always-approve` |
| `maxTurns` | `null` | `--max-turns` |
| `noSubagents` | `false` | `--no-subagents` |
| `noPlan` | `false` | `--no-plan` |
| `noMemory` | `false` | `--no-memory` |
| `experimentalMemory` | `false` | `--experimental-memory` |
| `disableWebSearch` | `false` | `--disable-web-search` |
| `sandbox` | `""` | `--sandbox <PROFILE>` |
| `tools` | `""` | `--tools` allow-list (comma-separated) |
| `disallowedTools` | `""` | `--disallowed-tools` |
| `rules` | `""` | `--rules` extra system rules |
| `debug` | `false` | `--debug` |
| `extraCliArgs` | `[]` | Extra args after `agent` |

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
| `permissionMode` | `ask` | How the UI answers `session/request_permission` |
| `autoAllowInExecuteMode` | `true` | Auto-allow tools in Execute |
| `showDiffBeforeApply` | `false` | Toast “Show Diff” after write (write does **not** block the agent) |
| `autoIncludeActiveFile` | `true` | Attach active editor file as context |
| `autoIncludeSelection` | `true` | Attach current selection |
| `maxContextFileBytes` | `200000` | Max bytes per context file |
| `sessionHistoryLimit` | `50` | Max stored sessions |
| `enableTerminal` | `true` | Allow ACP `terminal/*` |

### 6.4 Updates

| Setting | Default | Description |
|---------|---------|-------------|
| `updateRepo` | `bhuertgen/grok-build-vscode` | GitHub `owner/repo` for extension releases |
| `githubToken` | `""` | Optional token (private); prefer VS Code GitHub sign-in |
| `checkPrereleaseUpdates` | `false` | Include pre-releases |

---

## 7. CLI args the extension builds

Effective shape (simplified):

```text
grok agent --no-leader -m <model> [more flags…] stdio
```

- Flags sit **between** `agent` and `stdio` (not after `stdio`).  
- `--no-leader`: one process per session so `-m` applies.  
- Logs: Output channel **Grok Build** → `Starting agent: …`.

---

## 8. History, trust, security

| Topic | Behavior |
|-------|----------|
| **History** | Local VS Code `globalState`, scoped by workspace `cwd` |
| **Trust** | Restricted Mode → banner; writes/tools limited |
| **Auth** | CLI only (`grok` login); no keys in the repo |
| **Outside workspace** | Prefer workspace-only; trust + CLI safety |

---

## 9. Troubleshooting

| Symptom | What to try |
|---------|-------------|
| CLI missing | **Setup CLI…** / set `cliPath` |
| No writes | **Trust** the workspace |
| Model switch “hangs” | “Switching model…”; 45s timeout; check **Grok Build** output |
| Agent names wrong model | UI system line / chip is authoritative |
| `@` empty | Workspace needs files |
| Scroll jitter | Current build; [SCROLL_TEST_PROMPT.md](./SCROLL_TEST_PROMPT.md) |
| No extension update banner | Need a newer GitHub Release than installed version; private repos need GitHub sign-in |

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
- Install: primarily **VSIX / GitHub Releases**.  
- Voice input: not implemented.  

---

*Docs for extension v0.2.x — for setting enums, `package.json` contributions are the source of truth.*
