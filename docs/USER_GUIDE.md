# Benutzerhandbuch — Grok Build for VS Code

Vollständige Bedienung, Beispiele und alle Parameter.  
Technische Architektur: [ARCHITECTURE.md](./ARCHITECTURE.md) · Multi-Agent: [MULTI_AGENT.md](./MULTI_AGENT.md).

> **Nicht offiziell von xAI.** Agent-Logik, Safety und Tools liegen im **Grok Build CLI** (`grok agent stdio`). Diese Extension ist der native VS-Code-Client (ACP).

---

## 1. Schnellstart

### Voraussetzungen

1. **VS Code** ≥ 1.90 (oder kompatibel, z. B. Cursor)  
2. **Grok Build CLI** installiert und eingeloggt  
   - Docs: https://x.ai/cli  
   - Prüfen: `grok --version`  
3. Optional zum Entwickeln: **Node.js** ≥ 18  

### Extension installieren

**A) Release (empfohlen)**  
1. [GitHub Releases](https://github.com/bhuertgen/grok-build-vscode/releases) → `.vsix` laden  
2. VS Code → Extensions → `…` → **Install from VSIX…**

**B) Aus dem Repo**

```bash
npm install
npm run build
npm run package
code --install-extension grok-build-vscode-0.2.0.vsix
```

### Erster Chat

1. Ordner in VS Code öffnen und **Workspace vertrauen** (sonst keine Writes/Tools).  
2. Activity Bar: **Grok**-Symbol, oder Befehl **Grok Build: Open Chat** (`Ctrl+Shift+G C` / Mac: `Cmd+Shift+G C`).  
3. Standard: Chat öffnet in der **Mitte** (Editor), Explorer bleibt links.  
4. Statuszeile / Banner: CLI muss „ready“ sein. Sonst **Setup CLI…**.  
5. Mode **Execute**, Frage senden.

---

## 2. Oberfläche

```
┌─────────────────────────────────────────────────────────────┐
│ Tabs  [Chat1] [Chat2] [+] [↺]     Model  Perm  Execute     │
├─────────────────────────────────────────────────────────────┤
│ Banner: CLI / Trust / Updates / Memory (Resume)             │
│ Status: Ready · execute · tokens…                           │
│ Agents-Leiste (laufende Tools)                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Nachrichten (User / Grok / Tools / Thoughts)               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Context-Chips (@dateien)                                    │
│  [+] [/]  Message Grok…                          [↑]        │
└─────────────────────────────────────────────────────────────┘
```

| Element | Funktion |
|---------|----------|
| **Tabs** | Mehrere Sessions; `+` neu; `↺` History dieses Projekts |
| **Model / Perm / Execute** | Modell, Permission-UI, Plan↔Execute |
| **Tool-Zeilen** | Kompakt, aufklappbar; fertige Tools oft als „N tools used“ |
| **`+`** | Einfügen: Kontext, Bild, aktive Datei |
| **`/`** | Aktionen: Slash, History, Modell, Permissions, CLI-Update… |
| **Eingabe** | `Enter` senden, `Shift+Enter` Zeilenumbruch |

---

## 3. Composer: `+`, `/`, `@`

### 3.1 `+` — Einfügen

| Eintrag | Wirkung |
|---------|---------|
| **Kontext / Datei** | Picker: File, Symbol, Git, Folder, Active |
| **Bild** | Bilddatei(en) als Anhang |
| **Aktive Datei** | Offener Editor / Auswahl |

### 3.2 `/` — Aktionen (filterbar)

| Bereich | Beispiele |
|---------|-----------|
| **Session** | Slash-Befehle, Neuer Chat, Chat-History |
| **Modell & Modus** | Modell wählen, Permission-Modus, Plan/Execute |
| **Kontext** | Kontext hinzufügen, Aktive Datei |
| **System** | CLI Setup, CLI-Status, CLI aktualisieren |

Navigation: Filterfeld, `↑`/`↓`, `Enter`, `Esc`.

### 3.3 `@` — Datei im Projekt

1. Im Input `@` tippen (oder `@teilname`).  
2. Workspace-Dateien filtern, auswählen.  
3. Es erscheint z. B. `@notes/a.md` **sichtbar** im Text + Context-Chip.  
4. Senden: Dateiinhalt geht als ACP-Resource mit.

**Beispiel**

```text
@README.md
Fasse die Installationsschritte in 3 Bulletpoints zusammen.
```

### 3.4 Slash im Input

Am Zeilenanfang `/` → lokale/Agent-Slash-Commands (z. B. `/help`, `/plan`, `/model`, CLI-Skills).  
Viele Commands kommen vom **CLI** (dynamisch); die Extension ergänzt u. a. `help`, `plan`, `execute`, `clear`, `new`, `context`.

