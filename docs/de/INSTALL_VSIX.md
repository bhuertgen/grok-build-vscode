# Installation aus VSIX — ausführliche Anleitung

> **Nicht offiziell von xAI.** Community-Extension (Publisher: `bhuertgen`).  
> Agent-Logik, Safety und Tools liegen im **offiziellen** Grok Build CLI; diese Extension ist nur der VS-Code-ACP-Client.

Die Extension liegt **nicht** im offiziellen VS-Code-Marketplace.  
Du bekommst eine Datei **`.vsix`** (wie ein Installationspaket) und installierst sie **manuell** in der Desktop-App **Visual Studio Code**.

> **Wichtig:** Die Funktion heißt **nicht** in der Marketplace-Suche.  
> Du suchst also **nicht** nach „Grok“ im Erweiterungs-Store, sondern installierst eine **lokale Datei**.

---

## Überblick (drei Wege)

| Weg | Wann nutzen | Kurz |
|-----|-------------|------|
| **A — Befehlspalette** | **Empfohlen**, wenn du die Menüs nicht findest | `Strg+Umschalt+P` → `VSIX` tippen |
| **B — Drei-Punkte-Menü** | Klassischer UI-Weg | Erweiterungen → `…` → Von VSIX installieren |
| **C — Terminal** | Wenn du die Kommandozeile magst | `code --install-extension …` |

---

## 1. `.vsix`-Datei herunterladen

1. Browser öffnen:  
   **https://github.com/bhuertgen/grok-build-vscode/releases**
