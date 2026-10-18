# Changelog

## Unreleased (0.3.1)

### Changed
- Recommended Grok CLI version (soft floor) raised to **1.0.62** (tested stable); hard floor stays 1.0.0 (#33).

### Fixed
- Turns ended by a hook (`continue: false`, CLI 1.0.60) now show an info line ("Turn stopped by hook" / "Turn durch Hook beendet") with hook name and reason instead of `(cancelled)` or nothing (#34).
- Write approvals for binary/unreadable files (CLI 1.0.54) show a clean "unreadable – no preview" hint; no diff is attempted against binary content (#35).

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