---

## 4. Typische Workflows (Beispiele)

### 4.1 Code erklären lassen

```text
@src/extension.ts
Erkläre die activate()-Funktion und die wichtigsten Event-Handler.
```

### 4.2 Datei anlegen / ändern (Execute)

Mode: **Execute**, Workspace trusted.

```text
Erzeuge docs/hello.md mit einer kurzen Einleitung zum Projekt.
Keine Dateien außerhalb des Workspace.
```

### 4.3 Nur planen (Plan)

Mode: **Plan** (Button oder `Ctrl+Shift+G P`).

```text
Schlage einen Plan vor, wie wir die README um einen Screenshot-Abschnitt ergänzen.
Noch keine Dateien schreiben.
```

### 4.4 Modell wechseln

1. `/` → **Modell wählen…** (oder Chip **Model**).  
2. z. B. `grok-4.5` oder `grok-composer-2.5-fast`.  
3. Systemzeile: **Aktives Session-Modell: …**  
4. Agent wird mit `-m <id> --no-leader` neu gestartet.

**Hinweis:** Bei „Welches Modell bist du?“ gilt die **Session-ID in der UI/Systemzeile**, nicht freie Umschreibungen des Modells.

### 4.5 History / Resume

- Beim Öffnen desselben Projektordners: letzter Chat mit Text wird geladen.  
- Banner:
  - **Session fortgesetzt** → CLI-Resume ok, Agent kennt Verlauf.  
  - **Nur UI-Verlauf** → Text lokal; optional **Verlauf in Kontext laden**.  
- `↺` oder `/` → History: andere Chats **dieses** Projekts.

### 4.6 Permissions

| Setting / UI | Bedeutung |
|--------------|-----------|
| **Ask** | Jedes Tool: Allow / Reject (Karte im Chat) |
| **Allow once / session / always** | Weniger Nachfragen |
| **autoAllowInExecuteMode** (default an) | In Execute Tools nicht unnötig blockieren |
| **CLI alwaysApprove** | Agent-Prozess: alle Tools freigeben (stark) |

### 4.7 CLI- / Extension-Update

- Start: `grok update --check --json` → Banner **CLI update**, Statusleiste.  
- Extension: GitHub Releases von `grokBuild.updateRepo` → Banner **Extension update**.  
- Commands: **Check Grok CLI Status**, **Update Grok CLI**.

---

## 5. Befehle (Command Palette: „Grok Build“)

| Command | Zweck |
|---------|--------|
| Open Chat | Chat öffnen |
| Open in Editor (middle) | Chat in der Mitte |
| Open Beside / In Sidebar | Layout-Varianten |
| New Session | Neuer Chat + neuer CLI-Prozess |
| Chat History (this project) | Gespeicherte Sessions |
| Clear Chat History | Projekt oder alles löschen |
| Toggle / Set Plan / Execute | Modus |
| Select Model / Permission Mode | QuickPick oder Webview-Picker |
| Add Context / File / Folder / Selection | Kontext |
| Cancel Current Turn | Laufenden Prompt abbrechen |
| Apply / Reject / Apply All Edits | Diffs (wenn angeboten) |
| Show Diff | Diff anzeigen |
| Check / Setup / Update CLI | CLI-Verwaltung |
| Focus Chat Input | Fokus in die Eingabe |

