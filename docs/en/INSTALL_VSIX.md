# Install from VSIX — detailed guide

This extension is **not** on the official VS Code Marketplace.  
You get a **`.vsix` file** (an install package) and install it **manually** in the **Visual Studio Code desktop app**.

> **Important:** “Install from VSIX” does **not** appear in Marketplace search results.  
> You are **not** searching the store for “Grok” — you install a **local file**.

---

## Overview (three paths)

| Path | When to use | Short |
|------|-------------|--------|
| **A — Command Palette** | **Recommended** if you cannot find the menus | `Ctrl+Shift+P` → type `VSIX` |
| **B — Three-dot menu** | Classic UI path | Extensions → `…` → Install from VSIX |
| **C — Terminal** | If you prefer the CLI | `code --install-extension …` |

---

## 1. Download the `.vsix` file

1. Open in a browser:  
   **https://github.com/bhuertgen/grok-build-vscode/releases**
2. Open the **latest** release (e.g. **v0.2.1**).
3. Scroll to **Assets**.
4. Click **`grok-build-vscode-x.y.z.vsix`** (not “Source code”).
5. Save it somewhere easy, e.g.  
   `C:\Users\<YourName>\Downloads\`

| Correct | Wrong |
|---------|--------|
| `grok-build-vscode-0.2.1.vsix` | Source code (zip) |
| | Source code (tar.gz) |
| | Cloning the repo only (that is not an install) |

---

## 2. Install in VS Code

### Path A — Command Palette (recommended, easiest to find)

This is the **most reliable** path. You search for the command by name — you do **not** need the three-dot button.

1. Start **Visual Studio Code** (desktop app — not only github.com or the web Marketplace).
2. Open the **Command Palette**:
   - Windows / Linux: **`Ctrl` + `Shift` + `P`**
   - Mac: **`Cmd` + `Shift` + `P`**
3. A text field appears at the top center (often with `>` in front).
4. Type until the command appears:

   ```text
   Install from VSIX
   ```

   or simply:

   ```text
   VSIX
   ```

5. Select this command from the list:

   | VS Code UI language | Command |
   |---------------------|---------|
   | **English** | **Extensions: Install from VSIX…** |
   | **German** | **Erweiterungen: Von VSIX installieren…** |

6. The OS **file open** dialog appears.
7. Navigate to the downloaded file, e.g. `Downloads` → `grok-build-vscode-0.2.1.vsix`.
8. Select the file → **Open** / **Install**.
9. Wait for a toast such as “Completed installing …”.
10. If VS Code offers **Reload**, click it.  
    Otherwise: Command Palette → `Developer: Reload Window`.

**Done.** Continue at [section 3](#3-verify-it-is-installed).

---

### Path B — Three-dot menu in the Extensions view

Many people look for the entry **inside the extension search list** — it is **not** there.  
It lives in the **`…` (three dots) menu** at the **top** of the Extensions sidebar.

#### Step by step

1. Start VS Code.
2. Open the **Extensions** view — pick **one**:
   - **Keyboard:**  
     Windows/Linux: **`Ctrl` + `Shift` + `X`**  
     Mac: **`Cmd` + `Shift` + `X`**
   - **Mouse:** On the **left Activity Bar**, click the **Extensions** icon  
     (four squares / puzzle-style; tooltip “Extensions”).
3. The Extensions sidebar opens:
   - At the top: a **search box**  
     (“Search Extensions in Marketplace”)
   - **On the same row, to the right of the search box:**  
     a **`…`** (three dots) button
4. Click **`…`**.
5. In the dropdown menu, choose:
   - **Install from VSIX…**  
   - German UI: **Von VSIX installieren…**
6. Pick the `.vsix` file → Install → Reload if asked.

#### Text map: where the three dots are

```
┌─ Activity Bar ──┐   ┌──────────── Extensions view ─────────────────────────┐
│ Explorer        │   │                                                      │
│ Search          │   │   [  Search Extensions in Marketplace …      ] [ … ] │
│ …               │   │                                                  ↑   │
│ ■ Extensions    │←──│                                    click here: …     │
│                 │   │   ─────────────────────────────────────────────────  │
│                 │   │   INSTALLED                                          │
│                 │   │   RECOMMENDED                                        │
└─────────────────┘   └──────────────────────────────────────────────────────┘

