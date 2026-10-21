# Benutzerhandbuch — Grok Build for VS Code

Vollständige Bedienung, Beispiele und alle Einstellungen.  
Architektur: [ARCHITECTURE.md](./ARCHITECTURE.md) · Multi-Agent: [MULTI_AGENT.md](./MULTI_AGENT.md).

> **Nicht offiziell von xAI.** Agent-Logik, Safety und Tools liegen im **Grok Build CLI** (`grok agent stdio`). Diese Extension ist der native VS-Code-ACP-Client.

**Sprache:** Deutsch · English: [../en/USER_GUIDE.md](../en/USER_GUIDE.md)  
**UI der Extension:** Englisch (einzelne Statusmeldungen werden bei deutscher VS-Code-Sprache lokalisiert, siehe §4.10).

---

## 1. Schnellstart

### Voraussetzungen

1. **VS Code** ≥ 1.90 (oder kompatibel, z. B. Cursor)  
2. **Grok Build CLI** installiert und eingeloggt  
   - Docs: https://x.ai/cli  
   - Prüfen: `grok --version` — **1.0.62 oder neuer empfohlen** (getestet mit 1.0.62 stable, bis **1.0.66 alpha**); ältere 1.0.x laufen mit Warnbanner  
3. Optional zum Entwickeln: **Node.js** ≥ 18  

### Extension installieren

Die Extension liegt **nicht** in der Marketplace-Suche. Du installierst eine **lokale `.vsix`-Datei**.  
**Ausführliche Anleitung (empfohlen):** **[INSTALL_VSIX.md](./INSTALL_VSIX.md)**

**A) Release — einfachster Weg (Befehlspalette)**

1. [GitHub Releases](https://github.com/bhuertgen/grok-build-vscode/releases) → **`….vsix`** herunterladen (nicht das „Source code“-Zip).  
2. In VS Code: **`Strg+Umschalt+P`** / **`Cmd+Shift+P`** (Befehlspalette).  
3. Tippen: **`VSIX`**.  
4. Befehl ausführen: **Erweiterungen: Von VSIX installieren…**  
   (Englische UI: **Extensions: Install from VSIX…**).  
5. Datei wählen → Installieren → ggf. **Neu laden**.

**A′) UI-Weg mit drei Punkten:** **`Strg+Umschalt+X`** (Erweiterungen) → **oben neben dem Suchfeld** auf **`…`** → **Von VSIX installieren…**.  
Der Eintrag erscheint **nicht** in den Marketplace-Suchtreffern — nur über `…` oder die Befehlspalette.

**B) Aus diesem Repo**

```bash
npm install
npm run build
npm run package
code --install-extension grok-build-vscode-x.y.z.vsix
```

`x.y.z` = Version im Namen der `.vsix`-Datei (`npm run package` nimmt die Version aus `package.json`).

### Erster Chat

1. Ordner öffnen und **Workspace vertrauen** (Writes/Tools brauchen Trust).  
2. Activity Bar **Grok**-Icon, oder **Grok Build: Open Chat** (`Ctrl+Shift+G C` / Mac: `Cmd+Shift+G C`).  
3. Standard: Chat öffnet in der **Mitte** (Editor); der Explorer bleibt links.  
4. Status / Banner: CLI muss bereit sein — sonst **Setup CLI…**.  
5. Mode **Execute**, Nachricht senden.

---

## 2. Oberfläche

```
┌─────────────────────────────────────────────────────────────┐
│ Tabs  [Chat1] [Chat2] [+] [↺]     Model  Perm  Execute     │
├─────────────────────────────────────────────────────────────┤
│ Banner: CLI / Trust / Updates / Memory (Resume)             │
│ Status: Ready · execute · Tokens…                           │
│ Agents-Leiste (laufende Tools)                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Nachrichten (User / Grok / Tools / Thoughts)              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Context-Chips (@Dateien)                                    │
│  [+] [/]  Message Grok…                          [↑]        │
└─────────────────────────────────────────────────────────────┘
```

