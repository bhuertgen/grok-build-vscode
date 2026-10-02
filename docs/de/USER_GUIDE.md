# Benutzerhandbuch — Grok Build for VS Code

Vollständige Bedienung, Beispiele und alle Parameter.  
Architektur: [ARCHITECTURE.md](./ARCHITECTURE.md) · Multi-Agent: [MULTI_AGENT.md](./MULTI_AGENT.md).

> **Nicht offiziell von xAI.** Agent-Logik, Safety und Tools liegen im **Grok Build CLI** (`grok agent stdio`). Diese Extension ist der native VS-Code-ACP-Client.

**Sprache:** Deutsch · English: [../en/USER_GUIDE.md](../en/USER_GUIDE.md)  
**UI der Extension:** Englisch (einheitlich mit dem Public-Repo).

---

## 1. Schnellstart

### Voraussetzungen

1. **VS Code** ≥ 1.90 (oder kompatibel, z. B. Cursor)  
2. **Grok Build CLI** installiert und eingeloggt  
   - Docs: https://x.ai/cli  
   - Prüfen: `grok --version`  
3. Optional zum Entwickeln: **Node.js** ≥ 18  

### Extension installieren

Die Extension liegt **nicht** in der Marketplace-Suche. Du installierst eine **lokale `.vsix`-Datei**.  
**Ausführliche Anleitung (empfohlen, mit jedem Klick):** **[INSTALL_VSIX.md](./INSTALL_VSIX.md)**

**A) Release — schnellster Weg (Befehlspalette)**

1. [GitHub Releases](https://github.com/bhuertgen/grok-build-vscode/releases) → **`….vsix`** laden (nicht „Source code“).  
2. In VS Code: **`Strg+Umschalt+P`** (Befehlspalette).  
3. Tippen: **`VSIX`**.  
4. Befehl wählen: **Erweiterungen: Von VSIX installieren…**  
   (Englisch: *Extensions: Install from VSIX…*).  
5. Heruntergeladene `.vsix` auswählen → Installieren → ggf. **Neu laden**.

**A′) UI-Weg mit drei Punkten:** **`Strg+Umschalt+X`** (Erweiterungen) → **oben neben dem Suchfeld** auf **`…`** → **Von VSIX installieren…**.  
Steht **nicht** in den Marketplace-Suchtreffern — nur im `…`-Menü oder über die Befehlspalette.

**B) Aus dem Repo**

```bash
npm install
npm run build
npm run package
code --install-extension grok-build-vscode-0.2.2.vsix
```

### Erster Chat

1. Ordner öffnen und **Workspace vertrauen** (sonst keine Writes/Tools).  
2. Activity Bar **Grok**, oder **Grok Build: Open Chat** (`Ctrl+Shift+G C` / Mac: `Cmd+Shift+G C`).  
3. Standard: Chat in der **Mitte**, Explorer links.  
4. CLI muss „ready“ sein — sonst **Setup CLI…**.  
5. Mode **Execute**, Nachricht senden.

---

## 2. Oberfläche

| Element | Funktion |
|---------|----------|
| **Tabs** | Mehrere Sessions; `+` neu; `↺` History dieses Projekts |
| **Model / Perm / Execute** | Modell, Permission-UI, Plan↔Execute |
| **Tool-Zeilen** | Kompakt, aufklappbar |
| **`+`** | Einfügen: Kontext, Bild, aktive Datei |
| **`/`** | Aktionen: Slash, History, Modell, Permissions, CLI-Update… |
| **Eingabe** | `Enter` senden, `Shift+Enter` Zeilenumbruch |

---

## 3. Composer: `+`, `/`, `@`

### 3.1 `+` — Insert (Einfügen)

| Eintrag | Wirkung |
|---------|---------|
| **Context / file** | File, Symbol, Git, Folder, Active |
| **Image** | Bildanhang |
| **Active file** | Offener Editor / Auswahl |

### 3.2 `/` — Actions

| Bereich | Beispiele |
|---------|-----------|
| **Session** | Slash commands, New chat, History |
| **Model & mode** | Modell, Permissions, Plan/Execute |
| **Context** | Kontext hinzufügen |
| **System** | CLI Setup, Status, Update |

### 3.3 `@` — Datei im Projekt

```text
@README.md
Fasse die Installation in 3 Bulletpoints zusammen.
```

### 3.4 Slash im Input

Am Zeilenanfang `/` → Commands (`/help`, `/plan`, …). Viele kommen dynamisch vom CLI.

---

## 4. Typische Workflows

### Code erklären

```text
@src/extension.ts
Erkläre activate() und die wichtigsten Event-Handler.
```

### Datei schreiben (Execute)

```text
Erzeuge docs/hello.md mit einer kurzen Einleitung.
Keine Dateien außerhalb des Workspace.
```

### Nur planen (Plan)

```text
Schlage einen Plan für einen Screenshots-Abschnitt in der README vor.
Noch keine Dateien schreiben.
```

### Modell wechseln

1. `/` → **Select model…**  
2. z. B. `grok-4.5` oder `grok-composer-2.5-fast`  
3. Systemzeile **Active session model** ist maßgeblich  

### History / Resume

- Gleicher Projektordner → letzter Chat wird geladen  
- **Session resumed** = CLI-Resume ok  
- **UI history only** = lokal; optional History in Kontext laden  

---

## 4.1 Session-Config (Effort)

Bietet der Agent `configOptions` (select/boolean), erscheint im Chat-Header neben **Model** ein Chip. Effort heißt **Effort**. Model bleibt eigener Chip.

