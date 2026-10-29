# Architektur — VS Code Client for Grok Build (Hybrid)

**Sprache:** Deutsch · English: [../en/ARCHITECTURE.md](../en/ARCHITECTURE.md)

## Entscheidung: Hybrid (Option 1)

| Schicht | Verantwortung |
|---------|---------------|
| **Diese Extension** | VS-Code-UX: Chat-Webview, Multi-Session-UI, Kontextauswahl, native Diffs, Commands, Keybindings, Permissions-UI |
| **Offizielles Grok Build CLI** | Agent-Loop, Planung, Tools, MCP, Sub-Agents, Safety, Reasoning (`grok agent stdio`) |
| **Protokoll** | [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) — JSON-RPC 2.0 über stdio |

Wir bauen den Agenten **nicht** nach. Wir erhalten dasselbe Verhalten wie die Terminal-TUI, weil wir ACP mit derselben Rust-Binary sprechen.

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Sidebar-UI   │  │ Editor-Panel │  │ Diff / Commands   │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘ │
│         │                 │                      │          │
│         └────────────┬────┴──────────────────────┘          │
│                      ▼                                      │
│              SessionManager                                 │
│         (1 AcpClient pro Chat-Session)                      │
│              │            │            │                    │
│              ▼            ▼            ▼                    │
│         Prozess A    Prozess B    Prozess C                 │
│         grok agent   grok agent   grok agent                │
│           stdio        stdio        stdio                   │
└─────────────────────────────────────────────────────────────┘
```

## Multi-Prozess-Sessions

- Jede UI-Session → **eigener** Prozess: `grok [Top-Level-Flags…] agent --no-leader -m <model> [Agent-Flags…] stdio`.
- Policy-Flags (`--permission-mode`, `--max-turns`, `--no-subagents`, `--no-plan`, `--disable-web-search`, `--sandbox`, `--tools`, `--disallowed-tools`, `--rules`) sind Top-Level-Optionen von `grok` und stehen **vor** `agent` (#37).
- Tab schließen trennt die Verbindung und beendet diesen Prozess.
- Parallele Chats teilen kein Agent-Gedächtnis / keinen Kontext, außer die CLI tut es.

## ACP-Oberfläche (Client-Rolle)

**Extension → CLI:** `initialize`, `session/new|load|resume|prompt|cancel|set_mode|set_config_option|close`

**CLI → Extension:** `session/update`, `fs/read_text_file`, `fs/write_text_file`, `terminal/*`, `session/request_permission`; Grok-Erweiterungen `_x.ai/session_notification` (`model_changed`) und `_x.ai/models/update` (Modellkatalog mit Reasoning-Efforts pro Modell, aktualisiert die Chips Model / Effort)

## Ordnerstruktur

```
src/
  extension.ts                 # activate: Verdrahtung + CLI-Onboarding + cliPath-Neuerkennung
  acp/
    types.ts                   # ACP v1 types
    transport.ts               # zeilenbasiertes JSON-RPC; dispose = stdin-EOF + SIGTERM, Exit nach dispose ist kein Disconnect
    client.ts                  # ein Prozess = ein AcpClient
    handlers.ts                # fs / terminal / permission
    elicitation.ts             # ACP-Elicitation (inkl. Mehrfachauswahl)
  cli/
    detect.ts                  # grok-Binary finden / Version prüfen
    onboard.ts                 # Erststart-Wizard, Installationshilfe
    cliStatus.ts               # gemeinsamer CLI-Status (Statusbar + Webview)
    cliRefresh.ts              # Neuerkennung bei Änderung von grokBuild.cliPath
    compat.ts / semver.ts      # Versionsgrenzen (soft 1.0.70, hard 1.0.0), Banner
    updateCheck.ts             # grok update --check --json
    grokTrust.ts               # Banner für Grok-Ordnervertrauen + Ablauf "Trust folder" (vscode-Anbindung)
  session/
    sessionManager.ts          # Multi-Session + Prozess-Map
    sessionStore.ts            # History in globalState
  context/
    contextCollector.ts        # automatisch aktive Datei / Auswahl
    contextPicker.ts           # @file @symbol @git @folder
  edits/
    editController.ts          # ausstehende Edits + nativer Diff
  providers/
    chatViewProvider.ts        # Sidebar-Webview
    editorChatProvider.ts      # Panel in der Editor-Gruppe
  commands/
    registerCommands.ts
  util/                        # überwiegend pure Helfer (ohne vscode), unit-getestet
    config.ts / logger.ts
    agentArgs.ts               # CLI-argv: Top-Level-Flags vor `agent` (#37)
    initialMode.ts             # Plan beim Start für cliPermissionMode=plan (CLI >= 1.0.65)
    permissionOutcome.ts       # Allow = allow_once, Entscheidungs-Labels
    turnOutcome.ts             # Turn-Ende einordnen, Hook-Stopp-Info-Zeile
    unreadable.ts              # Write-Freigaben für binäre / nicht lesbare Dateien
    fileRangeMention.ts        # @path#start-end
    configOptionsUi.ts         # Session-Config-Chips (Effort)
    memory.ts                  # grokBuild.memory → GROK_MEMORY
    modelCatalog.ts            # ~/.grok/models_cache.json
    chatFormat.ts / cwd.ts     # Chat-Formatierung, Pfad-Normalisierung
    messageLinks.ts            # Erkennung von Pfaden und #123 im Assistant-Text (auch als Webview-Bundle)
    assistantPath.ts           # angeklickten Pfad auf eine vorhandene Datei auflösen
    forgeRemote.ts             # Git-Remote → URL-Vorlage für Issue/PR
    fileWriter.ts              # gemeinsamer Schreibpfad für Diffs
    extensionUpdate.ts         # Prüfung der GitHub Releases (nur manuelle VSIX-Installation)
    distribution.ts            # Build-Flag store|vsix; überspringt die Release-Prüfung bei Store-Builds
    workspaceTrust.ts          # Helfer für den Restricted Mode
    grokFolderTrust.ts         # Grok trusted_folders.toml + Erkennung von Projekt-Hooks/-Regeln/-Skills/-MCP
    restoreNotices.ts          # pro Chat eine Restore-Meldung je Art (#52)
  test/                        # Integrationstests im Extension Host
webview/                       # Theme-fähige Chat-UI
tests/                         # Unit-Tests mit node --test
scripts/                       # Smoke-Check, Test-Bundles
media/                         # icon.png (Store-Icon), logo.svg (farbig, Webview/Tab), activitybar.svg (mono)
docs/                          # en/ + de/ (gleicher Inhalt in beiden Sprachen)
```

Endnutzer-Dokumentation: [USER_GUIDE.md](./USER_GUIDE.md).

## Robuster CLI-Umgang

1. Beim Aktivieren → `ensureCliReady()` (erkennt `grok --version`).
2. Fehlt sie → Modal: Installationsanleitung, Befehl kopieren, Pfad setzen, erneut versuchen, überspringen.
3. Versionsprüfung gegen die Grenzen: empfohlen **1.0.70** (getestet mit **1.0.70 stable**), ältere 1.0.x → Warnbanner.
4. Eine Änderung von `grokBuild.cliPath` startet die Erkennung neu (debounced): Header-Version, Kompatibilitätsbanner und Update-Check folgen der neuen Binary ohne Fenster-Reload.
5. Commands: **Check Grok CLI Status**, **Setup CLI…**, **Update Grok CLI**
6. Fehler beim Session-Start zeigen klare Hybrid-Modus-Meldungen (nicht „AI failed“).
7. Startmodus: Grok meldet bei `session/new` keine ACP-Modi; mit `cliPermissionMode: plan` leitet die UI **Plan** aus Setting + CLI-Version (≥ 1.0.65) ab; ein späteres `current_mode_update` hat weiterhin Vorrang.
8. Grok-Ordnervertrauen: Grok überspringt Projekt-Hooks, -Regeln, -Skills und MCP-Server in Ordnern, denen es nicht vertraut, ohne ACP-Signal. `grokFolderTrust.ts` liest `$GROK_HOME/trusted_folders.toml` (der nächste Eintrag im selben Git-Repo gewinnt, `GROK_FOLDER_TRUST=0` / `[folder_trust] enabled = false` schalten die Sperre ab) und sucht von der Repo-Wurzel bis zum cwd nach diesen Quellen. **Trust folder** im Banner (nur im vertrauenswürdigen VS-Code-Workspace) startet die Agents des Ordners mit dem Top-Level-Flag `--trust` neu; Grok speichert die Freigabe selbst.
9. Beenden: Chat schließen, Modellwechsel oder Neustart beenden den Transport (stdin-EOF + SIGTERM; SIGKILL erst nach 10 s). Grok beendet sich in ~2,5 s sauber und führt SessionEnd-Hooks aus; dieser späte Exit ist erwartet und markiert den Ersatzprozess nicht mehr als getrennt.

## Lokalisierung

Entscheidung (#48): Die UI ist englisch. Einige wenige Texte aus früheren deutschsprachigen Arbeiten (Labels der Permission-Entscheidung, der Hinweis „nicht lesbar – keine Vorschau“, die Info-Zeile bei Hook-Stopp) haben zusätzlich eine deutsche Variante für eine deutsche VS-Code-Anzeigesprache.

- Die Locale-Erkennung liegt in **einem** reinen Helper, `src/util/locale.ts` (`isGermanLocale`, `localize({ en, de }, vscode.env.language)`). Andere Module dürfen keine eigenen `de`-Prüfungen einbauen.
- Eine Migration auf `vscode.l10n` / `l10n/bundle.l10n.*.json` / `package.nls.*.json` machen wir vorerst **nicht**: Es gibt nur wenige übersetzte Texte, und die reinen Module bleiben ohne VS-Code-API unit-testbar. Werden weitere Sprachen oder deutlich mehr Texte nötig, erfolgt die Migration in einem eigenen PR; die reinen Module bekommen dann eine Übersetzungsfunktion injiziert.

## Stärken von VS Code, die wir nutzen

- Kontext: aktive Datei, Auswahl, Workspace-Symbole, Git-Änderungen
- Diff: `vscode.diff` + Content-Provider (`grok-build-diff:`)
- Commands / Keybindings / Explorer- & Editor-Menüs
- Sessions in Sidebar-Tabs oder Editor-Gruppe (`Open Session in Editor`)

## Was nicht in dieser Extension liegt

- Modellgewichte / Inferenz
- Tool-Implementierung jenseits der ACP-Client-Fähigkeiten
- MCP-Server-Hosting (die CLI lädt die MCP-Config des Users)
- Interna der Sub-Agent-Orchestrierung