After clicking … you should see something like:

    ┌─────────────────────────────────┐
    │ Check for Extension Updates     │
    │ …                               │
    │ Install from VSIX…         ←────│  this one
    └─────────────────────────────────┘
```

#### If you still cannot see `…`

| Situation | What to do |
|-----------|------------|
| Search box visible, no `…` | Widen the window; do not make the sidebar too narrow. |
| Mixed DE/EN UI | Use **Path A** (Command Palette) — search `VSIX`. |
| Only browser Marketplace open | That is not the desktop app. Launch **VS Code** locally. |
| Cursor / VSCodium | Same idea; terminal may use `cursor` / `codium` instead of `code`. |
| Menu missing or cut off | **Path A** always works without the `…` button. |

---

### Path C — Terminal

```bash
code --install-extension path/to/grok-build-vscode-0.2.1.vsix
```

Windows PowerShell example:

```powershell
code --install-extension "$env:USERPROFILE\Downloads\grok-build-vscode-0.2.1.vsix"
```

If `code` is not recognized:

1. Open VS Code  
2. Command Palette (`Ctrl+Shift+P`)  
3. Run: **Shell Command: Install 'code' command in PATH**  
4. Reopen the terminal and retry

**Cursor:**

```powershell
cursor --install-extension C:\Users\You\Downloads\grok-build-vscode-0.2.1.vsix
```

---

## 3. Verify it is installed

1. Open Extensions: **`Ctrl+Shift+X`**.
2. Search: **`Grok Build`** (or filter **Installed**).
3. You should see **Grok Build for VS Code** as **Installed**.
4. Command Palette → run **`Grok Build: Open Chat`**.
5. Optional: **Grok** icon on the Activity Bar.

### Also: Grok CLI

The extension drives the **Grok Build CLI**. Without it you may see “CLI required”.

```bash
grok --version
```

If missing: command **Grok Build: Setup CLI…** or https://x.ai/cli

---

## 4. Common stuck points

| Problem | Cause | Fix |
|---------|-------|-----|
| No “Install from VSIX” in extension search | That is Marketplace search, not the menu | **Path A**: Command Palette → `VSIX` |
| Only web Marketplace | Browser, not desktop VS Code | Launch the **VS Code app** |
| Nothing after install | Window not reloaded | Command Palette → **Developer: Reload Window** |
| Extension installed, chat wants CLI | CLI missing / not on PATH | `grok --version`, then Setup CLI |
| Update later | No Marketplace auto-update | Download newer `.vsix` and install again |
| Wrong file | Source zip instead of VSIX | Check Release **Assets** again |

---

## 5. DE ↔ EN UI labels

| English | German |
|---------|--------|
| Extensions | Erweiterungen |
| Search Extensions in Marketplace | Im Marketplace nach Erweiterungen suchen |
| Install from VSIX… | Von VSIX installieren… |
| Extensions: Install from VSIX… | Erweiterungen: Von VSIX installieren… |
| Reload | Neu laden |
| Developer: Reload Window | Entwickler: Fenster neu laden |
| Installed | Installiert |

---

## 6. One-line cheat sheet

> **`Ctrl+Shift+P`** → type **`VSIX`** → **Extensions: Install from VSIX…** → pick the file.

That is enough in almost all cases — even if the three dots are hard to find.

---

## Next

- [User guide](./USER_GUIDE.md)  
- In VS Code: **Grok Build: Setup CLI…**  
- German version: [../de/INSTALL_VSIX.md](../de/INSTALL_VSIX.md)  