| Element | Funktion |
|---------|----------|
| **Tabs** | Mehrere Sessions; `+` neu; `↺` History dieses Projekts |
| **Model / Perm / Execute** | Modell, UI-Permission-Modus, Plan ↔ Execute |
| **Tool-Zeilen** | Kompakt, aufklappbar; abgeschlossene Tools oft gruppiert |
| **`+`** | Einfügen: Kontext, Bild, aktive Datei |
| **`/`** | Aktionen: Slash, History, Modell, Permissions, CLI-Update… |
| **Eingabe** | `Enter` senden, `Shift+Enter` Zeilenumbruch |

---

## 3. Composer: `+`, `/`, `@`

### 3.1 `+` — Einfügen

| Eintrag | Wirkung |
|---------|---------|
| **Context / file** | Picker: Datei, Symbol, Git, Ordner, aktiv |
| **Image** | Bilddatei(en) anhängen |
| **Active file** | Aktueller Editor / Auswahl |

### 3.2 `/` — Aktionen (filterbar)

| Bereich | Beispiele |
|---------|-----------|
| **Session** | Slash-Commands, neuer Chat, History |
| **Model & mode** | Modell wählen, Permission-Modus, Plan/Execute |
| **Context** | Kontext hinzufügen, aktive Datei |
| **System** | CLI-Setup, CLI-Status, CLI aktualisieren |

Tasten: Filterfeld, `↑`/`↓`, `Enter`, `Esc`.

### 3.3 `@` — Datei im Workspace

1. `@` (oder `@teilname`) in die Eingabe tippen.  
2. Filtern und eine Workspace-Datei wählen.  
3. Du siehst z. B. `@notes/a.md` in der Nachricht **und** einen Context-Chip.  
4. Beim Senden wird der Dateiinhalt als ACP-Resource angehängt.

**Beispiel**

```text
@README.md
Fasse die Installationsschritte in 3 Bulletpoints zusammen.
```

### 3.4 Slash in der Eingabe

Am Zeilenanfang `/` tippen für lokale/Agent-Slash-Commands (`/help`, `/plan`, `/model`, CLI-Skills…).  
Viele Commands kommen dynamisch von der **CLI**; die Extension ergänzt immer Helfer wie `help`, `plan`, `execute`, `clear`, `new`, `context`.

---

## 4. Beispiel-Workflows

### 4.1 Code erklären

```text
@src/extension.ts
Erkläre activate() und die wichtigsten Event-Handler.
```

### 4.2 Dateien erstellen / bearbeiten (Execute)

Mode: **Execute**, Workspace trusted.

```text
Erzeuge docs/hello.md mit einer kurzen Projekteinleitung.
Schreibe nichts außerhalb dieses Workspace.
```

### 4.3 Nur planen

Mode: **Plan** (Button oder `Ctrl+Shift+G P`).

```text
Schlage einen Plan für einen Screenshots-Abschnitt in der README vor.
Noch keine Dateien schreiben.
```

### 4.4 Modell wechseln

1. `/` → **Select model…** (oder der **Model**-Chip).  
2. z. B. `grok-4.5` oder `grok-composer-2.5-fast`.  
3. Systemzeile: **Active session model: …**  
4. Der Agent startet neu mit `-m <id> --no-leader`.

**Hinweis:** Bei „Welches Modell bist du?“ gilt die **Session-Modell-ID** in UI/Systemzeile, nicht die freie Selbstbeschreibung des Modells.

### 4.5 History / Resume

- Erneutes Öffnen desselben Projektordners stellt den letzten Chattext wieder her.  
- Banner:
  - **Session resumed** → CLI-Resume ok; der Agent hat das Gesprächsgedächtnis.  
  - **UI history only** → lokales Transkript; optional **Load history into context**.  
- `↺` oder `/` → History: andere Chats **dieses** Projekts.

### 4.6 Permissions