2. Das **oberste / neueste** Release anklicken (z. B. **v0.2.2**).
3. Nach unten zu **Assets** scrollen.
4. Die Datei **`grok-build-vscode-x.y.z.vsix`** anklicken (nicht „Source code“).
5. Speichern, z. B. in  
   `C:\Users\<DeinName>\Downloads\`

| Richtig | Falsch |
|---------|--------|
| `grok-build-vscode-0.2.2.vsix` | Source code (zip) |
| | Source code (tar.gz) |
| | den Ordner des Repos klonen (das ist keine Installation) |

---

## 2. In VS Code installieren

### Weg A — Befehlspalette (empfohlen, am leichtesten zu finden)

Das ist der **zuverlässigste** Weg. Die Funktion steckt hinter einem Befehl, den du per Name suchst — du brauchst die drei Punkte **nicht**.

1. **Visual Studio Code** als Desktop-App starten  
   (nicht nur github.com oder der Browser-Marketplace).
2. **Befehlspalette** öffnen:
   - Windows / Linux: **`Strg` + `Umschalt` + `P`**  
     (Control + Shift + P)
   - Mac: **`Cmd` + `Shift` + `P`**
3. Es erscheint oben in der Mitte ein Eingabefeld mit `>` davor.
4. Tippe (nur so viel, bis der Befehl erscheint):

   ```text
   VSIX
   ```

   oder auf Deutsch:

   ```text
   Von VSIX
   ```

   oder auf Englisch:

   ```text
   Install from VSIX
   ```

5. In der Vorschlagsliste den Eintrag wählen:

   | Sprache der VS-Code-Oberfläche | Befehl (exakt so o. ä.) |
   |--------------------------------|-------------------------|
   | **Deutsch** | **Erweiterungen: Von VSIX installieren…** |
   | **Englisch** | **Extensions: Install from VSIX…** |

6. Es öffnet sich der **Datei-Öffnen-Dialog** von Windows/macOS.
7. Zur heruntergeladenen Datei navigieren, z. B.:
   - `Downloads`
   - Datei `grok-build-vscode-0.2.2.vsix`
8. Datei auswählen → **Öffnen** / **Installieren**.
9. Unten rechts erscheint eine Meldung etwa:
   - „Die Erweiterung wird installiert…“
   - danach „Installation abgeschlossen“ / „Completed installing …“
10. Wenn VS Code **„Neu laden“ / „Reload“** anbietet → klicken.  
    Sonst manuell: Befehlspalette → `Fenster neu laden` bzw. `Reload Window`.

**Fertig.** Weiter bei [Abschnitt 3](#3-prüfen-ob-die-extension-da-ist).

---

### Weg B — Drei-Punkte-Menü in der Erweiterungsansicht

Viele suchen den Eintrag **in der Suchliste** der Erweiterungen — dort steht er **nicht**.  
Er steckt im **Menü mit den drei Punkten** oben in der Erweiterungs-Seitenleiste.

#### Schritt für Schritt

1. VS Code starten.
2. Die Ansicht **Erweiterungen** öffnen — **eine** der Varianten:
   - **Tastatur (einfach):**  
     Windows: **`Strg` + `Umschalt` + `X`**  
     Mac: **`Cmd` + `Shift` + `X`**
   - **Maus:** In der **linken** Leiste (Aktivitätsleiste) das Symbol  
     **vier Quadrate** / Puzzle-ähnlich klicken  
     (Tooltip: „Erweiterungen“ / „Extensions“).
3. Links (oder in der Sidebar) erscheint jetzt die **Erweiterungs-Ansicht**:
   - Oben ein **Suchfeld**  
     Text z. B. „Im Marketplace nach Erweiterungen suchen“  
     bzw. „Search Extensions in Marketplace“
   - **Rechts neben diesem Suchfeld** (gleiche Zeile, ganz oben):  
     ein Button mit **drei Punkten** **`…`**
4. Auf **`…`** klicken.
5. Es öffnet sich ein **Dropdown-Menü**. Darin u. a.:
   - Nach Updates suchen / Check for Extension Updates  
   - …  
   - **Von VSIX installieren…**  
     (Englisch: **Install from VSIX…**)
6. **Von VSIX installieren…** anklicken.
7. Im Dateidialog die `.vsix` wählen → installieren → ggf. neu laden.

#### Textskizze: wo die drei Punkte sitzen

```
┌─ Linke Leiste ──┐   ┌──────────── Ansicht „Erweiterungen“ ──────────────────┐
│ Explorer        │   │                                                        │
│ Suche           │   │   [  Im Marketplace suchen …                    ] [ … ]│
│ …               │   │                                                    ↑   │
│ ■ Erweiterungen │←──│                                      HIER klicken: …  │
│                 │   │   ─────────────────────────────────────────────────    │
│                 │   │   INSTALLIERT                                          │
│                 │   │   EMPFOHLEN                                            │
└─────────────────┘   └────────────────────────────────────────────────────────┘

Nach Klick auf … erscheint z. B.:

    ┌─────────────────────────────────┐
    │ Nach Updates suchen             │
    │ Empfohlene Erweiterungen anzeigen │
    │ …                               │
    │ Von VSIX installieren…     ←────│  DAS ist der Eintrag
    └─────────────────────────────────┘
