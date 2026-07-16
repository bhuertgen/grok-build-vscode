# Install from VSIX (step by step)

The extension is distributed as a **`.vsix` file** (not yet on the VS Code Marketplace).  
You install it **once** like a plugin package.

---

## 1. Download the file

1. Open: https://github.com/bhuertgen/grok-build-vscode/releases  
2. Open the latest release (e.g. **v0.2.1**).  
3. Under **Assets**, click **`grok-build-vscode-x.y.z.vsix`**.  
4. Save it somewhere easy to find, e.g. `Downloads`.

You need the **`.vsix` file**, not the Source code zip.

---

## 2. Install in VS Code (UI)

### Path A — Extensions view (most common)

1. Open **Visual Studio Code** (normal window, not only the browser).  
2. Open the **Extensions** view:
   - Click the **Extensions** icon in the left Activity Bar  
     (four squares / puzzle-piece style icon), **or**  
   - Press **`Ctrl+Shift+X`** (Windows/Linux) / **`Cmd+Shift+X`** (Mac).  
3. At the **top** of the Extensions panel (next to the search box “Search Extensions in Marketplace”), look for a **`…`** (three dots) button.  
4. Click **`…`**.  
5. Choose **Install from VSIX…**  
   - German VS Code UI: **Von VSIX installieren…**  
6. In the file dialog, select the downloaded  
   `grok-build-vscode-….vsix`  
   and confirm **Install**.  
7. Wait for “Completed installing …”.  
8. If VS Code asks to **reload**, click **Reload**.

### Path B — Command Palette (if you cannot find `…`)

1. Press **`Ctrl+Shift+P`** (Mac: **`Cmd+Shift+P`**).  
2. Type:  
   `Install from VSIX`  
3. Select the command:  
   **Extensions: Install from VSIX…**  
   - German UI: **Erweiterungen: Von VSIX installieren…**  
4. Pick the `.vsix` file → Install → Reload if asked.

### Path C — Terminal

```bash
code --install-extension path/to/grok-build-vscode-0.2.1.vsix
```

If `code` is not found, open VS Code → Command Palette → **Shell Command: Install 'code' command in PATH**, then retry.

---

## 3. Verify it is installed

1. Open Extensions (`Ctrl+Shift+X`).  
2. In the search box type: **`Grok Build`**  
3. You should see **Grok Build for VS Code** under **Installed**.  
4. Open the Command Palette (`Ctrl+Shift+P`) → type **`Grok Build: Open Chat`** → run it.

Also install/login the **Grok CLI** (`grok --version`), or the chat will show “CLI required”.

---

## 4. Where people usually get stuck

| Problem | Fix |
|---------|-----|
| No “Install from VSIX” in Marketplace search | That menu is **not** in the search results — use the **`…`** menu **above** the list, or Path B. |
| Only “Browse Marketplace” | You are looking at Marketplace web; use the **desktop** VS Code app. |
| Cursor / VSCodium | Same idea: Extensions view → `…` → Install from VSIX, or `cursor --install-extension …` / `codium --install-extension …`. |
| Extension missing after install | Reload window: `Ctrl+Shift+P` → **Developer: Reload Window**. |
| Updates later | Download newer `.vsix` from Releases and install again (overwrites). |

---

## 5. Screenshot of the menu location (text map)

```
┌─ Activity Bar ─┐  ┌──────── Extensions ─────────────────────┐
│ Explorer       │  │  [Search Extensions in Marketplace  ] … │  ← click these three dots
│ Search         │  │  ─────────────────────────────────────  │
│ …              │  │  INSTALLED                              │
│ [Extensions] ← │  │  …                                      │
│                │  │                                         │
└────────────────┘  └─────────────────────────────────────────┘
                              │
                              ▼
                    • Check for Extension Updates
                    • … 
                    • Install from VSIX…     ← this one
```

German UI labels:

| English | German (VS Code) |
|---------|------------------|
| Extensions | Erweiterungen |
| Install from VSIX… | Von VSIX installieren… |
| Extensions: Install from VSIX… | Erweiterungen: Von VSIX installieren… |

---

## Next steps

- [User guide](./USER_GUIDE.md)  
- CLI setup: command **Grok Build: Setup CLI…** if the banner appears  