### Tastatur

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+G C` (`Cmd+Shift+G C`) | Open Chat |
| `Ctrl+Shift+G N` | New Session |
| `Ctrl+Shift+G P` | Toggle Plan Mode |
| `Ctrl+Shift+G I` | Focus Input |
| `Ctrl+Shift+G Escape` | Cancel (wenn busy) |
| `Alt+G` | Add Context |

---

## 6. Alle Settings (`grokBuild.*`)

Settings öffnen: `Ctrl+,` → nach **Grok Build** suchen.

### 6.1 Start & Layout

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `cliPath` | `grok` | Pfad zur CLI |
| `cliArgs` | `["agent","stdio"]` | Basis-Args für ACP |
| `openLocation` | `editor` | `editor` = Mitte; `sidebar` = Activity Bar links |
| `defaultMode` | `execute` | `plan` \| `execute` |
| `logLevel` | `info` | `error` \| `warn` \| `info` \| `debug` |

### 6.2 Modell & CLI-Agent-Flags

| Setting | Default | CLI / Wirkung |
|---------|---------|----------------|
| `defaultModel` | `""` | `-m` / `--model` (leer = CLI-Default) |
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
| `tools` | `""` | `--tools` Allow-List (kommagetrennt) |
| `disallowedTools` | `""` | `--disallowed-tools` |
| `rules` | `""` | `--rules` extra Systemregeln |
| `debug` | `false` | `--debug` |
| `extraCliArgs` | `[]` | Zusätzliche Args nach `agent` |

**Beispiel:** Modell + Debug in `settings.json`:

```json
{
  "grokBuild.defaultModel": "grok-4.5",
  "grokBuild.reasoningEffort": "high",
  "grokBuild.debug": true,
  "grokBuild.logLevel": "debug"
}
```

### 6.3 UI-Permissions & Context

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `permissionMode` | `ask` | UI-Antwort auf `session/request_permission` |
| `autoAllowInExecuteMode` | `true` | Execute: Tools auto-allow |
| `showDiffBeforeApply` | `false` | Toast „Show Diff“ nach Write (Write blockiert den Agent **nicht**) |
| `autoIncludeActiveFile` | `true` | Aktive Datei als Kontext mitschicken |
| `autoIncludeSelection` | `true` | Selektion mitschicken |
| `maxContextFileBytes` | `200000` | Max. Bytes pro Kontext-Datei |
| `sessionHistoryLimit` | `50` | Max. gespeicherte Sessions |
| `enableTerminal` | `true` | ACP `terminal/*` erlauben |

### 6.4 Updates

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `updateRepo` | `bhuertgen/grok-build-vscode` | GitHub `owner/repo` für Extension-Releases |
| `githubToken` | `""` | Optional Token (privat); besser VS-Code-GitHub-Login |
| `checkPrereleaseUpdates` | `false` | Auch Pre-Releases prüfen |

---

## 7. CLI-Args, die die Extension baut

Effektive Form (vereinfacht):

```text
grok agent --no-leader -m <model> [weitere Flags…] stdio
```

- Flags stehen **zwischen** `agent` und `stdio` (nicht hinter `stdio`).  
- `--no-leader`: eigener Prozess pro Session, damit `-m` greift.  
- Logs: Output-Kanal **Grok Build** → Zeile `Starting agent: …`.

---

## 8. History, Trust, Security

| Thema | Verhalten |
|-------|-----------|
| **History** | Lokal in VS Code `globalState`, pro Workspace-`cwd` |
| **Trust** | Restricted Mode → Banner; Writes/Tools eingeschränkt |
| **Auth** | Nur CLI (`grok` Login), keine Keys im Repo |
| **Outside Workspace** | Agent soll nur Workspace nutzen; Trust + CLI-Safety |

---

## 9. Fehlerbehebung

| Symptom | Maßnahme |
|---------|----------|
| CLI missing | `Grok Build: Setup CLI…` / `cliPath` setzen |
| Keine Writes | Workspace **trust**; nicht Restricted Mode |
| Modellwechsel „hängt“ | Status „Switching model…“; Timeout 45 s; Output **Grok Build** |
| Agent nennt falsches Modell | UI-Systemzeile / Chip ist maßgeblich; Prompt enthält Session-Binding |
| `@` zeigt nichts | Workspace mit Dateien; ggf. leerer Ordner |
| Scroll wackelt | Aktuellen Build; siehe [SCROLL_TEST_PROMPT.md](./SCROLL_TEST_PROMPT.md) |
| Extension-Update fehlt | Release auf GitHub; privat → GitHub in VS Code anmelden |

---

## 10. Entwickler

```bash
npm install
npm run watch              # esbuild + Webview-Copy
npm run compile            # tsc
npm run build              # Production → dist/
npm run package            # .vsix
npm test                   # Unit
npm run smoke              # Build + Security-Marker + Unit
npm run test:integration   # Extension Host
```

- **F5** → Extension Development Host  
- Logs: **Grok Build**, `logLevel: debug` für mehr Details  

Weitere Docs:

| Datei | Inhalt |
|-------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Hybrid-Design, ACP-Rollen |
| [MULTI_AGENT.md](./MULTI_AGENT.md) | Sub-Agents, UI-Monitoring |
| [TEST_CONCEPT.md](./TEST_CONCEPT.md) | Systematische Tests U/F/S |
| [SCROLL_TEST_PROMPT.md](./SCROLL_TEST_PROMPT.md) | Scroll-Regression |

---

## 11. Bekannte Grenzen

- MCP-Server: CLI lädt eigene Config; Extension übergibt standardmäßig leere MCP-Liste an `session/new`.  
- Sub-Agent-Streams: nur Tool-Timeline / Status-Strip, keine eigenen Chat-Tabs pro Subagent.  
- Marketplace: Installation primär über **VSIX / GitHub Releases**.  
- Voice-Input: nicht implementiert.  

---

*Dokumentation zu Extension v0.2.x — bei Abweichungen gelten `package.json` contributions als Quelle der Wahrheit für Setting-Enums.*
