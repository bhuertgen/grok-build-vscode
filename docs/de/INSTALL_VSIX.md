# Installation aus VSIX (Schritt für Schritt)

Die Extension kommt als **`.vsix`-Datei** (noch nicht im offiziellen Marketplace).  
Einmal installieren wie ein Plugin-Paket.

---

## 1. Datei herunterladen

1. Öffne: https://github.com/bhuertgen/grok-build-vscode/releases  
2. Neuestes Release (z. B. **v0.2.1**) öffnen.  
3. Unter **Assets** auf **`grok-build-vscode-x.y.z.vsix`** klicken.  
4. Speichern z. B. unter `Downloads`.

Wichtig: die **`.vsix`**, nicht „Source code (zip)“.

---

## 2. In VS Code installieren

### Weg A — Ansicht „Erweiterungen“ (üblich)

1. **Visual Studio Code** starten (Desktop-App, nicht nur Browser).  
2. Ansicht **Erweiterungen** öffnen:
   - Icon in der **linken Aktivitätsleiste** (vier Quadrate / Puzzle), **oder**  
   - Tastatur: **`Strg+Umschalt+X`** (Windows) / **`Cmd+Shift+X`** (Mac).  
3. **Oben** im Erweiterungen-Panel, **neben** dem Suchfeld  
   „Im Marketplace nach Erweiterungen suchen“,  
   den Button **`…`** (drei Punkte) anklicken.  
4. Im Menü wählen:  
   **Von VSIX installieren…**  
   (Englisch: **Install from VSIX…**)  
5. Im Dateidialog die heruntergeladene  
   `grok-build-vscode-….vsix`  
   auswählen → **Installieren**.  
6. Warten auf „Installation abgeschlossen“.  
7. Falls gefragt: **Neu laden** / **Reload**.

### Weg B — Befehlspalette (wenn du die `…` nicht findest)

1. **`Strg+Umschalt+P`** (Mac: **`Cmd+Shift+P`**).  
2. Tippen:  
   `VSIX`  
   oder  
   `Von VSIX installieren`  
3. Befehl wählen:  
   **Erweiterungen: Von VSIX installieren…**  
   (Englisch: **Extensions: Install from VSIX…**)  
4. `.vsix`-Datei wählen → installieren → ggf. neu laden.

### Weg C — Terminal

```bash
code --install-extension C:\Users\DEINNAME\Downloads\grok-build-vscode-0.2.1.vsix
```

Pfad anpassen. Fehlt `code` in der PATH-Variable:  
Befehlspalette → **Shell-Befehl: Befehl "code" in PATH installieren**.

---

## 3. Prüfen, ob es da ist

1. Erweiterungen (`Strg+Umschalt+X`).  
2. Suchen: **`Grok Build`**.  
3. Unter **Installiert** sollte **Grok Build for VS Code** stehen.  
4. Befehlspalette → **`Grok Build: Open Chat`**.

Zusätzlich die **Grok CLI** brauchen (`grok --version`), sonst erscheint „CLI required“.

---

## 4. Häufige Stolperfallen

| Problem | Lösung |
|---------|--------|
| Kein „Von VSIX“ in der Marketplace-Suche | Steht **nicht** in den Suchtreffern, sondern im **`…`-Menü oben** oder über die Befehlspalette (Weg B). |
| Nur Web-Marketplace | Desktop-**VS Code** nutzen. |
| Nach Installation nichts zu sehen | **Fenster neu laden**: Befehlspalette → **Fenster neu laden** / *Developer: Reload Window*. |
| Update später | Neuere `.vsix` vom Release laden und **nochmal** installieren (überschreibt die alte). |

---

## 5. Wo sitzt das Menü? (Textskizze)

```
┌─ Aktivitätsleiste ─┐  ┌──────── Erweiterungen ──────────────────┐
│ Explorer           │  │  [Im Marketplace suchen …           ] … │  ← DIESE drei Punkte
│ …                  │  │  ─────────────────────────────────────  │
│ [Erweiterungen] ←  │  │  INSTALLIERT                            │
└────────────────────┘  └─────────────────────────────────────────┘
                                      │
                                      ▼
                            • Nach Updates suchen
                            • …
                            • Von VSIX installieren…   ← das hier
```

| Englisch (VS Code) | Deutsch (VS Code) |
|--------------------|-------------------|
| Extensions | Erweiterungen |
| Install from VSIX… | Von VSIX installieren… |
| Extensions: Install from VSIX… | Erweiterungen: Von VSIX installieren… |

---

## Weiter

- [Benutzerhandbuch](./USER_GUIDE.md)  
- CLI: Befehl **Grok Build: Setup CLI…**, falls der Banner erscheint  
