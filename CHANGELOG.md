# Changelog

## 0.4.1 – 2026-10-28

Store republish so the VS Code Marketplace and Open VSX listings pick up the live install text, plus a G-mark icon (#66). No behavior change in the agent client.

### Changed
- Icon: the four-point sparkle (it read as a Gemini-style mark) is replaced by a custom stylized **G** (not the official xAI / Grok logo). The violet rounded square and the white `>_` prompt stay. The G sits in from the top-right corner so a circular crop still contains it. Store icon, activity bar (monochrome `currentColor`), editor tab, and chat header all use it.
- Version **0.4.1**. The packaged README is the live install text already on main: Marketplace and Open VSX are the primary paths, with manual VSIX as the alternative. The 0.4.0 store packages were built before that docs fix, so their listings still showed the old "coming soon" / "Not published yet" copy.

### Compatibility
- Tested with Grok CLI **1.0.70 stable** (2026-10-23, first stable after 1.0.67). The recommended soft floor is raised from 1.0.67 to **1.0.70**, following the policy "soft floor = latest tested stable". Live ACP checks show no breakage (agent flags identical; `initialize` / `session/new` warm responses identical: models grok-4.7 / 4.7-build-fast / 4.6 / 4.5, reasoning efforts xhigh/high/medium/low, modes null). Older 1.0.x keep working with a dismissable warning banner; hard floor stays 1.0.0.

### Docs
- Troubleshooting: `GROK_DISABLE_EXPERIMENTS` (or `[experiments] enabled = false` in `~/.grok/config.toml`) disables all `[[experiments]]`. The extension does not set it; `grok agent stdio` inherits the variable (README, USER_GUIDE EN/DE §9).
- The extension is live on the VS Code Marketplace and Open VSX: README, INSTALL_VSIX and USER_GUIDE (EN/DE) make the store install the primary path (VS Code → Marketplace, Cursor / VSCodium / Windsurf → Open VSX, search `bhu.grok-build-vscode`), keep the manual VSIX install as an alternative, and drop the pre-launch store markers; README gets Marketplace (vsmarketplacebadges.dev; the shields.io Marketplace badge is retired) and Open VSX (shields.io) version badges (#60, #66).

## 0.4.0 – 2026-10-22

Store preparation for the VS Code Marketplace and Open VSX (#60, PR #61).

### Changed
- New name: **VS Code Client for Grok Build (Unofficial)**, marked as preview. The publisher is now `bhu`, so the extension id becomes **`bhu.grok-build-vscode`** (was `bhuertgen.grok-build-vscode`). VS Code treats this as a new extension: uninstall the old VSIX (≤ 0.3.3) to avoid two copies; settings (`grokBuild.*`) carry over, local chat history does not.
- New icon (violet rounded square with a `>_` prompt and a sparkle) replaces the xAI Grok logo everywhere: store icon, activity bar / view icon (monochrome `currentColor` SVG), editor tab and the chat header / empty state. The old logo files are removed from the package.
- Marketplace metadata: dark gallery banner, keywords, the "Programming Languages" category is removed.
- The GitHub release update check now runs only for manual VSIX installs. Store builds (packaged with `GROK_BUILD_DISTRIBUTION=store`) and gallery installs skip it; the editor updates them. New setting `grokBuild.checkExtensionUpdates` (default `true`) turns it off for VSIX installs too.

### Added
- Publish workflow (`.github/workflows/publish.yml`): on a published GitHub release (or manual run) it builds, lints, runs unit and smoke tests and packages the store VSIX, then publishes to Open VSX (`OVSX_PAT`) and the VS Code Marketplace (`VSCE_PAT`) after approval in the protected `publish` environment. A store is skipped when its secret is missing.
- Unit tests for the update-check gating (`tests/distribution.test.mjs`) and smoke checks for the store packaging (icon, metadata, `.vscodeignore`, workflow).

### Packaging
- `CHANGELOG.md` is now included in the VSIX; internal docs (`TEST_CONCEPT`, `SCROLL_TEST_PROMPT`, QA reports, screenshots), test files, the icon source and `.github/` are excluded.

### Docs
- Privacy / Data collection section in README and USER_GUIDE §8.1 (EN/DE): no telemetry, chats go through the local Grok CLI under the user's xAI account, GitHub Releases check only for manual VSIX installs, `grokBuild.githubToken` only sent to `api.github.com` (Open VSX Publisher Agreement §6).
- README install section rewritten: VS Code Marketplace / Open VSX (coming soon) plus manual VSIX install as the alternative; same in `docs/en` and `docs/de` (INSTALL_VSIX, USER_GUIDE). Trademark / affiliation note added to README and the EN/DE docs: not affiliated with or endorsed by xAI; Grok is a trademark of xAI.

## 0.3.3 – 2026-10-22

### Added
- Banner when Grok CLI ignores the project's hooks, rules (`AGENTS.md` …), skills or MCP servers because it does not trust the workspace folder. Over ACP Grok skips them silently. The banner lists what was found; **Trust folder** (only in a trusted VS Code workspace, with a confirmation) restarts the folder's agents with the top-level `--trust` flag, and Grok saves the grant in `~/.grok/trusted_folders.toml`. Open chats keep their conversation (project hooks and MCP apply right away, rules and skills in new chats); empty chats start fresh. **Dismiss** hides it per folder. New command **Grok Build: Trust Folder for Grok CLI** (#53, PR #59).

### Compatibility
- Tested with Grok CLI **1.0.67 stable**. The recommended soft floor is raised from 1.0.62 to **1.0.67**, following the policy "soft floor = latest tested stable": 1.0.67 brings the real plan start (1.0.65), the stricter `auto` allowlist (1.0.64) and folder trust for project hooks. Older 1.0.x keep working with a dismissable warning banner; hard floor stays 1.0.0 (#54, PR #59).
- `--trust` and `--add-dir` are known top-level-only flags and are placed before `agent` (#53, #21, PR #59).

### Fixed
- The **Effort** chip now appears after a cold CLI start. `session/new` can return a fallback model list without reasoning efforts; the extension now handles Grok's `_x.ai/models/update` catalog and refreshes the Model and Effort options from it (a still-valid effort choice is kept) (#55, PR #59).
- After a model switch or another agent restart, the old process exiting ~2.5 s later (Grok runs its SessionEnd hooks first) no longer marks the new session as disconnected with "Agent process disconnected". A process exit after an intentional shutdown is now expected; shutdown closes stdin, sends SIGTERM and only sends SIGKILL after 10 s (#58, PR #59).
- Restored chats no longer pile up "Session resumed", "Local history loaded" and plan-mode hint lines on every reload; a chat keeps at most one of each after its last message, and existing stacks are cleaned up on the next restore (#52, PR #59).

### Docs
- `cliPermissionMode: auto`: since CLI 1.0.64 a shell command runs without a prompt only if every sub-command matches the allowlist (setting description + USER_GUIDE EN/DE) (#56, PR #59).
- Git worktrees: Grok 1.0.67 applies the main checkout's saved "always allow" answers in worktrees; opt out with `[features] worktree_inherits_main_approvals = false` (USER_GUIDE EN/DE, #15 context) (#57, PR #59).
- USER_GUIDE §4.11 (folder trust), §4.8 (Effort after models update), ARCHITECTURE and TEST_CONCEPT (T-F07, T-M08) updated in EN and DE (PR #59).

## 0.3.2 – 2026-10-21

### Security
- `grokBuild.permissionMode: allow-once` no longer grants session-wide approval: auto-answers now pick the option by ACP kind instead of list order (CLI 1.0.62 lists the session-wide `allow_always` option first) and never match by name, so a "Disallow" / "Don't allow" option can no longer be selected as an allow. `allow-session` answers each request with `allow_once`; `allow-always` picks `allow_always` (#44, PR #50).
- Agent file reads and writes through the extension (`fs/read_text_file`, `fs/write_text_file`) are now limited to the workspace folders, even in a trusted workspace. `..` and symlinks are resolved, Windows paths compare case-insensitively, and multi-root workspaces count every folder. Paths outside ask with a modal (**Allow once** / **Allow for this session** / **Cancel** = deny); a denied request returns a clear error to the agent and is logged as a warning (#45, PR #50).

### Compatibility
- Tested with Grok CLI **1.0.62 stable** and tested up to **1.0.66 alpha** (smoke + ACP probe green). The recommended soft floor stays **1.0.62**; hard floor 1.0.0 (#39, PR #40).

### Changed
- With `grokBuild.cliPermissionMode: plan`, new sessions now start in **Plan** mode in the UI (mode button / status bar), matching the agent: from Grok CLI **1.0.65** `--permission-mode plan` really starts in plan mode. On older CLIs the UI keeps `defaultMode` and shows a `grok update` hint (#38, related #11, PR #40).
- German-variant UI strings now share one locale helper (`src/util/locale.ts`) instead of three copy-pasted checks; no visible change. `vscode.l10n` migration deferred, see ARCHITECTURE (#48, PR #50).

### Fixed
- An explicit `grokBuild.cliPath` that does not exist or is not executable no longer falls back silently to `~/.local/bin/grok`, `~/.grok/bin/grok` or `/usr/local/bin/grok`. Detection and agent start now share one path resolution; an invalid path shows an "Invalid grokBuild.cliPath" banner with **Open Setting** and no version in the header. Empty or `grok` keeps the previous fallback (#41, PR #42).
- Changing `grokBuild.cliPath` now re-detects the CLI right away: the header version, compat banner and update check follow the new binary without **Developer: Reload Window**. New sessions already used the new path; only the displayed version was stale (PR #40).
- The agent no longer fails to start when `cliPermissionMode`, `maxTurns`, `noSubagents`, `noPlan`, `disableWebSearch`, `sandbox`, `tools`, `disallowedTools` or `rules` is set. These are top-level `grok` options and are now passed **before** `agent` (`grok --permission-mode plan agent … stdio`); previously `grok agent` rejected them with `unexpected argument` (#37, PR #40).
- Disposing the extension now stops pending CLI re-detections: a queued follow-up run is dropped and an in-flight detection no longer updates the status bar or webview after deactivation (#49, PR #50).
- Partial file reads by the agent (`fs/read_text_file` with `line`/`limit`) now keep the file's line endings; CRLF files no longer come back LF-only, which could lead to line-ending churn or failed exact-match edits on Windows repos (#47, PR #50).
- Restricted Mode no longer auto-rejects read permissions: the check now uses the ACP tool kind (`edit`, `delete`, `move`, `execute` are write-like; `read`, `search`, `fetch`, `think` are not). The title fallback only applies to kind `other`/missing and no longer matches the bare word "file", so "Read file x" / "List files" work without a trust prompt (#46, PR #50).
- The **+** (new session) button and **Grok Build: New Session** now reach the CLI-path check while the CLI is not ready and show the same "Invalid grokBuild.cliPath" hint instead of doing nothing; a stale "Error: …" status line from a failed start is cleared once the CLI is ready again (PR #42).
- The Grok chat editor tab no longer goes stale after a workspace trust change. VS Code restarts the extension host when a local folder goes from Trusted to Restricted Mode, and it does not re-attach a live webview panel: the old tab stayed visible but dead (**+** did nothing) until **Developer: Reload Window**. Grok now detects the restart (same `vscode.env.sessionId`) and replaces the stale tab with a fresh one in the same column. A `WebviewPanelSerializer` also restores the tab after a window reload. On Restricted → Trusted (no restart), the trust banner now also clears in the editor tab (#51, PR #50).
- All open session tabs and the active tab now survive a window reload and an extension-host restart (Trusted → Restricted Mode). Previously only one session (last active / newest) was reopened; other tabs dropped back into History. The tab list is now saved eagerly per folder on create, open, switch and close, and a session is saved on create, at prompt start and at turn end. Each session has its own save timer (a shared one dropped other tabs' pending saves), saves are serialized, a background save no longer steals "last active", and agent metadata on reconnect no longer reorders the tab strip (#51, PR #50).

### Docs
- Everything on GitHub and in code (PRs, commits, comments, UI and setting texts, CHANGELOG) is now English; the user docs stay bilingual, with `docs/en` and `docs/de` kept in parity (PR #43).
- USER_GUIDE, TEST_CONCEPT and ARCHITECTURE (EN + DE) updated for permission modes, the workspace boundary, Restricted Mode reads, localisation and workspace trust switches (PR #50).

## 0.3.1 – 2026-10-18

### Security
- Plain **Allow** on edit approvals previously granted a session-wide "allow always" because of the option order in CLI 1.0.62; it now picks `allow_once`.

### Changed
- Recommended Grok CLI version (soft floor) raised to **1.0.62** (tested stable); hard floor stays 1.0.0 (#33).

### Fixed
- Turns ended by a hook (`continue: false`, CLI 1.0.60) now show an info line ("Turn stopped by hook"; German VS Code locale: "Turn durch Hook beendet") with hook name and reason instead of `(cancelled)` or nothing (#34).
- Write approvals for binary/unreadable files (CLI 1.0.54) show a clean "unreadable – no preview" hint; no diff is attempted against binary content (#35).
- The inline permission card now resolves when the native modal answers the request, and leftover cards are cleared at turn end.

## 0.3.0 - 2026-10-13

### Added
- **ACP elicitation** support, including multi-select prompts (#2).
- **Config chips** for Effort and model at session start; `@file#range` mentions with **Alt+K** (#27, fixes #8, #9).
- **`grokBuild.memory`** setting, passed to the CLI via `GROK_MEMORY` (#32, fixes #28).
- Session tabs row, Escape-to-cancel and chord-leak guard in the webview (#5).

### Changed
- Minimum supported Grok CLI version raised to **1.0.52**, with compatibility banners (#1).
- New keybindings using **Ctrl+Shift+G** chords; **Alt+G** and **Ctrl+Esc** removed (#27).

### Fixed
- Scroll-stick and streaming fixes: scrolling up while streaming works, and line breaks are preserved (#4, closes #3).

### Known issues
- The Windows check for the Ctrl+Shift+G chords is still open (see the comment on #27).

