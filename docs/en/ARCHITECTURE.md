# Architecture — VS Code Client for Grok Build (Hybrid)

**Language:** English · Deutsch: [../de/ARCHITECTURE.md](../de/ARCHITECTURE.md)

## Decision: Hybrid (Option 1)

| Layer | Responsibility |
|-------|----------------|
| **This extension** | VS Code UX: chat webview, multi-session UI, context picking, native diffs, commands, keybindings, permissions UI |
| **Official Grok Build CLI** | Agent loop, planning, tools, MCP, sub-agents, safety, reasoning (`grok agent stdio`) |
| **Protocol** | [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) — JSON-RPC 2.0 over stdio |

We do **not** reimplement the agent. We get identical behaviour to the terminal TUI by speaking ACP to the same Rust binary.

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Sidebar UI   │  │ Editor Panel │  │ Diff / Commands   │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘ │
│         │                 │                      │          │
│         └────────────┬────┴──────────────────────┘          │
│                      ▼                                      │
│              SessionManager                                 │
│         (1 AcpClient per chat session)                      │
│              │            │            │                    │
│              ▼            ▼            ▼                    │
│         process A    process B    process C                 │
│         grok agent   grok agent   grok agent                │
│           stdio        stdio        stdio                   │
└─────────────────────────────────────────────────────────────┘
```

## Multi-process sessions

- Each UI session → **own** process: `grok [top-level flags…] agent --no-leader -m <model> [agent flags…] stdio`.
- Policy flags (`--permission-mode`, `--max-turns`, `--no-subagents`, `--no-plan`, `--disable-web-search`, `--sandbox`, `--tools`, `--disallowed-tools`, `--rules`) are top-level `grok` options and go **before** `agent` (#37).
- Closing a tab disconnects and kills that process.
- Parallel chats do not share agent memory/context unless the CLI does.

## ACP surface (client role)

**Extension → CLI:** `initialize`, `session/new|load|resume|prompt|cancel|set_mode|set_config_option|close`

**CLI → Extension:** `session/update`, `fs/read_text_file`, `fs/write_text_file`, `terminal/*`, `session/request_permission`; Grok extensions `_x.ai/session_notification` (`model_changed`) and `_x.ai/models/update` (model catalog with per-model reasoning efforts, refreshes the Model / Effort chips)

## Folder structure

```
src/
  extension.ts                 # activate: wire + CLI onboard + cliPath re-detect
  acp/
    types.ts                   # ACP v1 types
    transport.ts               # line-delimited JSON-RPC; dispose = stdin EOF + SIGTERM, exit after dispose is not a disconnect
    client.ts                  # one process = one AcpClient
    handlers.ts                # fs / terminal / permission
    elicitation.ts             # ACP elicitation (incl. multi-select)
  cli/
    detect.ts                  # find / version-check grok binary
    onboard.ts                 # first-run wizard, install help
    cliStatus.ts               # shared CLI readiness (status bar + webview)
    cliRefresh.ts              # re-detect when grokBuild.cliPath changes
    compat.ts / semver.ts      # version floors (soft 1.0.70, hard 1.0.0), banners
    updateCheck.ts             # grok update --check --json
    grokTrust.ts               # Grok folder-trust banner + "Trust folder" flow (vscode glue)
  session/
    sessionManager.ts          # multi-session + process map
    sessionStore.ts            # globalState history
  context/
    contextCollector.ts        # auto active file / selection
    contextPicker.ts           # @file @symbol @git @folder
  edits/
    editController.ts          # pending edits + native diff
  providers/
    chatViewProvider.ts        # sidebar webview
    editorChatProvider.ts      # editor group panel
  commands/
    registerCommands.ts
  util/                        # mostly pure helpers (no vscode), unit-tested
    config.ts / logger.ts
    agentArgs.ts               # CLI argv: top-level flags before `agent` (#37)
    initialMode.ts             # Plan at start for cliPermissionMode=plan (CLI >= 1.0.65)
    permissionOutcome.ts       # Allow = allow_once, decision labels
    turnOutcome.ts             # turn end classification, hook-stop info line
    unreadable.ts              # binary / unreadable write approvals
    fileRangeMention.ts        # @path#start-end
    configOptionsUi.ts         # session config chips (Effort)
    memory.ts                  # grokBuild.memory → GROK_MEMORY
    modelCatalog.ts            # ~/.grok/models_cache.json
    chatFormat.ts / cwd.ts     # chat formatting, path normalization
    messageLinks.ts            # assistant path and #123 detection (also bundled for the webview)
    assistantPath.ts           # resolve a clicked path to an existing file
    forgeRemote.ts             # git remote → issue/PR URL template
    fileWriter.ts              # shared apply path for diffs
    extensionUpdate.ts         # GitHub Releases check (manual VSIX installs only)
    distribution.ts            # build flag store|vsix; skips the release check for store builds
    workspaceTrust.ts          # Restricted Mode helpers
    grokFolderTrust.ts         # Grok trusted_folders.toml + project hooks/rules/skills/MCP detection
    restoreNotices.ts          # one restore notice of each kind per chat (#52)
  test/                        # Extension Host integration tests
webview/                       # theme-aware chat UI
tests/                         # node --test unit tests
scripts/                       # smoke check, test bundles
media/                         # icon.png (store icon), logo.svg (color, webview/tab), activitybar.svg (mono)
docs/                          # en/ + de/ (same content in both languages)
```

End-user documentation: [USER_GUIDE.md](./USER_GUIDE.md).

## Graceful CLI handling

1. On activate → `ensureCliReady()` (detect `grok --version`).
2. If missing → modal: install instructions, copy command, set path, retry, skip.
3. Version check against the floors: recommended **1.0.70** (tested with **1.0.70 stable**), older 1.0.x → warning banner.
4. Changing `grokBuild.cliPath` re-runs detection (debounced): header version, compat banner and update check follow the new binary without a window reload.
5. Commands: **Check Grok CLI Status**, **Setup CLI…**, **Update Grok CLI**
6. Session start failures surface clear hybrid-mode errors (not “AI failed”).
7. Start mode: Grok does not report ACP modes on `session/new`, so with `cliPermissionMode: plan` the UI derives **Plan** from the setting + CLI version (≥ 1.0.65); a later `current_mode_update` still wins.
8. Grok folder trust: Grok skips project hooks, rules, skills and MCP servers in folders it does not trust, without an ACP signal. `grokFolderTrust.ts` reads `$GROK_HOME/trusted_folders.toml` (nearest entry inside the same git repo wins, `GROK_FOLDER_TRUST=0` / `[folder_trust] enabled = false` turn the gate off) and scans repo root → cwd for those sources. The banner's **Trust folder** (trusted VS Code workspace only) restarts the folder's agents with top-level `--trust`; Grok persists the grant itself.
9. Shutdown: closing a chat, a model switch or a restart disposes the transport (stdin EOF + SIGTERM; SIGKILL only after 10 s). Grok exits gracefully in ~2.5 s and runs SessionEnd hooks; that late exit is expected and no longer marks the replacement process as disconnected.

## Localisation

Decision (#48): the UI is English. A handful of strings that came from earlier German-language work (permission decision labels, the "unreadable – no preview" hint, the hook-stop info line) also have a German variant for a German VS Code display language.

- Locale detection lives in **one** pure helper, `src/util/locale.ts` (`isGermanLocale`, `localize({ en, de }, vscode.env.language)`). Other modules must not add their own `de` checks.
- We do **not** migrate to `vscode.l10n` / `l10n/bundle.l10n.*.json` / `package.nls.*.json` for now: there are only a few translated strings, and the pure modules stay unit-testable without the VS Code API. If more languages or many more strings are needed, migrate in a separate PR and inject a translate function into the pure modules.

## Native VS Code strengths

- Context: active file, selection, workspace symbols, git changes
- Diff: `vscode.diff` + content provider (`grok-build-diff:`)
- Commands / keybindings / explorer & editor menus
- Sessions in sidebar tabs or editor group (`Open Session in Editor`)

## What stays out of this extension

- Model weights / inference
- Tool implementation beyond ACP client capabilities
- MCP server hosting (CLI loads user MCP config)
- Sub-agent orchestration internals
