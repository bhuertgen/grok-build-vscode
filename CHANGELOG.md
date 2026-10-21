# Changelog

## Unreleased

### Fixed
- The agent no longer fails to start when `cliPermissionMode`, `maxTurns`, `noSubagents`, `noPlan`, `disableWebSearch`, `sandbox`, `tools`, `disallowedTools` or `rules` is set. These are top-level `grok` options and are now passed **before** `agent` (`grok --permission-mode plan agent … stdio`); previously `grok agent` rejected them with `unexpected argument` (#37).

## 0.3.1 – 2026-10-18

### Security
- Plain **Allow** on edit approvals previously granted a session-wide "allow always" because of the option order in CLI 1.0.62; it now picks `allow_once`.

### Changed
- Recommended Grok CLI version (soft floor) raised to **1.0.62** (tested stable); hard floor stays 1.0.0 (#33).

### Fixed
- Turns ended by a hook (`continue: false`, CLI 1.0.60) now show an info line ("Turn stopped by hook" / "Turn durch Hook beendet") with hook name and reason instead of `(cancelled)` or nothing (#34).
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

