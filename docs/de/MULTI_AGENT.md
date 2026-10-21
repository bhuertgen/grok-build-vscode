# Multi-Agent-Monitoring (Grok Build for VS Code)

**Sprache:** Deutsch · English: [../en/MULTI_AGENT.md](../en/MULTI_AGENT.md)

## Wie Multi-Agent mit dieser Extension funktioniert

Die **Sub-Agents** von Grok Build laufen **im offiziellen CLI** (`grok agent stdio`), nicht als eigene VS-Code-Prozesse.

```
VS Code Extension (UI)
        │  ACP session/update (tool_call / tool_call_update)
        ▼
Grok-CLI-Prozess (einer pro Chat-Session)
        ├── Haupt-Agent
        ├── Sub-Agent A  (von der CLI gestartet)
        └── Sub-Agent B
```

Die Extension **beobachtet** Tool-Aktivität über ACP:

| Update | Bedeutung |
|--------|-----------|
| `tool_call` | Neues Tool / neuer Sub-Task gestartet |
| `tool_call_update` | Status: pending → in_progress → completed / failed |

## Was du heute in der UI siehst

Leiste **Tasks / Tools** (über dem Chat):

- Live-Liste der letzten/aktiven Tool-Aufrufe  
- Status-Punkte: gelb = läuft, grün = fertig, rot = fehlgeschlagen  
- **Tool-Zeilen** in der Timeline (aufklappbar)  

Das ist die erste **Status-Oberfläche** für Multi-Agent. Ein eigenes Fenster pro Sub-Agent gibt es noch nicht.

## Multi-Agent testen

1. Workspace **trusted** (nicht Restricted Mode).  
2. Mode **Execute**, Permissions idealerweise in Execute automatisch erlauben (`grokBuild.autoAllowInExecuteMode: true`).  
   Das Setting `grokBuild.noSubagents` muss **false** sein (CLI `--no-subagents` verhindert das Starten).  
3. Prompt, der parallele Arbeit erzwingt, z. B.:

   > Starte zwei Sub-Agents: einer listet die TypeScript-Dateien in src/ auf, der andere fasst package.json zusammen. Führe danach die Ergebnisse zusammen.

4. Beobachten:
   - Panel **Tasks / Tools** auf gleichzeitige Tool-Zeilen  
   - Chat-Systemzeilen `⚙ …`  
   - Output-Kanal **Grok Build** (debug) für ACP-JSON  

5. CLI-seitig (optional): dieselbe Aufgabe in der Terminal-TUI `grok` ausführen und die Sub-Agent-Anzeige vergleichen.

## Mögliche nächste UX (Roadmap)

| Option | Vorteile | Nachteile |
|--------|----------|-----------|
| **A. Statusleiste** (aktuell) | Einfach, immer sichtbar | Keine getrennten Logs pro Agent |
| **B. Seitenpanel „Agents“** | Eigene Liste + Filter | Zusätzliche UI-Fläche |
| **C. Editor-Tabs pro Sub-Agent** | Vollständiges Transkript pro Agent | Braucht CLI-seitige Sub-Session-Streams über ACP |
| **D. Tree View** in der Activity Bar | Natives VS-Code-Gefühl | Weniger in den Chat integriert |

**Empfohlener Weg:** **A** beibehalten und erweitern um:

1. Klick auf Zeile → Scroll zur zugehörigen Tool-Card im Chat  
2. Gruppierung nach `parentToolCallId` / Titel-Präfix, sobald die CLI das liefert  
3. Dauer-Timer (startedAt → finishedAt)  
4. Optionales schwebendes „Agents“-Webview-Panel für lange Multi-Agent-Läufe  

Vollständige Chat-Streams pro Agent setzen voraus, dass Grok CLI / ACP **Sub-Session**-Updates veröffentlichen (nicht nur Tool-Titel). Bis dahin gilt: Monitoring = tool_call-Timeline.

## Permissions & Writes (verwandt)

Multi-Agent-Läufe scheitern stillschweigend, wenn Tools wegen einer Permission in `pending` hängen bleiben. Der Execute-Modus **erlaubt** Tools daher standardmäßig automatisch, damit Sub-Agents fertig werden. Datei-Writes über ACP werden **sofort** angewendet (nicht blockierend).
