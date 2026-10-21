# Changelog

## Unreleased

### Security
- `grokBuild.permissionMode: allow-once` no longer grants session-wide approval: auto-answers now pick the option by ACP kind instead of list order (CLI 1.0.62 lists the session-wide `allow_always` option first) and never match by name, so a "Disallow" / "Don't allow" option can no longer be selected as an allow. `allow-session` answers each request with `allow_once`; `allow-always` picks `allow_always` (#44).
- Agent file reads and writes through the extension (`fs/read_text_file`, `fs/write_text_file`) are now limited to the workspace folders, even in a trusted workspace. `..` and symlinks are resolved, Windows paths compare case-insensitively, and multi-root workspaces count every folder. Paths outside ask with a modal (**Allow once** / **Allow for this session** / **Cancel** = deny); a denied request returns a clear error to the agent and is logged as a warning (#45).

### Compatibility
- Tested with Grok CLI **1.0.62 stable** and tested up to **1.0.66 alpha** (smoke + ACP probe green). The recommended soft floor stays **1.0.62**; hard floor 1.0.0 (#39).

### Changed
- With `grokBuild.cliPermissionMode: plan`, new sessions now start in **Plan** mode in the UI (mode button / status bar), matching the agent: from Grok CLI **1.0.65** `--permission-mode plan` really starts in plan mode. On older CLIs the UI keeps `defaultMode` and shows a `grok update` hint (#38, related #11).
- German-variant UI strings now share one locale helper (`src/util/locale.ts`) instead of three copy-pasted checks; no visible change. `vscode.l10n` migration deferred, see ARCHITECTURE (#48).

### Fixed
- An explicit `grokBuild.cliPath` that does not exist or is not executable no longer falls back silently to `~/.local/bin/grok`, `~/.grok/bin/grok` or `/usr/local/bin/grok`. Detection and agent start now share one path resolution; an invalid path shows an "Invalid grokBuild.cliPath" banner with **Open Setting** and no version in the header. Empty or `grok` keeps the previous fallback (#41).
- Changing `grokBuild.cliPath` now re-detects the CLI right away: the header version, compat banner and update check follow the new binary without **Developer: Reload Window**. New sessions already used the new path; only the displayed version was stale.
- The agent no longer fails to start when `cliPermissionMode`, `maxTurns`, `noSubagents`, `noPlan`, `disableWebSearch`, `sandbox`, `tools`, `disallowedTools` or `rules` is set. These are top-level `grok` options and are now passed **before** `agent` (`grok --permission-mode plan agent … stdio`); previously `grok agent` rejected them with `unexpected argument` (#37).
- Disposing the extension now stops pending CLI re-detections: a queued follow-up run is dropped and an in-flight detection no longer updates the status bar or webview after deactivation (#49).
- Partial file reads by the agent (`fs/read_text_file` with `line`/`limit`) now keep the file's line endings; CRLF files no longer come back LF-only, which could lead to line-ending churn or failed exact-match edits on Windows repos (#47).
- Restricted Mode no longer auto-rejects read permissions: the check now uses the ACP tool kind (`edit`, `delete`, `move`, `execute` are write-like; `read`, `search`, `fetch`, `think` are not). The title fallback only applies to kind `other`/missing and no longer matches the bare word "file", so "Read file x" / "List files" work without a trust prompt (#46).
- The **+** (new session) button and **Grok Build: New Session** now reach the CLI-path check while the CLI is not ready and show the same "Invalid grokBuild.cliPath" hint instead of doing nothing; a stale "Error: …" status line from a failed start is cleared once the CLI is ready again.
- The Grok chat editor tab no longer goes stale after a workspace trust change. VS Code restarts the extension host when a local folder goes from Trusted to Restricted Mode, and it does not re-attach a live webview panel: the old tab stayed visible but dead (**+** did nothing) until **Developer: Reload Window**. Grok now detects the restart (same `vscode.env.sessionId`) and replaces the stale tab with a fresh one in the same column. A `WebviewPanelSerializer` also restores the tab after a window reload. On Restricted → Trusted (no restart), the trust banner now also clears in the editor tab (#51).
- All open session tabs and the active tab now survive a window reload and an extension-host restart (Trusted → Restricted Mode). Previously only one session (last active / newest) was reopened; other tabs dropped back into History. The tab list is now saved eagerly per folder on create, open, switch and close, and a session is saved on create, at prompt start and at turn end. Each session has its own save timer (a shared one dropped other tabs' pending saves), saves are serialized, a background save no longer steals "last active", and agent metadata on reconnect no longer reorders the tab strip (#51).

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

