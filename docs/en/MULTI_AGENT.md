# Multi-Agent Monitoring (Grok Build for VS Code)

## How multi-agent works with this extension

Grok Build’s **sub-agents** run **inside the official CLI** (`grok agent stdio`), not as separate VS Code processes.

```
VS Code Extension (UI)
        │  ACP session/update (tool_call / tool_call_update)
        ▼
Grok CLI process (one per chat session)
        ├── main agent
        ├── sub-agent A  (spawned by CLI)
        └── sub-agent B
```

The extension **observes** tool activity via ACP:

| Update | Meaning |
|--------|---------|
| `tool_call` | New tool / sub-task started |
| `tool_call_update` | Status: pending → in_progress → completed / failed |

## What you see in the UI today

**Tasks / tools** strip (above the chat):

- Live list of recent/active tool calls  
- Status dots: yellow = running, green = done, red = failed  

This is the first multi-agent **status surface**. It does not yet open a separate window per sub-agent.

## How to test multi-agent

1. Workspace **trusted** (not Restricted Mode).  
2. Mode **Execute**, permissions ideally auto-allow in execute (`grokBuild.autoAllowInExecuteMode: true`).  
3. Prompt that forces parallel work, e.g.:

   > Spawn two sub-agents: one lists TypeScript files in src/, the other summarizes package.json. Then merge the results.

4. Watch:
   - **Tasks / tools** panel for concurrent tool rows  
   - Chat system lines `⚙ …`  
   - Output channel **Grok Build** (debug) for ACP JSON  

5. CLI-side (optional): run the same task in terminal `grok` TUI and compare sub-agent UI.

## Possible next UX (roadmap)

| Option | Pros | Cons |
|--------|------|------|
| **A. Status strip** (current) | Simple, always visible | No separate logs per agent |
| **B. Side panel “Agents”** | Dedicated list + filter | Extra chrome |
| **C. Editor tabs per sub-agent** | Full transcript per agent | Needs CLI to expose sub-session streams over ACP |
| **D. Tree view** in Activity Bar | Native VS Code feel | Less chat-integrated |

**Recommended path:** keep **A**, enrich with:

1. Click row → scroll to related tool card in chat  
2. Group by `parentToolCallId` / title prefix when CLI provides it  
3. Duration timers (startedAt → finishedAt)  
4. Optional floating “Agents” webview panel for long multi-agent runs  

Full per-agent chat streams require Grok CLI / ACP to publish **sub-session** updates (not only tool titles). Until then, monitoring = tool_call timeline.

## Permissions & writes (related)

Multi-agent runs fail silently if tools stay `pending` on permission. Execute mode now **auto-allows** tools by default so sub-agents can finish. File writes via ACP are applied **immediately** (non-blocking).