```

#### Wenn du die `…` trotzdem nicht siehst

| Situation | Was tun |
|-----------|---------|
| Suchfeld ist da, aber keine `…` | Fenster breiter ziehen; Sidebar nicht zu schmal. |
| VS Code auf Deutsch/Englisch gemischt | Befehl heißt trotzdem „Von VSIX…“ bzw. „Install from VSIX…“ — **Weg A** nutzen. |
| Nur Browser geöffnet (marketplace.visualstudio.com) | Das ist **nicht** die Desktop-App. VS Code **lokal** starten. |
| Cursor / VSCodium | Gleicher Ablauf; ggf. `cursor` bzw. `codium` statt `code` im Terminal. |
| Menü wirkt leer / abgeschnitten | **Weg A (Befehlspalette)** — funktioniert unabhängig vom `…`-Button. |

---

### Weg C — Terminal / PowerShell

1. PowerShell oder Terminal öffnen.
2. Pfad zur `.vsix` anpassen und ausführen:

```powershell
code --install-extension "$env:USERPROFILE\Downloads\grok-build-vscode-0.2.2.vsix"
```

Beispiel mit festem Pfad:

```powershell
code --install-extension C:\Users\Max\Downloads\grok-build-vscode-0.2.2.vsix
```

3. Wenn die Meldung kommt, dass **`code` nicht erkannt** wird:
   1. VS Code öffnen  
   2. Befehlspalette: **`Strg+Umschalt+P`**  
   3. Tippen: `Shell-Befehl` bzw. `Install 'code' command in PATH`  
   4. Befehl ausführen:  
      **Shell-Befehl: Befehl „code“ in PATH installieren**  
      (Englisch: **Shell Command: Install 'code' command in PATH**)  
   5. Terminal neu öffnen und den Install-Befehl wiederholen.

**Cursor:**

```powershell
cursor --install-extension C:\Users\Max\Downloads\grok-build-vscode-0.2.2.vsix
```

---

## 3. Prüfen, ob die Extension da ist

1. Erweiterungen öffnen: **`Strg+Umschalt+X`**.
2. Im Suchfeld tippen: **`Grok Build`**  
   (oder den Filter **Installiert** / **Installed** wählen).
3. Es sollte erscheinen: **Grok Build for VS Code**  
   mit Status **Installiert** / **Installed**.
4. Befehlspalette (`Strg+Umschalt+P`) → tippen:

   ```text
   Grok Build: Open Chat
   ```

   und den Befehl ausführen.
5. Optional: in der **Aktivitätsleiste** das **Grok**-Icon.

### Zusätzlich: Grok CLI

Die Extension steuert das **Grok Build CLI**. Ohne CLI erscheint z. B. „CLI required“.

```powershell
grok --version
```

Fehlt die CLI: Befehl **Grok Build: Setup CLI…** in VS Code oder die offizielle CLI-Doku: https://x.ai/cli

---

## 4. Häufige Stolperfallen

| Problem | Ursache | Lösung |
|---------|---------|--------|
| „Install from VSIX“ nirgends in der Suche nach Erweiterungen | Du suchst im **Marketplace**, nicht im Menü | **Weg A**: Befehlspalette → `VSIX` |
| Nur „Durchsuchen“ / Web-Marketplace | Browser statt Desktop-VS-Code | App **Visual Studio Code** starten |
| Nach Installation nichts sichtbar | Fenster nicht neu geladen | Befehlspalette → **Fenster neu laden** / *Developer: Reload Window* |
| Extension installiert, Chat meldet CLI | CLI fehlt oder nicht im PATH | `grok --version`, dann Setup CLI |
| Update auf neuere Version | Kein Auto-Update über Marketplace | Neuere `.vsix` laden und **nochmals** installieren (überschreibt) |
| Falsche Datei installiert | Source-Code-Zip statt VSIX | Nochmal Release-Assets prüfen |

---

## 5. Beschriftungen DE ↔ EN (VS Code UI)

| Englisch | Deutsch |
|----------|---------|
| Extensions | Erweiterungen |
| Search Extensions in Marketplace | Im Marketplace nach Erweiterungen suchen |
| Install from VSIX… | Von VSIX installieren… |
| Extensions: Install from VSIX… | Erweiterungen: Von VSIX installieren… |
| Reload | Neu laden |
| Developer: Reload Window | Entwickler: Fenster neu laden / Fenster neu laden |
| Installed | Installiert |

---

## 6. Ein-Satz-Merkhilfe

> **`Strg+Umschalt+P`** → **`VSIX`** tippen → **Erweiterungen: Von VSIX installieren…** → Datei wählen.

Das genügt in fast allen Fällen — auch wenn die drei Punkte unsichtbar sind.

---

## Weiter

- [Benutzerhandbuch](./USER_GUIDE.md)  
- CLI-Hilfe in VS Code: **Grok Build: Setup CLI…**  
- Englische Version: [../en/INSTALL_VSIX.md](../en/INSTALL_VSIX.md)  
