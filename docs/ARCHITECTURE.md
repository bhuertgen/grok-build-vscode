# Architecture — Grok Build for VS Code (Hybrid)

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

- Each UI session → **own** `spawn(cliPath, ["agent","stdio"])`.
- Closing a tab disconnects and kills that process.
- Parallel chats do not share agent memory/context unless the CLI does.

## ACP surface (client role)

**Extension → CLI:** `initialize`, `session/new|load|resume|prompt|cancel|set_mode|set_config_option|close`

**CLI → Extension:** `session/update`, `fs/read_text_file`, `fs/write_text_file`, `terminal/*`, `session/request_permission`

## Folder structure

```
src/
  extension.ts                 # activate: wire + CLI onboard
  cli/
    detect.ts                  # find / version-check grok binary
    onboard.ts                 # first-run wizard, install help
  acp/
    types.ts                   # ACP v1 types
    transport.ts               # line-delimited JSON-RPC
    client.ts                  # one process = one AcpClient
    handlers.ts                # fs / terminal / permission
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
  util/
    config.ts
    logger.ts
    fileWriter.ts              # shared apply path for diffs
webview/                       # theme-aware chat UI
media/
docs/ARCHITECTURE.md
```

## Graceful CLI handling

1. On activate → `ensureCliReady()` (detect `grok --version`).
2. If missing → modal: install instructions, copy command, set path, retry, skip.
3. Commands: **Check Grok CLI Status**, **Setup CLI…**
4. Session start failures surface clear hybrid-mode errors (not “AI failed”).

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