| Setting / UI | Bedeutung |
|--------------|-----------|
| **Ask** | Jedes Tool: Allow / Reject (Card im Chat) |
| **Allow** (Card-Button) | Erlaubt **nur diesen Aufruf** (`allow_once`); der nächste Aufruf fragt erneut. Fällt nur auf `allow_always` zurück, wenn der Agent keine Einmal-Option anbietet |
| **Allow always** (Card-Button) | Erlaubt diese Art von Aufruf für den Rest der Session |
| **Allow once / session / always** (Permission-Modus) | Weniger Abfragen |
| **autoAllowInExecuteMode** (Standard an) | In Execute blockieren Tools nicht an einem unsichtbaren Dialog |
| **CLI alwaysApprove** | Der Agent-Prozess genehmigt alle Tools automatisch (stark) |

Die beantwortete Card zeigt die Entscheidung (**Allowed**, **Allowed always**, **Rejected**, **Cancelled**; bei deutscher VS-Code-Sprache **Erlaubt**, **Immer erlaubt**, **Abgelehnt**, **Abgebrochen**). Write-Freigaben für eine binäre oder nicht lesbare Datei (CLI ≥ 1.0.54) zeigen statt eines Diffs das Badge **unreadable – no preview** („nicht lesbar – keine Vorschau“).

### 4.7 CLI- / Extension-Updates

- Beim Start: `grok update --check --json` → Banner **CLI update** + Statusbar.  
- Extension: GitHub Releases von `grokBuild.updateRepo` → Banner **Extension update**.  
- Commands: **Check Grok CLI Status**, **Update Grok CLI**.

---

## 4.8 Session-Config (Effort)

Bietet die CLI `configOptions` (select oder boolean) an, zeigt der Chat-Header einen Chip neben **Model** — Effort heißt **Effort**. Model bleibt ein eigener Chip.

- Select → Dropdown, Boolean → Klick schaltet an/aus.
- Die Änderung gilt für die **laufende Session** (`session/set_config_option`). Der Header aktualisiert sich aus der Agent-Antwort / `config_option_update`.
- Unbekannte Optionstypen werden ausgeblendet.
- `grokBuild.reasoningEffort` bleibt der Prozess-Default für die nächste Session (CLI `--reasoning-effort`) und wird vom Chip nicht überschrieben.
- Bietet der Agent keine Extra-Optionen an, erscheint kein Chip.

## 4.9 `@datei#start-end`

1. Zeilen im Editor markieren.
2. `Alt+K` (oder **+ → Selection range**) fügt `@rel/pfad#12-34` in den Composer ein und hängt den Bereich als Kontext an.
3. Klick auf den Chip springt zurück zum Bereich.
4. Beim Senden wird die Mention geparst; der Zeilenausschnitt geht als Resource-Block plus Mention-Text raus.
5. Leere Auswahl oder Multi-Cursor: Warnung, nichts eingefügt.
6. `Ctrl+Shift+G A` (Mac: `Cmd+Shift+G A`) öffnet den Kontext-Picker. Dateien lassen sich auch per `@` im Prompt hinzufügen.

## 4.10 Info-Zeilen im Chat

| Zeile / Badge | Wann |
|---------------|------|
| ℹ️ *Turn stopped by hook (`<hook>`): <Grund>* | Ein CLI-Hook hat den Turn mit `continue: false` beendet (CLI ≥ 1.0.60). Erscheint statt `(cancelled)` oder nichts. Die Hook-ID wird gekürzt (`project/stop:pre_tool_use[0]…` → `project/stop`). |
| **unreadable – no preview** | Eine Write-Freigabe betrifft eine binäre/nicht lesbare Datei (CLI ≥ 1.0.54); es wird kein Diff versucht. |
| Hinweis auf `grok update` | `cliPermissionMode: plan` mit einer CLI älter als 1.0.65 (die Session startet in `defaultMode`). |

Bei deutscher VS-Code-Sprache werden Hook-Stopp-Zeile, Unreadable-Badge und Permission-Entscheidungen lokalisiert („Turn durch Hook beendet“, „nicht lesbar – keine Vorschau“, „Erlaubt“ / „Immer erlaubt“ / „Abgelehnt“ / „Abgebrochen“); alle anderen UI-Texte sind Englisch.