- Select → Dropdown, Boolean → Klick toggelt.
- Änderung gilt für die **laufende Session** (`session/set_config_option`), Bestätigung über Antwort / `config_option_update`.
- Unbekannte Typen werden ausgeblendet.
- `grokBuild.reasoningEffort` bleibt Default für neue Sessions (CLI `--reasoning-effort`) und wird vom Chip nicht überschrieben.
- Keine Extra-Optionen vom Agent → kein Chip.

## 4.2 `@file#start-end`

1. Zeilen im Editor markieren.
2. `Alt+K` (oder **+ → Selection range**) fügt `@rel/pfad#12-34` in den Composer ein und hängt den Bereich als Kontext an.
3. Chip-Klick springt zur Stelle.
4. Beim Senden wird die Mention geparst; der Zeilenausschnitt geht als Resource-Block plus Mention-Text an `session/prompt`.
5. Leere Selection oder Multi-Cursor: Warnung, nichts eingefügt.
6. `Ctrl+Shift+G A` (Mac: `Cmd+Shift+G A`) öffnet den Kontext-Picker. Dateien gehen auch per `@` im Prompt.

## 5. Befehle & Tastatur

Alle Einträge aus `contributes.keybindings`. Akkord: zuerst `Ctrl+Shift+G` (Mac: `Cmd+Shift+G`), loslassen, dann Buchstabe oder Escape. `Ctrl+Esc` / `Cmd+Esc` und `Ctrl+Shift+G I` führen beide **Focus Chat Input** aus: Grok-UI öffnen (falls nötig) und den Composer fokussieren. Der Fokus geht dabei nicht zurück in den Editor. `Alt+G` ist nicht gebunden (unter Windows/Linux öffnet es das Menü Go).

| Aktion | Windows / Linux | Mac | Wann |
|--------|-----------------|-----|------|
| Add Context (Quick Pick) | `Ctrl+Shift+G` dann `A` | `Cmd+Shift+G` dann `A` | Immer (kein `when`) |
| `@datei#start-end` der Editor-Auswahl einfügen | `Alt+K` | `Option+K` | Texteditor fokussiert (`editorTextFocus`) |
| New Session | `Ctrl+Shift+G` dann `N` | `Cmd+Shift+G` dann `N` | Immer (kein `when`) |
| Toggle Plan Mode | `Ctrl+Shift+G` dann `P` | `Cmd+Shift+G` dann `P` | Immer (kein `when`) |
| Open Chat | `Ctrl+Shift+G` dann `C` | `Cmd+Shift+G` dann `C` | Immer (kein `when`) |
| Laufenden Turn abbrechen | `Ctrl+Shift+G` dann `Escape` | `Cmd+Shift+G` dann `Escape` | Ein Turn läuft (`grokBuild.isBusy`) |
| Chat-Eingabe fokussieren | `Ctrl+Shift+G` dann `I` | `Cmd+Shift+G` dann `I` | Immer (kein `when`) |
| Chat-Eingabe fokussieren | `Ctrl+Esc` | `Cmd+Esc` | Immer (kein `when`) |

Tasten im Composer (`Enter` sendet, `@`, `/`, Pfeile) sind keine Extension-Keybindings. Siehe §3 der englischen Anleitung.

Command Palette: nach **Grok Build** suchen (alle Commands dort).

---

## 6. Settings (`grokBuild.*`)

Vollständige Tabelle und JSON-Beispiele: **englische** Version  
→ [../en/USER_GUIDE.md#6-all-settings-grokbuild](../en/USER_GUIDE.md#6-all-settings-grokbuild)

Kurzüberblick:

| Setting | Default | Rolle |
|---------|---------|--------|
| `cliPath` | `grok` | CLI-Pfad |
| `openLocation` | `editor` | Chat Mitte / Sidebar |
| `defaultMode` | `execute` | plan \| execute |
| `defaultModel` | `""` | CLI `-m` |
| `permissionMode` | `ask` | UI-Permissions |
| `autoAllowInExecuteMode` | `true` | Tools in Execute freigeben |
| `alwaysApprove` | `false` | CLI `--always-approve` |
| `updateRepo` | `bhuertgen/grok-build-vscode` | Extension-Updates |
| `logLevel` | `info` | Output **Grok Build** |

CLI-Flags (`reasoningEffort`, `noSubagents`, `sandbox`, `tools`, …) siehe EN-Guide §6.2.

Effektives Spawn:

```text
grok agent --no-leader -m <model> [flags…] stdio
```

---

## 7. Fehlerbehebung

| Symptom | Maßnahme |
|---------|----------|
| CLI missing | Setup CLI / `cliPath` |
| Keine Writes | Workspace trust |
| Modellwechsel hängt | Timeout 45 s; Output-Kanal |
| Falsches Modell in der Antwort | UI-Systemzeile / Chip glauben |
| `@` leer | Dateien im Workspace anlegen |

---

## 8. Entwickler

```bash
npm test
npm run smoke
npm run test:integration
npm run package
```

Weitere Docs (DE-Übersicht / EN-Detail):

| DE | EN |
|----|-----|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | [../en/ARCHITECTURE.md](../en/ARCHITECTURE.md) |
| [MULTI_AGENT.md](./MULTI_AGENT.md) | [../en/MULTI_AGENT.md](../en/MULTI_AGENT.md) |
| [TEST_CONCEPT.md](./TEST_CONCEPT.md) | [../en/TEST_CONCEPT.md](../en/TEST_CONCEPT.md) |
| [SCROLL_TEST_PROMPT.md](./SCROLL_TEST_PROMPT.md) | [../en/SCROLL_TEST_PROMPT.md](../en/SCROLL_TEST_PROMPT.md) |

---

*Bei Abweichungen der Setting-Enums gilt `package.json`.*