## 5. Befehle (Befehlspalette: „Grok Build“)

| Command | Zweck |
|---------|-------|
| Open Chat | Chat öffnen |
| Open in Editor (middle) | Chat im mittleren Editor |
| Open Beside / In Sidebar | Layout-Varianten |
| New Session | Neuer Chat + neuer CLI-Prozess |
| Chat History (this project) | Gespeicherte Sessions |
| Clear Chat History | Projekt oder alles löschen |
| Toggle / Set Plan / Execute | Modus |
| Select Model / Permission Mode | Picker |
| Add Context / File / Folder / Selection | Kontext |
| Insert Selection as @file#range | `@pfad#start-end` aus der Editor-Auswahl |
| Cancel Current Turn | Laufenden Prompt abbrechen |
| Apply / Reject / Apply All Edits | Diffs, wenn angeboten |
| Show Diff | Diff anzeigen |
| Check / Setup / Update CLI | CLI-Verwaltung |
| Focus Chat Input | Eingabe fokussieren |

### Tastenkürzel

Alle Einträge aus `contributes.keybindings`. Ein Akkord hat zwei Schritte: `Ctrl+Shift+G` (Mac: `Cmd+Shift+G`) drücken, loslassen, dann Buchstabe oder Escape. `Ctrl+Shift+G I` führt **Focus Chat Input** aus: öffnet die Grok-UI (falls nötig) und fokussiert den Composer. Der Fokus geht dabei nicht zurück in den Editor. `Alt+G` ist nicht gebunden (unter Windows/Linux öffnet es das Menü Go). `Ctrl+Esc` ist ebenfalls nicht gebunden: Windows öffnet damit das Startmenü, VS Code bekommt die Taste nie.

| Aktion | Windows / Linux | Mac | Wann |
|--------|-----------------|-----|------|
| Add Context (Quick Pick) | `Ctrl+Shift+G` dann `A` | `Cmd+Shift+G` dann `A` | Immer (kein `when`) |
| `@datei#start-end` der Editor-Auswahl einfügen | `Alt+K` | `Option+K` | Texteditor fokussiert (`editorTextFocus`) |
| New Session | `Ctrl+Shift+G` dann `N` | `Cmd+Shift+G` dann `N` | Immer (kein `when`) |
| Toggle Plan Mode | `Ctrl+Shift+G` dann `P` | `Cmd+Shift+G` dann `P` | Immer (kein `when`) |
| Open Chat | `Ctrl+Shift+G` dann `C` | `Cmd+Shift+G` dann `C` | Immer (kein `when`) |
| Laufenden Turn abbrechen | `Ctrl+Shift+G` dann `Escape` | `Cmd+Shift+G` dann `Escape` | Ein Turn läuft (`grokBuild.isBusy`) |
| Laufenden Turn abbrechen (Webview) | `Escape` | `Escape` | Chat fokussiert und ein Turn läuft (schließt zuerst Menüs) |
| Chat-Eingabe fokussieren | `Ctrl+Shift+G` dann `I` | `Cmd+Shift+G` dann `I` | Immer (kein `when`) |

Tasten im Composer (`Enter` sendet, `@`, `/`, Pfeiltasten) sind keine Extension-Keybindings. Siehe §3.

---

## 6. Alle Einstellungen (`grokBuild.*`)

Einstellungen öffnen (`Strg+,`) und nach **Grok Build** suchen.

### Empfohlen (QA / Erststart)

| Setting | Wert | Warum wir es setzen / empfehlen |
|---------|------|---------------------------------|
| **Workspace Trust** | Ordner vertrauen | Ohne Trust bleiben Writes und Tools blockiert |
| `openLocation` | `editor` | Dateien + Chat nebeneinander; Explorer bleibt links (`Open Beside` ist am besten zum Coden) |
| `defaultMode` | `execute` | Agent kann nach Freigabe Tools ausführen; Plan-Toggle, wenn du nur einen Plan willst |
| `autoAllowInExecuteMode` | `true` | Execute hängt nicht an einem unsichtbaren Permission-Dialog |
| `permissionMode` | `ask` | Weiter nachfragen, wenn Plan aktiv oder Auto-Allow aus ist |

Auch in der Installationsanleitung: [INSTALL_VSIX.md §7](./INSTALL_VSIX.md#7-empfohlene-settings-nach-der-installation).

### 6.1 Start & Layout

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `cliPath` | `grok` | Pfad zur CLI. Leer oder `grok`: PATH, danach `~/.local/bin`, `~/.grok/bin`, `/usr/local/bin`. Ein expliziter Pfad wird für Erkennung **und** Agent-Start **unverändert** verwendet (kein Fallback); ein fehlender / nicht ausführbarer Pfad zeigt das Banner **Invalid grokBuild.cliPath** mit **Open Setting**. Eine Änderung erkennt die CLI sofort neu (Header-Version, Kompatibilitätsbanner, Update-Check) und blendet das Banner aus, sobald der Pfad stimmt — kein Fenster-Reload nötig. |
| `cliArgs` | `["agent","stdio"]` | Basis-Argumente für ACP |
| `openLocation` | `editor` | `editor` = Mitte (empfohlen für Dateien + Chat); `sidebar` = Activity Bar |
| `defaultMode` | `execute` | `plan` \| `execute` — Execute für Agent-Arbeit, Plan für reine Reviews |
| `logLevel` | `info` | `error` \| `warn` \| `info` \| `debug` |

### 6.2 Modell & CLI-Agent-Flags

| Setting | Default | CLI / Wirkung |
|---------|---------|---------------|
| `defaultModel` | `""` | `-m` / `--model` (leer = CLI-Default) |
| `reasoningEffort` | `""` | `--reasoning-effort` (Default für **neue** Sessions). Bietet der Agent eine Effort-/Config-Option an, überschreibt der Chip im Chat-Header den Wert **für die laufende Session** per ACP `session/set_config_option`, ohne dieses Setting zu ändern. |
| `cliPermissionMode` | `""` | `--permission-mode` (`default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`), Top-Level-Flag. **`plan`:** laut CLI-Changelog startet der Agent ab CLI **1.0.65** wirklich im Plan-Modus; neue Sessions starten dann auch in der UI in **Plan** (überschreibt `defaultMode`), Tool-Aufrufe werden also abgefragt statt automatisch erlaubt. Grok meldet den Modus nicht über ACP, daher leitet die UI ihn aus diesem Setting und der CLI-Version ab. Ältere CLIs starten im Default-Modus; der Chat zeigt einen Hinweis auf `grok update`. Wird nicht übergeben, wenn `alwaysApprove` an ist. |
| `alwaysApprove` | `false` | `--always-approve` |
| `maxTurns` | `null` | `--max-turns` |
| `noSubagents` | `false` | `--no-subagents` |
| `noPlan` | `false` | `--no-plan` |
| `memory` | `"default"` | Env `GROK_MEMORY`: `on` → `1`, `off` → `0`, `default` → CLI-Config (`[memory] enabled`). CLI ≥1.0.51 kennt nur an/aus; es wird kein CLI-Flag übergeben. |
| `noMemory` | `false` | **Veraltet** → `memory: "off"` verwenden. Wird weiter als `GROK_MEMORY=0` gemappt, wenn `memory` = `default`. |
| `experimentalMemory` | `false` | **Veraltet** → `memory: "on"` verwenden. Wird weiter als `GROK_MEMORY=1` gemappt, wenn `memory` = `default` (`noMemory` hat Vorrang). |
| `disableWebSearch` | `false` | `--disable-web-search` |
| `sandbox` | `""` | `--sandbox <PROFILE>` |
| `tools` | `""` | `--tools` Allow-List (kommagetrennt) |
| `disallowedTools` | `""` | `--disallowed-tools` |
| `rules` | `""` | `--rules` zusätzliche Systemregeln |
| `debug` | `false` | `--debug` |
| `extraCliArgs` | `[]` | Zusätzliche Argumente nach `agent` (nur Agent-Ebene; Top-Level-Flags haben eigene Settings) |

**Beispiel** `settings.json`:

```json
{
  "grokBuild.defaultModel": "grok-4.5",
  "grokBuild.reasoningEffort": "high",
  "grokBuild.debug": true,
  "grokBuild.logLevel": "debug"
}
```

### 6.3 UI-Permissions & Kontext

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `permissionMode` | `ask` | Wie die UI `session/request_permission` beantwortet. Optionen werden nach ACP-Kind gewählt, nie nach Name oder Reihenfolge: `ask` fragt nach; `allow-once` wählt automatisch die einmalige Option **allow_once** (keine sessionweite Freigabe; fragt nach, wenn der Agent keine anbietet); `allow-session` wählt für jede Anfrage in dieser VS-Code-Session **allow_once** (nur ohne einmalige Option allow_always), daher wirkt ein Wechsel zurück auf `ask` sofort; `allow-always` wählt **allow_always** und startet die CLI mit `--always-approve`. Ablehnende Optionen („Disallow“, „Don't allow“) werden nie automatisch gewählt |
| `autoAllowInExecuteMode` | `true` | Tools in Execute automatisch erlauben (empfohlen, damit Execute nicht an einem unsichtbaren Dialog hängt) |
| `showDiffBeforeApply` | `false` | Toast „Show Diff“ nach dem Write (der Write blockiert den Agent **nicht**) |
| `autoIncludeActiveFile` | `true` | Aktive Editor-Datei als Kontext anhängen |
| `autoIncludeSelection` | `true` | Aktuelle Auswahl anhängen |
| `maxContextFileBytes` | `200000` | Max. Bytes pro Kontextdatei |
| `sessionHistoryLimit` | `50` | Max. gespeicherte Sessions |
| `enableTerminal` | `true` | ACP `terminal/*` erlauben |

### 6.4 Updates

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `updateRepo` | `bhuertgen/grok-build-vscode` | GitHub `owner/repo` für Extension-Releases |
| `githubToken` | `""` | Optionaler Token (privat); besser VS-Code-GitHub-Anmeldung |
| `checkPrereleaseUpdates` | `false` | Pre-Releases einbeziehen |

---

## 7. CLI-Argumente, die die Extension baut

Effektive Form (vereinfacht):

```text
grok [Top-Level-Flags…] agent --no-leader -m <model> [Agent-Flags…] stdio
```

- **Top-Level-Flags** stehen **vor** `agent`: `--permission-mode`, `--max-turns`, `--no-subagents`, `--no-plan`, `--disable-web-search`, `--sandbox`, `--tools`, `--disallowed-tools`, `--rules`. `grok agent` lehnt sie mit `unexpected argument` ab (#37).
- **Agent-Flags** stehen **zwischen** `agent` und `stdio` (nicht nach `stdio`): `-m`, `--reasoning-effort`, `--always-approve`, `--no-leader`, `--debug` sowie `extraCliArgs`.  
- `--no-leader`: ein Prozess pro Session, damit `-m` greift.  
- Logs: Output-Kanal **Grok Build** → `Starting agent: …`.

---

## 8. History, Trust, Security

| Thema | Verhalten |
|-------|-----------|
| **History** | Lokal in VS Code `globalState`, pro Workspace-`cwd` |
| **Trust** | Restricted Mode → Banner. Schreibende Permissions (ACP-Kind `edit`, `delete`, `move`, `execute`; bei Kind `other` ein Titel mit write/edit/create/delete/move/rename) werden automatisch abgelehnt, und der Trust-Dialog öffnet sich. Lesen, Suchen und Fetch werden **nicht** abgelehnt und lösen keinen Dialog aus. Dateischreibzugriffe des Agents (`fs/write_text_file`) scheitern mit klarer Fehlermeldung, bis du dem Ordner vertraust |
| **Auth** | Nur CLI (`grok` Login); keine Keys im Repo |
| **Außerhalb des Workspace** | Dateizugriffe des Agents über die Extension (ACP `fs/read_text_file`, `fs/write_text_file`) sind auf die geöffneten Workspace-Ordner beschränkt (alle Ordner eines Multi-Root-Workspace; ohne geöffneten Ordner das Agent-`cwd`). `..` und Symlinks werden vorher aufgelöst; Windows-Pfade werden ohne Groß-/Kleinschreibung verglichen. Jeder andere Pfad öffnet ein Modal „Grok wants to read / write to a file outside the workspace.“ mit dem aufgelösten Pfad: **Allow once** (diese Anfrage; erneutes Lesen derselben Datei in der nächsten Minute fragt nicht nochmal, Schreiben bleibt einmalig), **Allow for this session** (dieser Pfad, bis der Agent neu startet; eine Schreibfreigabe deckt auch Lesen ab) oder **Cancel** = ablehnen; der Agent erhält dann einen klaren Fehler, und im Output **Grok Build** steht eine Warnung. Lesen einer nicht existierenden Datei außerhalb des Workspace scheitert ohne Dialog mit „nicht gefunden“ (die CLI liest eine neue Datei vor dem Schreiben). Das gilt auch in vertrauenswürdigen Workspaces. Befehle, die die CLI selbst ausführt (Shell-Tools), sind nicht erfasst; dort greifen CLI-Permission-Prompt und Sandbox |

---

## 9. Fehlerbehebung

| Symptom | Was tun |
|---------|---------|
| CLI fehlt | **Setup CLI…** / `cliPath` setzen |
| Banner „Invalid grokBuild.cliPath“ | **Open Setting** klicken, Pfad korrigieren oder leeren |
| Chat-Tab lädt nach **Don't Trust** neu | Erwartet: VS Code startet den Extension Host neu, wenn ein lokaler Ordner von Trusted auf Restricted Mode wechselt. Grok ersetzt seinen Editor-Tab durch einen frischen (gleiche Sessions, Restricted-Mode-Banner). Erneutes Vertrauen braucht keinen Neustart. Bleibt ein veralteter Tab übrig, schließen oder **Developer: Reload Window** ausführen |
| Keine Writes | Workspace **vertrauen** |
| Modellwechsel „hängt“ | „Switching model…“; 45 s Timeout; Output **Grok Build** prüfen |
| Agent nennt falsches Modell | UI-Systemzeile / Chip ist maßgeblich |
| `@` leer | Workspace braucht Dateien |
| Scroll-Ruckeln | Aktueller Build; [SCROLL_TEST_PROMPT.md](./SCROLL_TEST_PROMPT.md) |
| Kein Extension-Update-Banner | Es braucht ein neueres GitHub-Release als die installierte Version; private Repos brauchen GitHub-Anmeldung |

---

## 10. Entwicklung

```bash
npm install
npm run watch              # esbuild + Webview-Kopie
npm run compile            # tsc
npm run build              # Produktion → dist/
npm run package            # .vsix
npm test                   # Unit
npm run smoke              # Build + statische Checks + Unit
npm run test:integration   # Extension Host
```

- **F5** → Extension Development Host  
- Logs: **Grok Build**; `logLevel: debug` für mehr Details  

Weitere Docs:

| Datei | Inhalt |
|-------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Hybrid-Design, ACP-Rollen |
| [MULTI_AGENT.md](./MULTI_AGENT.md) | Sub-Agents, UI-Monitoring |
| [TEST_CONCEPT.md](./TEST_CONCEPT.md) | Systematische U/F/S-Tests |
| [SCROLL_TEST_PROMPT.md](./SCROLL_TEST_PROMPT.md) | Scroll-Regression |

---

## 11. Bekannte Grenzen

- MCP: Die CLI lädt ihre eigene Config; die Extension übergibt standardmäßig eine leere MCP-Liste an `session/new`.  
- Sub-Agents: nur Tool-Timeline / Statusleiste (keine Editor-Tabs pro Sub-Agent).  
- Installation: vor allem **VSIX / GitHub Releases**.  
- Spracheingabe: nicht implementiert.  

---

*Docs für Extension v0.3.x — für Setting-Enums sind die `package.json`-Contributions maßgeblich.*
