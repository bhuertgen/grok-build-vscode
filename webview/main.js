/* global acquireVsCodeApi */
(function () {
  const vscode = acquireVsCodeApi();

  const els = {
    tabs: document.getElementById('sessionTabs'),
    messages: document.getElementById('messages'),
    input: document.getElementById('input'),
    btnSend: document.getElementById('btnSend'),
    btnStop: document.getElementById('btnStop'),
    btnNew: document.getElementById('btnNew'),
    btnHistory: document.getElementById('btnHistory'),
    btnMode: document.getElementById('btnMode'),
    btnPlus: document.getElementById('btnPlus'),
    btnSlash: document.getElementById('btnSlash'),
    attachMenu: document.getElementById('attachMenu'),
    actionsMenu: document.getElementById('actionsMenu'),
    actionsFilter: document.getElementById('actionsFilter'),
    actionsList: document.getElementById('actionsList'),
    btnContext: document.getElementById('btnContext'),
    btnImage: document.getElementById('btnImage'),
    btnActiveFile: document.getElementById('btnActiveFile'),
    imageInput: document.getElementById('imageInput'),
    statusBar: document.getElementById('statusBar'),
    statusText: document.getElementById('statusText'),
    usageText: document.getElementById('usageText'),
    chipModel: document.getElementById('chipModel'),
    chipPerm: document.getElementById('chipPerm'),
    contextChips: document.getElementById('contextChips'),
    planPanel: document.getElementById('planPanel'),
    planList: document.getElementById('planList'),
    agentsPanel: document.getElementById('agentsPanel'),
    agentsList: document.getElementById('agentsList'),
    permCard: document.getElementById('permCard'),
    permCardTitle: document.getElementById('permCardTitle'),
    permCardDetail: document.getElementById('permCardDetail'),
    permAllow: document.getElementById('permAllow'),
    permAllowAlways: document.getElementById('permAllowAlways'),
    permReject: document.getElementById('permReject'),
    pendingEdits: document.getElementById('pendingEdits'),
    cliBanner: document.getElementById('cliBanner'),
    cliBannerDetail: document.getElementById('cliBannerDetail'),
    btnSetupCli: document.getElementById('btnSetupCli'),
    updateBanner: document.getElementById('updateBanner'),
    updateBannerDetail: document.getElementById('updateBannerDetail'),
    btnUpdateCli: document.getElementById('btnUpdateCli'),
    btnDismissUpdate: document.getElementById('btnDismissUpdate'),
    extUpdateBanner: document.getElementById('extUpdateBanner'),
    extUpdateBannerDetail: document.getElementById('extUpdateBannerDetail'),
    btnOpenExtRelease: document.getElementById('btnOpenExtRelease'),
    btnDismissExtUpdate: document.getElementById('btnDismissExtUpdate'),
    trustBanner: document.getElementById('trustBanner'),
    trustBannerDetail: document.getElementById('trustBannerDetail'),
    btnTrust: document.getElementById('btnTrust'),
    memoryBanner: document.getElementById('memoryBanner'),
    memoryBannerTitle: document.getElementById('memoryBannerTitle'),
    memoryBannerDetail: document.getElementById('memoryBannerDetail'),
    btnSeedHistory: document.getElementById('btnSeedHistory'),
    btnDismissMemory: document.getElementById('btnDismissMemory'),
    slashMenu: document.getElementById('slashMenu'),
    bottomPicker: document.getElementById('bottomPicker'),
  };

  /** / actions menu state */
  let actionsOpen = false;
  let actionsIndex = 0;
  /** @type {Array<{ id: string, section: string, title: string, desc: string, meta?: string, icon: string, run: () => void }>} */
  let actionsFiltered = [];

  /** @type {{ sessions: any[], activeId: string | null, pendingEdits: any[], cli: any, processCount: number, history: any[] }} */
  let state = {
    sessions: [],
    activeId: null,
    pendingEdits: [],
    cli: { ready: true, checking: false },
    processCount: 0,
    history: [],
    settings: {
      permissionMode: 'ask',
      permissionLabel: 'Ask',
      alwaysApprove: false,
      defaultModel: null,
    },
  };

  /** @type {Array<{ mimeType: string, data: string }>} */
  let pendingImages = [];

  /** @type {null | { id: string, toolCall: any, options: any[] }} */
  let activePermission = null;

  /** Preserve expand state across re-renders (Claude-style collapsible tools) */
  const expandedTools = new Set();
  const expandedThoughts = new Set();
  /** When true, show each completed tool as its own row (default: one summary row) */
  let toolsExpanded = false;

  /** Slash menu state */
  let slashOpen = false;
  let slashIndex = 0;
  /** @type {Array<{ name: string, description: string, input?: { hint?: string } | null }>} */
  let slashFiltered = [];

  /** @-mention file picker (workspace files) */
  let atOpen = false;
  let atIndex = 0;
  let atQuery = '';
  /** @type {Array<{ path: string, label: string, description: string }>} */
  let atFiles = [];
  let atQueryTimer = null;
  let atRequestId = 0;

  /** Bottom picker (model / permission / context) — same position as slash menu */
  let bottomPickerOpen = false;
  let bottomPickerKind = /** @type {null | 'model' | 'permission' | 'context'} */ (null);
  let bottomPickerIndex = 0;
  /** @type {Array<{ value: string, label: string, description?: string, selected?: boolean }>} */
  let bottomPickerItems = [];

  // ─── Post → extension ─────────────────────────────────────────────────────

  function post(type, payload) {
    vscode.postMessage({ type, ...payload });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  function activeSession() {
    return state.sessions.find((s) => s.localId === state.activeId) || null;
  }

  function render() {
    renderCliBanner();
    renderUpdateBanner();
    renderTrustBanner();
    renderMemoryBanner();
    renderTabs();
    renderStatus();
    renderPlan();
    renderAgents();
    renderPermissionCard();
    renderMessages();
    renderChips();
    renderPendingEdits();
    renderComposer();
  }

  function renderUpdateBanner() {
    const cli = state.cli || {};
    if (els.updateBanner) {
      if (cli.ready && cli.updateAvailable) {
        els.updateBanner.classList.remove('hidden');
        if (els.updateBannerDetail) {
          const cur = cli.updateCurrent || '?';
          const lat = cli.updateLatest || '?';
          els.updateBannerDetail.textContent =
            cli.updateMessage ||
            `Grok CLI ${cur} → ${lat} is available. Recommended for ACP compatibility.`;
        }
      } else {
        els.updateBanner.classList.add('hidden');
      }
    }
    if (els.extUpdateBanner) {
      if (cli.extensionUpdateAvailable) {
        els.extUpdateBanner.classList.remove('hidden');
        if (els.extUpdateBannerDetail) {
          els.extUpdateBannerDetail.textContent =
            cli.extensionUpdateMessage ||
            `Extension ${cli.extensionUpdateCurrent || '?'} → ${cli.extensionUpdateLatest || '?'}. Download the .vsix from GitHub and Install from VSIX.`;
        }
      } else {
        els.extUpdateBanner.classList.add('hidden');
      }
    }
  }

  function renderMemoryBanner() {
    if (!els.memoryBanner) {
      return;
    }
    const s = activeSession();
    if (!s || s.contextNoticeDismissed) {
      els.memoryBanner.classList.add('hidden');
      return;
    }
    const ctx = s.agentContext || 'new';
    const seedPending = !!s.seedHistoryOnNextPrompt;
    els.memoryBanner.classList.remove('warn', 'ok');

    if (ctx === 'resumed') {
      els.memoryBanner.classList.remove('hidden');
      els.memoryBanner.classList.add('ok');
      if (els.memoryBannerTitle) {
        els.memoryBannerTitle.textContent = 'Session fortgesetzt';
      }
      if (els.memoryBannerDetail) {
        els.memoryBannerDetail.textContent =
          'CLI-Resume ok — der Agent kennt den bisherigen Verlauf.';
      }
      els.btnSeedHistory?.classList.add('hidden');
      return;
    }

    if (ctx === 'seeded') {
      els.memoryBanner.classList.remove('hidden');
      els.memoryBanner.classList.add('ok');
      if (els.memoryBannerTitle) {
        els.memoryBannerTitle.textContent = 'Verlauf im Kontext';
      }
      if (els.memoryBannerDetail) {
        els.memoryBannerDetail.textContent =
          'Lokaler Chat wurde in den Agent-Kontext geladen (mit der letzten / nächsten Nachricht).';
      }
      els.btnSeedHistory?.classList.add('hidden');
      return;
    }

    if (ctx === 'local-only' || seedPending) {
      els.memoryBanner.classList.remove('hidden');
      els.memoryBanner.classList.add('warn');
      if (els.memoryBannerTitle) {
        els.memoryBannerTitle.textContent = seedPending
          ? 'Kontext wird geladen'
          : 'Nur UI-Verlauf';
      }
      if (els.memoryBannerDetail) {
        els.memoryBannerDetail.textContent = seedPending
          ? 'Mit der nächsten Nachricht erhält der Agent den bisherigen Chat als Hintergrund.'
          : 'Verlauf ist sichtbar, der Agent startet aber neu und erinnert sich nicht. Optional in den Kontext laden.';
      }
      if (els.btnSeedHistory) {
        els.btnSeedHistory.classList.toggle('hidden', seedPending);
        els.btnSeedHistory.textContent = 'Verlauf in Kontext laden';
      }
      return;
    }

    els.memoryBanner.classList.add('hidden');
  }

  function renderAgents() {
    if (!els.agentsPanel || !els.agentsList) {
      return;
    }
    const s = activeSession();
    // Only show live/recent running work — compact multi-agent strip
    const agents = (s?.agents || []).filter(
      (a) => a.status === 'pending' || a.status === 'in_progress'
    );
    if (!agents.length) {
      els.agentsPanel.classList.add('hidden');
      els.agentsList.innerHTML = '';
      return;
    }
    els.agentsPanel.classList.remove('hidden');
    els.agentsList.innerHTML = '';
    for (const a of agents) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'agent-chip';
      row.title = 'Scroll to tool / expand';
      row.innerHTML = `
        <span class="agent-dot ${escapeHtml(a.status || '')}"></span>
        <span class="agent-chip-kind">${escapeHtml(kindLabel(a.kind, a.title))}</span>
        <span class="agent-chip-title">${escapeHtml(a.title || '')}</span>
      `;
      row.addEventListener('click', () => {
        expandedTools.add(a.id);
        renderMessages();
        const el = els.messages.querySelector(`[data-tool-id="${a.id}"]`);
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
      els.agentsList.appendChild(row);
    }
  }

  function renderPermissionCard() {
    if (!els.permCard) {
      return;
    }
    if (!activePermission) {
      els.permCard.classList.add('hidden');
      return;
    }
    els.permCard.classList.remove('hidden');
    const t = activePermission.toolCall || {};
    if (els.permCardTitle) {
      els.permCardTitle.textContent = t.title || t.kind || 'Tool permission';
    }
    if (els.permCardDetail) {
      els.permCardDetail.textContent = `${t.kind || 'tool'} · ${t.status || 'pending'} — Allow so Grok can continue.`;
    }
  }

  function renderCliBanner() {
    const cli = state.cli || {};
    if (!els.cliBanner) {
      return;
    }
    if (cli.checking) {
      els.cliBanner.classList.remove('hidden');
      if (els.cliBannerDetail) {
        els.cliBannerDetail.textContent = 'Checking for Grok CLI…';
      }
      els.btnSetupCli?.classList.add('hidden');
      return;
    }
    if (!cli.ready) {
      els.cliBanner.classList.remove('hidden');
      els.btnSetupCli?.classList.remove('hidden');
      if (els.cliBannerDetail) {
        els.cliBannerDetail.textContent =
          cli.error ||
          'Install the official CLI, then click Setup. Hybrid mode: grok agent stdio.';
      }
      return;
    }
    els.cliBanner.classList.add('hidden');
  }

  function renderTrustBanner() {
    if (!els.trustBanner) {
      return;
    }
    // Restricted Mode = workspace not trusted
    if (state.workspaceTrusted === false) {
      els.trustBanner.classList.remove('hidden');
      if (els.trustBannerDetail) {
        els.trustBannerDetail.textContent =
          state.trustMessage ||
          'This workspace is not trusted. File writes and tools are blocked until you trust the folder.';
      }
    } else {
      els.trustBanner.classList.add('hidden');
    }
  }

  function renderTabs() {
    els.tabs.innerHTML = '';
    for (const s of state.sessions) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tab' + (s.localId === state.activeId ? ' active' : '');
      tab.title = s.title;

      const label = document.createElement('span');
      label.textContent = truncate(s.title || 'Chat', 18);
      tab.appendChild(label);

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'close';
      close.title = 'Close';
      close.textContent = '×';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        post('closeSession', { localId: s.localId });
      });
      tab.appendChild(close);

      tab.addEventListener('click', () => {
        post('setActive', { localId: s.localId });
      });
      els.tabs.appendChild(tab);
    }
  }

  function renderStatus() {
    const cli = state.cli || {};
    const s = activeSession();

    if (cli.checking) {
      els.statusText.textContent = 'Checking CLI…';
      els.usageText.textContent = '';
      els.statusBar.classList.remove('error');
      return;
    }
    if (!cli.ready) {
      els.statusText.textContent = 'CLI missing';
      els.usageText.textContent = '';
      els.statusBar.classList.add('error');
      return;
    }

    if (!s) {
      els.statusText.textContent = 'No session — click + to start';
      els.usageText.textContent =
        state.processCount > 0 ? `${state.processCount} proc` : '';
      els.statusBar.classList.remove('error');
      return;
    }
    const bits = [statusLabel(s)];
    if (s.mode) {
      bits.push(s.mode);
    }
    if (s.agentContext === 'resumed') {
      bits.push('resumed');
    } else if (s.agentContext === 'seeded') {
      bits.push('ctx:history');
    } else if (s.agentContext === 'local-only') {
      bits.push(s.seedHistoryOnNextPrompt ? 'seed…' : 'ui-only');
    }
    if (state.processCount) {
      bits.push(`${state.processCount}p`);
    }
    els.statusText.textContent = bits.join(' · ');
    els.statusBar.classList.toggle('error', s.status === 'error');

    const modelId =
      s.model || state.settings?.defaultModel || 'default';
    if (els.chipModel) {
      const short = String(modelId).replace(/^grok-/, '');
      els.chipModel.textContent = truncate(short, 22);
      els.chipModel.title = `Model: ${modelId}\nClick to change`;
    }
    if (els.chipPerm) {
      const pl = state.settings?.permissionLabel || 'Ask';
      els.chipPerm.textContent = pl;
      els.chipPerm.title =
        `Permission: ${pl}` +
        (state.settings?.alwaysApprove ? ' (+ CLI --always-approve)' : '') +
        '\nClick to change';
      els.chipPerm.classList.toggle(
        'active-perm',
        pl === 'Always' || !!state.settings?.alwaysApprove
      );
    }

    if (s.usage) {
      const pct =
        s.usage.size > 0
          ? Math.round((s.usage.used / s.usage.size) * 100)
          : 0;
      let u = `${formatNum(s.usage.used)} / ${formatNum(s.usage.size)} tok (${pct}%)`;
      if (s.usage.cost) {
        u += ` · ${s.usage.cost.currency} ${s.usage.cost.amount.toFixed(4)}`;
      }
      els.usageText.textContent = u;
    } else {
      els.usageText.textContent = cli.version || '';
    }

    els.btnMode.textContent = s.mode === 'plan' ? 'Plan' : 'Execute';
    els.btnMode.className =
      'mode-btn ' + (s.mode === 'plan' ? 'plan' : 'execute');
  }

  function statusLabel(s) {
    switch (s.status) {
      case 'connecting':
        return 'Connecting…';
      case 'ready':
        return s.busy ? 'Working…' : 'Ready';
      case 'error':
        return s.lastError ? `Error: ${truncate(s.lastError, 80)}` : 'Error';
      default:
        return s.status;
    }
  }

  function renderPlan() {
    const s = activeSession();
    const entries = s?.plan?.entries;
    if (!entries?.length) {
      els.planPanel.classList.add('hidden');
      return;
    }
    els.planPanel.classList.remove('hidden');
    els.planList.innerHTML = '';
    for (const e of entries) {
      const li = document.createElement('li');
      li.textContent = e.content;
      if (e.status === 'completed') {
        li.className = 'done';
      } else if (e.status === 'in_progress') {
        li.className = 'progress';
      }
      els.planList.appendChild(li);
    }
  }

  function formatDuration(ms) {
    if (ms == null || ms < 0) {
      return '';
    }
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  /** Labels like Grok Build TUI / chat (Bash, Read, Edit, …) */
  function kindLabel(kind, title) {
    const k = (kind || '').toLowerCase();
    const t = (title || '').toLowerCase();
    if (k === 'read' || /\bread\b|lese|file content|cat /.test(t)) {
      return 'Read';
    }
    if (k === 'edit' || k === 'delete' || /\bwrite\b|edit|create|delete|patch|apply/.test(t)) {
      return 'Edit';
    }
    if (k === 'search' || /search|grep|find |rg |glob/.test(t)) {
      return 'Search';
    }
    if (k === 'execute' || /bash|shell|terminal|command|run |npm |git /.test(t)) {
      return 'Bash';
    }
    if (k === 'fetch' || /fetch|http|web |curl/.test(t)) {
      return 'Fetch';
    }
    if (k === 'think' || /think|reason/.test(t)) {
      return 'Think';
    }
    if (k === 'move') {
      return 'Move';
    }
    if (/sub.?agent|spawn|parallel/.test(t)) {
      return 'Agent';
    }
    if (k && k !== 'other') {
      return k.charAt(0).toUpperCase() + k.slice(1);
    }
    return 'Tool';
  }

  function isToolRunning(t) {
    return t?.status === 'pending' || t?.status === 'in_progress';
  }

  function buildTimeline(s) {
    /** @type {Array<{ type: string, ts: number, m?: any, t?: any, tools?: any[] }>} */
    const items = [];
    for (const m of s.messages || []) {
      // Skip empty leftovers and legacy tool spam
      if (!m) {
        continue;
      }
      if (
        m.role === 'system' &&
        (String(m.content || '').startsWith('⚙') ||
          String(m.content || '').startsWith('Allowed:'))
      ) {
        continue;
      }
      if (
        (m.role === 'agent' || m.role === 'thought' || m.role === 'system') &&
        !String(m.content || '').trim() &&
        !m.streaming
      ) {
        continue;
      }
      // Decorative-only leftovers (pure rules / box lines) — never render
      if (
        (m.role === 'agent' || m.role === 'system') &&
        isDecorativeOnlyContent(m.content)
      ) {
        continue;
      }
      items.push({ type: 'msg', ts: m.timestamp || 0, m });
    }

    const tools = (s.toolCalls || []).filter((t) => t?.id);
    const running = tools.filter(isToolRunning);
    const done = tools.filter((t) => !isToolRunning(t));

    // Live tools: always one compact row each (Grok Build style)
    for (const t of running) {
      items.push({ type: 'tool', ts: t.startedAt || 0, t });
    }

    // Completed tools: one summary row by default (avoids “ruled paper” stack after the answer).
    // Expand to list each tool only when the user asks.
    if (done.length === 1) {
      items.push({ type: 'tool', ts: done[0].startedAt || 0, t: done[0] });
    } else if (done.length > 1) {
      if (toolsExpanded) {
        for (const t of done) {
          items.push({ type: 'tool', ts: t.startedAt || 0, t });
        }
      } else {
        const ts = Math.min(...done.map((t) => t.startedAt || 0));
        items.push({ type: 'tool-group', ts, tools: done });
      }
    }

    // Stable chrono order: tools during the turn, then agent text
    items.sort((a, b) => {
      if (a.ts !== b.ts) {
        return a.ts - b.ts;
      }
      const rank = (it) =>
        it.type === 'tool' || it.type === 'tool-group'
          ? 0
          : it.m?.role === 'thought'
            ? 1
            : it.m?.role === 'agent'
              ? 2
              : 1;
      return rank(a) - rank(b);
    });
    return items;
  }

  /** True if content is only horizontal-rule / box-drawing noise */
  function isDecorativeOnlyContent(src) {
    const t = String(src || '')
      .replace(/[\s\u00a0]+/g, '')
      .replace(/[-–—_=*~─━─|]{2,}/g, '');
    return t.length === 0 && String(src || '').trim().length > 0;
  }

  function renderToolGroup(tools) {
    const wrap = document.createElement('div');
    wrap.className = 'tool-group';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tool-group-head';
    const kinds = [];
    for (const t of tools) {
      const k = kindLabel(t.kind, t.title);
      if (!kinds.includes(k)) {
        kinds.push(k);
      }
    }
    const kindHint =
      kinds.length <= 3 ? kinds.join(' · ') : `${kinds.slice(0, 3).join(' · ')}…`;
    btn.innerHTML = `
      <span class="agent-dot completed"></span>
      <span class="tool-kind kind-tool">Tools</span>
      <span class="tool-title">${tools.length} used${kindHint ? ' · ' + escapeHtml(kindHint) : ''}</span>
      <span class="tool-meta">done</span>
      <span class="tool-chevron">▸</span>
    `;
    btn.addEventListener('click', () => {
      toolsExpanded = true;
      renderMessages();
    });
    wrap.appendChild(btn);
    return wrap;
  }

  function renderToolRow(t) {
    const wrap = document.createElement('div');
    const running = isToolRunning(t);
    // Grok Build style: always one compact line; expand only on user click
    const isOpen = expandedTools.has(t.id);
    const kl = kindLabel(t.kind, t.title);
    wrap.className =
      'tool-row' +
      (isOpen ? ' open' : '') +
      (running ? ' running' : '') +
      ' kind-' +
      kl.toLowerCase();
    wrap.dataset.toolId = t.id;

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'tool-row-head';
    const dur = formatDuration(t.durationMs);
    const statusLabel = running
      ? 'running'
      : t.status === 'completed'
        ? dur || 'done'
        : t.status || '';
    const title = (t.title || '').trim() || kl;
    head.innerHTML = `
      <span class="agent-dot ${escapeHtml(t.status || '')}"></span>
      <span class="tool-kind kind-${escapeHtml(kl.toLowerCase())}">${escapeHtml(kl)}</span>
      <span class="tool-title">${escapeHtml(title)}</span>
      <span class="tool-meta">${escapeHtml(statusLabel)}</span>
      <span class="tool-chevron">${isOpen ? '▾' : '▸'}</span>
    `;
    head.addEventListener('click', () => {
      if (expandedTools.has(t.id)) {
        expandedTools.delete(t.id);
      } else {
        expandedTools.add(t.id);
      }
      renderMessages();
    });
    wrap.appendChild(head);

    if (isOpen) {
      const body = document.createElement('div');
      body.className = 'tool-row-body';
      if (t.input) {
        const inEl = document.createElement('div');
        inEl.className = 'tool-io';
        inEl.innerHTML = `<div class="tool-io-label">IN</div><pre>${escapeHtml(t.input)}</pre>`;
        body.appendChild(inEl);
      }
      if (t.output) {
        const outEl = document.createElement('div');
        outEl.className = 'tool-io';
        outEl.innerHTML = `<div class="tool-io-label">OUT</div><pre>${escapeHtml(t.output)}</pre>`;
        body.appendChild(outEl);
      }
      if (!t.input && !t.output) {
        const empty = document.createElement('div');
        empty.className = 'tool-io-empty';
        empty.textContent = running ? 'Running…' : 'No detail captured';
        body.appendChild(empty);
      }
      if (t.locations?.length) {
        const loc = document.createElement('div');
        loc.className = 'tool-io-empty';
        loc.textContent = t.locations
          .map((l) => l.path + (l.line != null ? ':' + l.line : ''))
          .join(', ');
        body.appendChild(loc);
      }
      // Collapse-all control when listing every completed tool
      if (!running && toolsExpanded) {
        const collapse = document.createElement('button');
        collapse.type = 'button';
        collapse.className = 'tool-collapse-all';
        collapse.textContent = 'Collapse tools';
        collapse.addEventListener('click', (e) => {
          e.stopPropagation();
          toolsExpanded = false;
          expandedTools.clear();
          renderMessages();
        });
        body.appendChild(collapse);
      }
      wrap.appendChild(body);
    }
    return wrap;
  }

  function renderThoughtRow(m) {
    const wrap = document.createElement('div');
    // Collapsed by default (Grok Build: one line; click to expand)
    const isOpen = expandedThoughts.has(m.id);
    wrap.className =
      'thought-row' + (isOpen ? ' open' : '') + (m.streaming ? ' running' : '');

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'thought-row-head';
    const preview = (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 72);
    const label = m.streaming
      ? 'Thinking…'
      : preview
        ? `Thought · ${preview}${(m.content || '').length > 72 ? '…' : ''}`
        : 'Thought';
    head.innerHTML = `
      <span class="agent-dot ${m.streaming ? 'in_progress' : 'completed'}"></span>
      <span class="tool-kind kind-think">Thought</span>
      <span class="tool-title">${escapeHtml(label)}</span>
      <span class="tool-chevron">${isOpen ? '▾' : '▸'}</span>
    `;
    head.addEventListener('click', () => {
      if (expandedThoughts.has(m.id)) {
        expandedThoughts.delete(m.id);
      } else {
        expandedThoughts.add(m.id);
      }
      renderMessages();
    });
    wrap.appendChild(head);

    if (isOpen) {
      const body = document.createElement('div');
      body.className =
        'thought-row-body' + (m.streaming ? ' streaming-cursor' : '');
      body.textContent = m.content || '';
      wrap.appendChild(body);
    }
    return wrap;
  }

  function renderMessages() {
    const s = activeSession();
    const prevScroll = els.messages.scrollTop;
    const prevHeight = els.messages.scrollHeight;
    const nearBottom =
      prevHeight - prevScroll - els.messages.clientHeight < 100;

    els.messages.innerHTML = '';

    if (!s || (s.messages.length === 0 && !(s.toolCalls || []).length)) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const cli = state.cli || {};
      const logoSrc = document.getElementById('brandLogo')?.getAttribute('src') || '';
      const logoHtml = logoSrc
        ? `<img class="empty-logo" src="${logoSrc}" alt="Grok" width="40" height="40" />`
        : '';
      if (!cli.ready && !cli.checking) {
        empty.innerHTML = `
          ${logoHtml}
          <h2>Connect Grok CLI</h2>
          <p>Install the official CLI, then click Setup.</p>
          <p class="empty-tagline">// grok agent stdio</p>
        `;
      } else {
        empty.innerHTML = `
          ${logoHtml}
          <p class="empty-tagline">// TODO: Everything. Let's build.</p>
          <p>Ask Grok to read, edit, and run tools in this workspace.</p>
          <p class="empty-hint">Chats for this folder are saved automatically. Use ↺ for history.</p>
        `;
      }
      els.messages.appendChild(empty);
      // Recent project chats under empty state (Claude Code–style continue)
      const hist = (state.history || []).filter(
        (h) => h.messageCount > 0 && !h.isActive
      );
      if (hist.length > 0) {
        const panel = document.createElement('div');
        panel.className = 'history-panel';
        const title = document.createElement('div');
        title.className = 'history-panel-title';
        title.textContent = 'Recent in this project';
        panel.appendChild(title);
        for (const h of hist.slice(0, 8)) {
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'history-row';
          const when = h.updatedAt
            ? new Date(h.updatedAt).toLocaleString()
            : '';
          row.innerHTML = `
            <span class="history-row-title">${escapeHtml(h.title || 'Chat')}</span>
            <span class="history-row-meta">${escapeHtml(when)} · ${h.messageCount} msgs</span>
            <span class="history-row-preview">${escapeHtml(h.preview || '')}</span>
          `;
          row.addEventListener('click', () => {
            post('resumeSessionId', { localId: h.localId });
          });
          panel.appendChild(row);
        }
        els.messages.appendChild(panel);
      }
      return;
    }

    const timeline = buildTimeline(s);
    for (const item of timeline) {
      if (item.type === 'tool-group' && item.tools?.length) {
        els.messages.appendChild(renderToolGroup(item.tools));
        continue;
      }
      if (item.type === 'tool' && item.t) {
        els.messages.appendChild(renderToolRow(item.t));
        continue;
      }
      const m = item.m;
      if (!m) {
        continue;
      }
      if (m.role === 'thought') {
        els.messages.appendChild(renderThoughtRow(m));
        continue;
      }

      const cleaned = sanitizeMessageContent(m.content || '');
      if (
        (m.role === 'agent' || m.role === 'system') &&
        !cleaned.trim() &&
        !m.streaming &&
        !(m.images && m.images.length)
      ) {
        continue;
      }

      const div = document.createElement('div');
      div.className = `msg ${m.role}`;
      div.dataset.msgId = m.id;

      if (m.role === 'agent') {
        const header = document.createElement('div');
        header.className = 'msg-header';
        const role = document.createElement('div');
        role.className = 'role';
        role.textContent = 'Grok';
        header.appendChild(role);
        if (cleaned && !m.streaming) {
          const copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'btn-copy';
          copyBtn.title = 'Copy';
          copyBtn.textContent = 'Copy';
          copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void copyText(cleaned, copyBtn);
          });
          header.appendChild(copyBtn);
        }
        div.appendChild(header);
      } else if (m.role === 'user' && m.content && !m.streaming) {
        const header = document.createElement('div');
        header.className = 'msg-header';
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn-copy';
        copyBtn.title = 'Copy';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          void copyText(m.content || '', copyBtn);
        });
        header.appendChild(copyBtn);
        div.appendChild(header);
      } else if (m.role === 'system' && cleaned) {
        div.title = 'Double-click to copy';
        div.addEventListener('dblclick', () => {
          void copyText(cleaned);
        });
      }

      const body = document.createElement('div');
      body.className = 'body' + (m.streaming ? ' streaming-cursor' : '');
      const html = formatMarkdown(
        m.role === 'user' ? m.content || '' : cleaned
      );
      // Skip bubbles that would only render empty / pure-rule HTML
      if (!html.trim() && !(m.images && m.images.length) && !m.streaming) {
        continue;
      }
      body.innerHTML = html;
      div.appendChild(body);

      if (m.role === 'user' && m.attachments?.length) {
        const att = document.createElement('div');
        att.className = 'msg-attachments';
        for (const a of m.attachments) {
          const chip = document.createElement('span');
          chip.className = 'msg-attach-chip';
          const pathLabel = (a.path || a.label || '').replace(/\\/g, '/');
          const short =
            pathLabel.includes('/')
              ? pathLabel
              : a.label || pathLabel;
          chip.title = pathLabel;
          chip.textContent = '@' + (short || a.label || 'file');
          att.appendChild(chip);
        }
        div.appendChild(att);
      }

      if (m.images?.length) {
        for (const img of m.images) {
          const el = document.createElement('img');
          el.className = 'attach';
          el.src = img.dataUrl;
          el.alt = 'attachment';
          div.appendChild(el);
        }
      }

      els.messages.appendChild(div);
    }

    // Auto-scroll: stick to bottom on first paint / when already near bottom
    const firstPaint = prevHeight < 40;
    if (nearBottom || firstPaint) {
      els.messages.scrollTop = els.messages.scrollHeight;
    } else {
      // Keep relative position when content above grows slightly
      const delta = els.messages.scrollHeight - prevHeight;
      if (delta !== 0) {
        els.messages.scrollTop = prevScroll;
      }
    }
  }

  function renderChips() {
    const s = activeSession();
    els.contextChips.innerHTML = '';
    if (!s?.contextItems?.length && pendingImages.length === 0) {
      return;
    }
    for (const c of s?.contextItems || []) {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = `<span title="${escapeHtml(c.detail || c.path || '')}">${escapeHtml(c.label)}</span>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '×';
      btn.addEventListener('click', () => {
        post('removeContext', { localId: s.localId, itemId: c.id });
      });
      chip.appendChild(btn);
      els.contextChips.appendChild(chip);
    }
    pendingImages.forEach((img, i) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = `<span>image ${i + 1}</span>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '×';
      btn.addEventListener('click', () => {
        pendingImages.splice(i, 1);
        renderChips();
      });
      chip.appendChild(btn);
      els.contextChips.appendChild(chip);
    });
  }

  function renderPendingEdits() {
    const edits = (state.pendingEdits || []).filter((e) => e.status === 'pending');
    if (!edits.length) {
      els.pendingEdits.classList.add('hidden');
      els.pendingEdits.innerHTML = '';
      return;
    }
    els.pendingEdits.classList.remove('hidden');
    els.pendingEdits.innerHTML = `<strong>${edits.length} pending edit(s)</strong>`;
    for (const e of edits) {
      const row = document.createElement('div');
      row.className = 'edit-row';
      row.innerHTML = `<span class="path" title="${escapeHtml(e.path)}">${escapeHtml(basename(e.path))}</span>`;
      const diff = document.createElement('button');
      diff.type = 'button';
      diff.textContent = 'Diff';
      diff.addEventListener('click', () => post('showDiff', { editId: e.id }));
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'primary';
      apply.textContent = 'Apply';
      apply.addEventListener('click', () => post('applyEdit', { editId: e.id }));
      const reject = document.createElement('button');
      reject.type = 'button';
      reject.textContent = 'Reject';
      reject.addEventListener('click', () => post('rejectEdit', { editId: e.id }));
      row.append(diff, apply, reject);
      els.pendingEdits.appendChild(row);
    }
    const all = document.createElement('div');
    all.className = 'edit-row';
    const applyAll = document.createElement('button');
    applyAll.type = 'button';
    applyAll.className = 'primary';
    applyAll.textContent = 'Apply all';
    applyAll.addEventListener('click', () => post('applyAllEdits', {}));
    all.appendChild(applyAll);
    els.pendingEdits.appendChild(all);
  }

  function renderComposer() {
    const s = activeSession();
    const busy = !!s?.busy;
    const cliOk = !state.cli || state.cli.ready;
    els.btnSend.classList.toggle('hidden', busy);
    els.btnStop.classList.toggle('hidden', !busy);
    els.btnSend.disabled = !cliOk || !s || s.status === 'connecting' || s.status === 'error';
    els.input.disabled = !cliOk || !s || s.status === 'connecting';
    els.btnNew.disabled = !cliOk && !state.cli?.checking;
  }

  // ─── Markdown (lightweight) ───────────────────────────────────────────────

  /**
   * Strip trailing decorative rules / blank lines that show up as residual
   * “ruled paper” lines under the answer. Collapse long runs of rule-only lines.
   */
  function sanitizeMessageContent(src) {
    if (!src) {
      return '';
    }
    let text = String(src).replace(/\r\n/g, '\n');
    // Trim trailing whitespace on each line (so "--- " still counts as a rule)
    text = text
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n');
    // Collapse 2+ consecutive rule-only lines into a single ---
    text = text.replace(
      /(?:^|\n)(?:[ \t]*(?:-{3,}|\*{3,}|_{3,}|[─━═_]{3,})[ \t]*(?:\n|$)){2,}/g,
      '\n---\n'
    );
    // Drop trailing rule-only / blank lines (common leftover after turns)
    text = text.replace(
      /(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,}|[─━═_]{3,})[ \t]*)+\s*$/g,
      ''
    );
    text = text.replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
    return text;
  }

  function formatMarkdown(src) {
    if (!src) {
      return '';
    }
    let text = escapeHtml(sanitizeMessageContent(src));

    // Fenced code blocks
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="lang-${escapeHtml(lang)}">${code.replace(/\n$/, '')}</code></pre>`;
    });

    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // @path mentions (context files) — highlight as chips-in-text
    text = text.replace(
      /(^|[\s])@([^\s@<>]+)/g,
      '$1<code class="at-ref">@$2</code>'
    );

    // Bold / italic
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Links
    text = text.replace(
      /\[([^\]]+)\]\((https?:[^)]+)\)/g,
      '<a href="$2" rel="noreferrer">$1</a>'
    );

    // Horizontal rules — one marker only (trimmed lines already sanitized)
    text = text.replace(
      /^(?:-{3,}|\*{3,}|_{3,}|[─━═]{3,})$/gm,
      '<hr class="md-hr" />'
    );
    // Never emit stacked hrs
    text = text.replace(/(?:<hr class="md-hr" \/>\s*){2,}/g, '<hr class="md-hr" />');

    // Paragraphs: double newlines — skip empty leftovers
    const parts = text
      .split(/\n{2,}/)
      .map((p) => {
        const trimmed = p.trim();
        if (!trimmed) {
          return '';
        }
        if (trimmed.startsWith('<pre>') || trimmed.startsWith('<hr')) {
          return trimmed;
        }
        // Drop paragraphs that are only <br> / whitespace after conversion
        const withBreaks = p.replace(/\n/g, '<br>');
        if (!withBreaks.replace(/<br\s*\/?>/gi, '').trim()) {
          return '';
        }
        return `<p>${withBreaks}</p>`;
      })
      .filter(Boolean);
    // Collapse adjacent hrs that landed in separate parts
    return parts
      .join('')
      .replace(/(?:<hr class="md-hr" \/>)+/g, '<hr class="md-hr" />');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function truncate(s, n) {
    if (!s) {
      return '';
    }
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function basename(p) {
    if (!p) {
      return '';
    }
    const parts = p.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || p;
  }

  function formatNum(n) {
    if (n >= 1_000_000) {
      return (n / 1_000_000).toFixed(1) + 'M';
    }
    if (n >= 1_000) {
      return (n / 1_000).toFixed(1) + 'k';
    }
    return String(n);
  }

  /** Copy text to clipboard (selection still works with Ctrl+C). */
  async function copyText(text, btn) {
    if (!text) {
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older webview hosts
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = prev;
          btn.classList.remove('copied');
        }, 1200);
      }
    } catch (err) {
      console.error('copy failed', err);
      post('toast', { text: 'Copy failed — select text and use Ctrl+C' });
    }
  }

  // ─── Slash commands (Grok Build TUI style) ────────────────────────────────

  function commandList() {
    const s = activeSession();
    return s?.availableCommands?.length
      ? s.availableCommands
      : [
          { name: 'help', description: 'List available slash commands' },
          { name: 'plan', description: 'Switch to Plan mode' },
          { name: 'execute', description: 'Switch to Execute mode' },
          { name: 'model', description: 'Select model' },
          { name: 'context', description: 'Add context' },
          { name: 'clear', description: 'Clear transcript' },
          { name: 'new', description: 'New session' },
        ];
  }

  /** Detect `/query` when the message starts with a slash command. */
  function parseSlashQuery(value) {
    const m = /^(?:\/)([^\s]*)(?:\s|$)/.exec(value);
    if (!m) {
      return null;
    }
    const hasArgs = /\s/.test(value.trim().slice(1));
    return {
      query: m[1].toLowerCase(),
      hasArgs,
      full: value,
    };
  }

  /**
   * Detect trailing @file query at cursor (Claude Code style).
   * Returns { query, start, end } of the @token or null.
   */
  function parseAtMention() {
    const value = els.input.value;
    const cursor = els.input.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    // @ only after start or whitespace (not email mid-word)
    const m = /(?:^|[\s])@([^\s@]*)$/.exec(before);
    if (!m) {
      return null;
    }
    const query = m[1] ?? '';
    const atIndexInBefore = before.lastIndexOf('@');
    if (atIndexInBefore < 0) {
      return null;
    }
    return {
      query,
      start: atIndexInBefore,
      end: cursor,
    };
  }

  function hideAtMenu() {
    atOpen = false;
    atIndex = 0;
    atQuery = '';
    atFiles = [];
    if (atQueryTimer) {
      clearTimeout(atQueryTimer);
      atQueryTimer = null;
    }
    // Only clear slash menu if it was showing at-files
    if (els.slashMenu && els.slashMenu.dataset.mode === 'at') {
      els.slashMenu.classList.add('hidden');
      els.slashMenu.innerHTML = '';
      delete els.slashMenu.dataset.mode;
    }
  }

  function updateAtMenu() {
    const parsed = parseAtMention();
    if (!parsed) {
      hideAtMenu();
      return;
    }
    // Don't fight slash commands
    if (parseSlashQuery(els.input.value)) {
      hideAtMenu();
      return;
    }
    hideBottomPicker();
    hideSlashMenu();
    atQuery = parsed.query;
    atOpen = true;
    const req = ++atRequestId;
    if (atQueryTimer) {
      clearTimeout(atQueryTimer);
    }
    atQueryTimer = setTimeout(() => {
      post('queryWorkspaceFiles', { query: atQuery, requestId: req });
    }, 80);
    // Show loading immediately
    renderAtMenu(true);
  }

  function renderAtMenu(loading) {
    if (!els.slashMenu || !atOpen) {
      return;
    }
    els.slashMenu.dataset.mode = 'at';
    els.slashMenu.classList.remove('hidden');
    els.slashMenu.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'picker-title';
    title.textContent = atQuery ? `@${atQuery}` : '@ Datei im Projekt';
    els.slashMenu.appendChild(title);

    if (loading && atFiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'slash-empty';
      empty.textContent = 'Suche Dateien…';
      els.slashMenu.appendChild(empty);
      return;
    }

    if (atFiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'slash-empty';
      empty.textContent = atQuery
        ? 'Keine Datei gefunden — Dateien im Workspace anlegen'
        : 'Keine Dateien im Workspace (leerer Ordner?)';
      els.slashMenu.appendChild(empty);
      // Fallback row: open VS Code QuickPick / dialog
      const browse = document.createElement('button');
      browse.type = 'button';
      browse.className = 'slash-item';
      browse.innerHTML =
        '<span class="slash-name">Durchsuchen…</span><span class="slash-desc">VS Code Dateiauswahl</span>';
      browse.addEventListener('mousedown', (e) => {
        e.preventDefault();
        post('openAtFilePicker', { query: atQuery });
        stripAtToken();
        hideAtMenu();
      });
      els.slashMenu.appendChild(browse);
      return;
    }

    atIndex = Math.min(atIndex, Math.max(0, atFiles.length - 1));
    atFiles.forEach((f, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slash-item' + (i === atIndex ? ' active' : '');
      btn.setAttribute('role', 'option');
      btn.innerHTML = `
        <span class="slash-name">${escapeHtml(f.label)}</span>
        <span class="slash-desc">${escapeHtml(f.description || f.path || '')}</span>
      `;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyAtFile(f);
      });
      els.slashMenu.appendChild(btn);
    });
    const activeEl = els.slashMenu.querySelector('.slash-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function stripAtToken() {
    const parsed = parseAtMention();
    if (!parsed) {
      return;
    }
    const v = els.input.value;
    const b = v.slice(0, parsed.start);
    const a = v.slice(parsed.end);
    // Keep a single space so the user can keep typing after the chip
    let next = b + a;
    if (b && !/\s$/.test(b) && a && !/^\s/.test(a)) {
      next = b + ' ' + a;
    } else if (b && !/\s$/.test(b) && !a) {
      next = b + ' ';
    }
    els.input.value = next.replace(/  +/g, ' ');
    const pos = Math.min(b.length + (next.length > b.length && next[b.length] === ' ' ? 1 : 0), els.input.value.length);
    els.input.setSelectionRange(pos, pos);
    autoResize();
  }

  function applyAtFile(f) {
    if (!f?.path) {
      return;
    }
    // Insert visible @rel/path (Claude Code style) instead of only a silent chip
    const rel = (f.description || f.label || '').replace(/\\/g, '/');
    const mention = '@' + (rel || f.label);
    const parsed = parseAtMention();
    if (parsed) {
      const v = els.input.value;
      const next =
        v.slice(0, parsed.start) + mention + ' ' + v.slice(parsed.end);
      els.input.value = next.replace(/  +/g, ' ');
      const pos = parsed.start + mention.length + 1;
      els.input.setSelectionRange(pos, pos);
    } else {
      stripAtToken();
      const v = els.input.value;
      const start = els.input.selectionStart ?? v.length;
      const end = els.input.selectionEnd ?? start;
      els.input.value =
        v.slice(0, start) + mention + ' ' + v.slice(end);
      const pos = start + mention.length + 1;
      els.input.setSelectionRange(pos, pos);
    }
    autoResize();
    hideAtMenu();
    post('addContextPath', { path: f.path });
    els.input.focus();
  }

  function updateSlashMenu() {
    const value = els.input.value;
    const parsed = parseSlashQuery(value);
    if (!parsed || parsed.hasArgs) {
      hideSlashMenu();
      return;
    }
    hideAtMenu();
    hideBottomPicker();
    const q = parsed.query;
    slashFiltered = commandList().filter((c) => {
      const n = c.name.toLowerCase();
      return !q || n.startsWith(q) || n.includes(q);
    });
    slashOpen = true;
    slashIndex = Math.min(slashIndex, Math.max(0, slashFiltered.length - 1));
    renderSlashMenu();
  }

  function renderSlashMenu() {
    if (!slashOpen || !els.slashMenu) {
      if (els.slashMenu && els.slashMenu.dataset.mode !== 'at') {
        els.slashMenu.classList.add('hidden');
        els.slashMenu.innerHTML = '';
      }
      return;
    }
    els.slashMenu.dataset.mode = 'slash';
    els.slashMenu.classList.remove('hidden');
    els.slashMenu.innerHTML = '';
    if (slashFiltered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'slash-empty';
      empty.textContent = 'No matching commands';
      els.slashMenu.appendChild(empty);
      return;
    }
    slashFiltered.forEach((cmd, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slash-item' + (i === slashIndex ? ' active' : '');
      btn.setAttribute('role', 'option');
      btn.innerHTML = `
        <span class="slash-name">/${escapeHtml(cmd.name)}</span>
        <span class="slash-desc">${escapeHtml(cmd.description || '')}</span>
        ${
          cmd.input?.hint
            ? `<span class="slash-hint">${escapeHtml(cmd.input.hint)}</span>`
            : ''
        }
      `;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applySlashCommand(cmd);
      });
      els.slashMenu.appendChild(btn);
    });
    const activeEl = els.slashMenu.querySelector('.slash-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function hideSlashMenu() {
    slashOpen = false;
    slashIndex = 0;
    slashFiltered = [];
    if (els.slashMenu && els.slashMenu.dataset.mode !== 'at') {
      els.slashMenu.classList.add('hidden');
      els.slashMenu.innerHTML = '';
      delete els.slashMenu.dataset.mode;
    } else if (els.slashMenu && !atOpen) {
      els.slashMenu.classList.add('hidden');
      els.slashMenu.innerHTML = '';
      delete els.slashMenu.dataset.mode;
    }
  }

  function applySlashCommand(cmd) {
    const needsInput = !!cmd.input?.hint;
    if (needsInput) {
      els.input.value = `/${cmd.name} `;
      hideSlashMenu();
      els.input.focus();
      const len = els.input.value.length;
      els.input.setSelectionRange(len, len);
      autoResize();
      return;
    }
    els.input.value = `/${cmd.name}`;
    hideSlashMenu();
    send();
  }

  function openSlashMenuForced() {
    closeAttachMenu();
    closeActionsMenu();
    hideBottomPicker();
    hideAtMenu();
    if (!els.input.value.startsWith('/')) {
      els.input.value = '/';
    }
    els.input.focus();
    const len = els.input.value.length;
    els.input.setSelectionRange(len, len);
    slashIndex = 0;
    updateSlashMenu();
    autoResize();
  }

  // ─── Bottom pickers (model / permission / context) ──────────────────────

  function hideBottomPicker() {
    bottomPickerOpen = false;
    bottomPickerKind = null;
    bottomPickerIndex = 0;
    bottomPickerItems = [];
    if (els.bottomPicker) {
      els.bottomPicker.classList.add('hidden');
      els.bottomPicker.innerHTML = '';
    }
  }

  function openBottomPicker(kind) {
    hideSlashMenu();
    hideAtMenu();
    closeAttachMenu();
    closeActionsMenu();
    bottomPickerKind = kind;
    bottomPickerIndex = 0;

    if (kind === 'model') {
      bottomPickerItems = (state.settings?.models || []).map((m) => ({
        value: m.value,
        label: m.label || m.value,
        description: m.description || m.value,
        selected: !!m.selected,
      }));
      if (bottomPickerItems.length === 0) {
        bottomPickerItems = [
          { value: 'grok-4.5', label: 'Grok 4.5', description: 'Default' },
          {
            value: 'grok-composer-2.5-fast',
            label: 'Composer 2.5 Fast',
            description: 'Fast',
          },
        ];
      }
    } else if (kind === 'permission') {
      bottomPickerItems = (state.settings?.permissions || []).map((p) => ({
        value: p.value,
        label: p.label,
        description: p.description,
        selected: !!p.selected,
      }));
      if (bottomPickerItems.length === 0) {
        bottomPickerItems = [
          { value: 'ask', label: 'Ask', description: 'Prompt every time' },
          {
            value: 'allow-once',
            label: 'Allow once',
            description: 'Auto-allow once',
          },
          {
            value: 'allow-session',
            label: 'Allow session',
            description: 'Auto-allow this session',
          },
          {
            value: 'allow-always',
            label: 'Allow always',
            description: '+ CLI always-approve',
          },
        ];
      }
    } else if (kind === 'context') {
      bottomPickerItems = [
        {
          value: 'file',
          label: 'File',
          description: 'Pick a file as context',
        },
        {
          value: 'symbol',
          label: 'Symbol',
          description: 'Symbol from active file',
        },
        {
          value: 'git',
          label: 'Git changes',
          description: 'Working tree / index',
        },
        {
          value: 'folder',
          label: 'Folder',
          description: 'Folder path as context',
        },
        {
          value: 'active',
          label: 'Active file / selection',
          description: 'Current editor',
        },
      ];
    } else {
      return;
    }

    const selectedIdx = bottomPickerItems.findIndex((i) => i.selected);
    bottomPickerIndex = selectedIdx >= 0 ? selectedIdx : 0;
    bottomPickerOpen = true;
    renderBottomPicker();
  }

  function renderBottomPicker() {
    if (!els.bottomPicker || !bottomPickerOpen) {
      if (els.bottomPicker) {
        els.bottomPicker.classList.add('hidden');
        els.bottomPicker.innerHTML = '';
      }
      return;
    }
    els.bottomPicker.classList.remove('hidden');
    els.bottomPicker.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'picker-title';
    title.textContent =
      bottomPickerKind === 'model'
        ? 'Model'
        : bottomPickerKind === 'permission'
          ? 'Permission'
          : 'Context';
    els.bottomPicker.appendChild(title);

    if (bottomPickerItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'slash-empty';
      empty.textContent = 'No options';
      els.bottomPicker.appendChild(empty);
      return;
    }

    bottomPickerItems.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'slash-item' +
        (i === bottomPickerIndex ? ' active' : '') +
        (item.selected ? ' selected' : '');
      btn.innerHTML = `
        <span class="slash-name">${escapeHtml(item.label)}${item.selected ? ' ✓' : ''}</span>
        <span class="slash-desc">${escapeHtml(item.description || item.value || '')}</span>
      `;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyBottomPicker(item);
      });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyBottomPicker(item);
      });
      els.bottomPicker.appendChild(btn);
    });

    const activeEl = els.bottomPicker.querySelector('.slash-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  let bottomApplyLock = false;
  function applyBottomPicker(item) {
    if (bottomApplyLock) {
      return;
    }
    bottomApplyLock = true;
    setTimeout(() => {
      bottomApplyLock = false;
    }, 300);
    const kind = bottomPickerKind;
    hideBottomPicker();
    const s = activeSession();
    // Defer post so we don't re-enter while the picker is still tearing down
    setTimeout(() => {
      if (kind === 'model') {
        // Optimistic UI feedback while agent respawns
        if (els.statusText) {
          els.statusText.textContent = 'Switching model…';
        }
        post('applyModel', {
          localId: s?.localId,
          modelId: item.value,
        });
      } else if (kind === 'permission') {
        post('applyPermissionMode', {
          localId: s?.localId,
          mode: item.value,
        });
      } else if (kind === 'context') {
        post('openContextKind', { kind: item.value });
      }
    }, 10);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  function send() {
    const text = els.input.value.trim();
    if (!text && pendingImages.length === 0) {
      return;
    }
    const s = activeSession();
    if (!s || s.busy) {
      return;
    }
    hideSlashMenu();
    toolsExpanded = false;
    post('sendPrompt', {
      localId: s.localId,
      text: text || '(image)',
      images: pendingImages.slice(),
    });
    els.input.value = '';
    pendingImages = [];
    autoResize();
    renderChips();
  }

  function autoResize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 160) + 'px';
  }

  els.btnSend.addEventListener('click', send);
  els.btnStop.addEventListener('click', () => {
    const s = activeSession();
    if (s) {
      post('cancel', { localId: s.localId });
    }
  });
  els.btnNew.addEventListener('click', () => post('newSession', {}));
  els.btnHistory.addEventListener('click', () => post('resumeSession', {}));
  els.btnMode.addEventListener('click', () => {
    const s = activeSession();
    if (s) {
      post('toggleMode', { localId: s.localId });
    }
  });
  function closeAttachMenu() {
    if (els.attachMenu) {
      els.attachMenu.classList.add('hidden');
    }
    els.btnPlus?.classList.remove('open');
  }

  function closeActionsMenu() {
    actionsOpen = false;
    actionsIndex = 0;
    actionsFiltered = [];
    if (els.actionsMenu) {
      els.actionsMenu.classList.add('hidden');
    }
    if (els.actionsFilter) {
      els.actionsFilter.value = '';
    }
    els.btnSlash?.classList.remove('open');
  }

  function closeAllComposerMenus() {
    closeAttachMenu();
    closeActionsMenu();
    hideSlashMenu();
    hideAtMenu();
    hideBottomPicker();
  }

  function toggleAttachMenu() {
    if (!els.attachMenu) {
      return;
    }
    const willOpen = els.attachMenu.classList.contains('hidden');
    closeActionsMenu();
    hideSlashMenu();
    hideBottomPicker();
    if (willOpen) {
      els.attachMenu.classList.remove('hidden');
      els.btnPlus?.classList.add('open');
    } else {
      closeAttachMenu();
    }
  }

  function buildActionsCatalog() {
    const s = activeSession();
    const model =
      s?.model || state.settings?.defaultModel || state.settings?.models?.find((m) => m.selected)?.value || '—';
    const perm = state.settings?.permissionLabel || state.settings?.permissionMode || 'Ask';
    const modeLabel = s?.mode === 'plan' ? 'Plan' : 'Execute';
    /** @type {Array<{ id: string, section: string, title: string, desc: string, meta?: string, icon: string, run: () => void }>} */
    const items = [
      {
        id: 'slash',
        section: 'Session',
        title: 'Slash-Befehle…',
        desc: 'Lokale und Agent-Commands (/help, /plan, …)',
        icon: '/',
        run: () => openSlashMenuForced(),
      },
      {
        id: 'new',
        section: 'Session',
        title: 'Neuer Chat',
        desc: 'Neue Session in diesem Projekt',
        icon: '+',
        run: () => post('newSession', {}),
      },
      {
        id: 'history',
        section: 'Session',
        title: 'Chat-History…',
        desc: 'Frühere Chats in diesem Projekt',
        icon: '↺',
        run: () => post('resumeSession', {}),
      },
      {
        id: 'model',
        section: 'Modell & Modus',
        title: 'Modell wählen…',
        desc: 'Grok-Modell für diese Session',
        meta: String(model).replace(/^grok-/, ''),
        icon: '◇',
        run: () => openBottomPicker('model'),
      },
      {
        id: 'perm',
        section: 'Modell & Modus',
        title: 'Permission-Modus…',
        desc: 'Ask / Once / Session / Always',
        meta: String(perm),
        icon: '🛡',
        run: () => openBottomPicker('permission'),
      },
      {
        id: 'mode',
        section: 'Modell & Modus',
        title: 'Plan / Execute umschalten',
        desc: 'Aktueller Modus',
        meta: modeLabel,
        icon: '⚙',
        run: () => {
          if (s?.localId) {
            post('toggleMode', { localId: s.localId });
          }
        },
      },
      {
        id: 'context',
        section: 'Kontext',
        title: 'Kontext hinzufügen…',
        desc: 'Datei, Symbol, Git, Ordner',
        icon: '@',
        run: () => openBottomPicker('context'),
      },
      {
        id: 'active',
        section: 'Kontext',
        title: 'Aktive Datei / Auswahl',
        desc: 'Aktueller Editor als Kontext',
        icon: '📄',
        run: () => post('openContextKind', { kind: 'active' }),
      },
      {
        id: 'setup',
        section: 'System',
        title: 'CLI Setup…',
        desc: 'Grok CLI finden / installieren',
        icon: '⌘',
        run: () => post('setupCli', {}),
      },
      {
        id: 'check',
        section: 'System',
        title: 'CLI-Status prüfen',
        desc: 'Version und Erreichbarkeit',
        icon: '✓',
        run: () => post('checkCli', {}),
      },
      {
        id: 'update',
        section: 'System',
        title: 'CLI aktualisieren…',
        desc: state.cli?.updateAvailable
          ? state.cli.updateMessage || 'Update verfügbar'
          : 'grok update (check + install)',
        meta: state.cli?.updateLatest || state.cli?.version || undefined,
        icon: '↓',
        run: () => post('updateCli', {}),
      },
    ];
    return items;
  }

  function openActionsMenu() {
    if (!els.actionsMenu || !els.actionsList) {
      return;
    }
    closeAttachMenu();
    hideSlashMenu();
    hideAtMenu();
    hideBottomPicker();
    actionsOpen = true;
    els.actionsMenu.classList.remove('hidden');
    els.btnSlash?.classList.add('open');
    if (els.actionsFilter) {
      els.actionsFilter.value = '';
    }
    filterActionsMenu('');
    setTimeout(() => els.actionsFilter?.focus(), 0);
  }

  function filterActionsMenu(query) {
    const q = String(query || '')
      .trim()
      .toLowerCase();
    const all = buildActionsCatalog();
    actionsFiltered = q
      ? all.filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            a.desc.toLowerCase().includes(q) ||
            a.section.toLowerCase().includes(q) ||
            (a.meta && a.meta.toLowerCase().includes(q))
        )
      : all;
    actionsIndex = 0;
    renderActionsMenu();
  }

  function renderActionsMenu() {
    if (!els.actionsList) {
      return;
    }
    els.actionsList.innerHTML = '';
    if (actionsFiltered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'actions-empty';
      empty.textContent = 'Keine Aktionen gefunden';
      els.actionsList.appendChild(empty);
      return;
    }

    let lastSection = '';
    actionsFiltered.forEach((item, i) => {
      if (item.section !== lastSection) {
        lastSection = item.section;
        const sec = document.createElement('div');
        sec.className = 'menu-section-label';
        sec.textContent = item.section;
        els.actionsList.appendChild(sec);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'actions-item' + (i === actionsIndex ? ' active' : '');
      btn.innerHTML = `
        <span class="actions-icon">${escapeHtml(item.icon)}</span>
        <span class="actions-label">
          <span class="actions-title">${escapeHtml(item.title)}</span>
          <span class="actions-desc">${escapeHtml(item.desc)}</span>
        </span>
        ${item.meta ? `<span class="actions-meta">${escapeHtml(item.meta)}</span>` : ''}
      `;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyActionsItem(item);
      });
      // click as fallback (some hosts prefer click)
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyActionsItem(item);
      });
      els.actionsList.appendChild(btn);
    });

    const activeEl = els.actionsList.querySelector('.actions-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  let actionsApplyLock = false;
  function applyActionsItem(item) {
    // Guard double fire (mousedown + click)
    if (actionsApplyLock) {
      return;
    }
    actionsApplyLock = true;
    setTimeout(() => {
      actionsApplyLock = false;
    }, 300);
    // Close first; defer run so document mousedown from this click cannot
    // immediately dismiss the bottom picker / slash menu we are about to open.
    closeActionsMenu();
    const run = item && typeof item.run === 'function' ? item.run : null;
    if (!run) {
      return;
    }
    setTimeout(() => {
      try {
        run();
      } catch (err) {
        console.error('actions item failed', err);
      }
    }, 10);
  }

  function toggleActionsMenu() {
    if (actionsOpen) {
      closeActionsMenu();
    } else {
      openActionsMenu();
    }
  }

  if (els.btnPlus) {
    els.btnPlus.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAttachMenu();
    });
  }
  if (els.btnSlash) {
    els.btnSlash.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleActionsMenu();
    });
  }

  els.btnContext?.addEventListener('click', () => {
    closeAttachMenu();
    openBottomPicker('context');
  });
  els.btnActiveFile?.addEventListener('click', () => {
    closeAttachMenu();
    post('openContextKind', { kind: 'active' });
  });
  els.chipModel?.addEventListener('click', () => openBottomPicker('model'));
  els.chipPerm?.addEventListener('click', () => openBottomPicker('permission'));
  els.btnImage?.addEventListener('click', () => {
    closeAttachMenu();
    els.imageInput?.click();
  });
  els.btnSetupCli?.addEventListener('click', () => post('setupCli', {}));
  els.btnUpdateCli?.addEventListener('click', () => post('updateCli', {}));
  els.btnDismissUpdate?.addEventListener('click', () =>
    post('dismissCliUpdate', {})
  );
  els.btnOpenExtRelease?.addEventListener('click', () => {
    const cli = state.cli || {};
    const url = cli.extensionVsixUrl || cli.extensionReleaseUrl;
    if (url) {
      post('openExtRelease', { url });
    } else {
      post('openExtRelease', {
        url: 'https://github.com/bhuertgen/grok-build-vscode/releases',
      });
    }
  });
  els.btnDismissExtUpdate?.addEventListener('click', () =>
    post('dismissExtUpdate', {})
  );
  els.btnTrust?.addEventListener('click', () => post('manageWorkspaceTrust', {}));
  els.btnSeedHistory?.addEventListener('click', () => {
    const s = activeSession();
    post('seedHistory', { localId: s?.localId });
  });
  els.btnDismissMemory?.addEventListener('click', () => {
    const s = activeSession();
    post('dismissContextNotice', { localId: s?.localId });
  });

  els.actionsFilter?.addEventListener('input', () => {
    filterActionsMenu(els.actionsFilter.value);
  });
  els.actionsFilter?.addEventListener('keydown', (e) => {
    if (!actionsOpen) {
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      actionsIndex = Math.min(
        actionsIndex + 1,
        Math.max(0, actionsFiltered.length - 1)
      );
      renderActionsMenu();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      actionsIndex = Math.max(actionsIndex - 1, 0);
      renderActionsMenu();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (actionsFiltered[actionsIndex]) {
        applyActionsItem(actionsFiltered[actionsIndex]);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeActionsMenu();
      els.input?.focus();
    }
  });

  function sendPermission(decision) {
    if (!activePermission) {
      return;
    }
    post('permissionResponse', {
      id: activePermission.id,
      decision,
      options: activePermission.options || [],
    });
    activePermission = null;
    renderPermissionCard();
  }
  els.permAllow?.addEventListener('click', () => sendPermission('allow'));
  els.permAllowAlways?.addEventListener('click', () => sendPermission('allow_always'));
  els.permReject?.addEventListener('click', () => sendPermission('reject'));

  document.addEventListener('mousedown', (e) => {
    if (
      els.attachMenu &&
      !els.attachMenu.classList.contains('hidden') &&
      !els.attachMenu.contains(e.target) &&
      e.target !== els.btnPlus
    ) {
      closeAttachMenu();
    }
    if (
      actionsOpen &&
      els.actionsMenu &&
      !els.actionsMenu.contains(e.target) &&
      e.target !== els.btnSlash
    ) {
      closeActionsMenu();
    }
    if (
      bottomPickerOpen &&
      els.bottomPicker &&
      !els.bottomPicker.contains(e.target) &&
      e.target !== els.chipModel &&
      e.target !== els.chipPerm &&
      e.target !== els.btnModel &&
      e.target !== els.btnPerm &&
      e.target !== els.btnContext
    ) {
      hideBottomPicker();
    }
  });

  els.imageInput.addEventListener('change', async () => {
    const files = Array.from(els.imageInput.files || []);
    for (const file of files) {
      const data = await readFileAsBase64(file);
      pendingImages.push({ mimeType: file.type || 'image/png', data });
    }
    els.imageInput.value = '';
    renderChips();
  });

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  els.input.addEventListener('keydown', (e) => {
    if (bottomPickerOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        bottomPickerIndex = Math.min(
          bottomPickerIndex + 1,
          Math.max(0, bottomPickerItems.length - 1)
        );
        renderBottomPicker();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        bottomPickerIndex = Math.max(bottomPickerIndex - 1, 0);
        renderBottomPicker();
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        if (bottomPickerItems[bottomPickerIndex]) {
          e.preventDefault();
          applyBottomPicker(bottomPickerItems[bottomPickerIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideBottomPicker();
        return;
      }
    }

    if (atOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        atIndex = Math.min(atIndex + 1, Math.max(0, atFiles.length - 1));
        renderAtMenu(false);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        atIndex = Math.max(atIndex - 1, 0);
        renderAtMenu(false);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        if (atFiles[atIndex]) {
          e.preventDefault();
          applyAtFile(atFiles[atIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideAtMenu();
        return;
      }
    }

    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slashIndex = Math.min(slashIndex + 1, Math.max(0, slashFiltered.length - 1));
        renderSlashMenu();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        slashIndex = Math.max(slashIndex - 1, 0);
        renderSlashMenu();
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        if (slashFiltered[slashIndex]) {
          e.preventDefault();
          applySlashCommand(slashFiltered[slashIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideSlashMenu();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  els.input.addEventListener('input', () => {
    autoResize();
    // Prefer @-mention over slash when both could match
    if (parseAtMention()) {
      hideSlashMenu();
      updateAtMenu();
    } else {
      hideAtMenu();
      updateSlashMenu();
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (
      (slashOpen || atOpen) &&
      els.slashMenu &&
      !els.slashMenu.contains(e.target) &&
      e.target !== els.input &&
      e.target !== els.btnSlash &&
      e.target !== els.btnPlus
    ) {
      hideSlashMenu();
      hideAtMenu();
    }
  });

  // When typing "/" alone at start, keep slash command menu (not full actions palette)
  // The / button opens the Claude-style actions palette separately.

  // Paste: text is native; also accept images from clipboard
  els.input.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) {
      return;
    }
    const imageFiles = [];
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }
    if (imageFiles.length === 0) {
      return; // let default text paste run
    }
    e.preventDefault();
    // Keep any plain text that was also on the clipboard
    const text = e.clipboardData.getData('text/plain');
    if (text) {
      const start = els.input.selectionStart ?? els.input.value.length;
      const end = els.input.selectionEnd ?? start;
      const v = els.input.value;
      els.input.value = v.slice(0, start) + text + v.slice(end);
      const pos = start + text.length;
      els.input.setSelectionRange(pos, pos);
      autoResize();
    }
    for (const file of imageFiles) {
      const data = await readFileAsBase64(file);
      pendingImages.push({ mimeType: file.type || 'image/png', data });
    }
    renderChips();
  });

  // Open external links in browser
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && a.href.startsWith('http')) {
      e.preventDefault();
      post('openExternal', { url: a.href });
    }
  });

  // ─── Inbound from extension ───────────────────────────────────────────────

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || !msg.type) {
      return;
    }
    switch (msg.type) {
      case 'state': {
        const prevActive = state.activeId;
        state.sessions = msg.sessions || [];
        state.activeId = msg.activeId;
        state.pendingEdits = msg.pendingEdits || [];
        state.cli = msg.cli || { ready: true, checking: false };
        state.processCount = msg.processCount || 0;
        state.settings = msg.settings || state.settings;
        state.workspaceTrusted = msg.workspaceTrusted !== false;
        state.trustMessage = msg.trustMessage || null;
        state.history = msg.history || [];
        if (prevActive !== state.activeId) {
          toolsExpanded = false;
          expandedTools.clear();
          expandedThoughts.clear();
        }
        render();
        if (slashOpen) {
          updateSlashMenu();
        }
        if (atOpen) {
          updateAtMenu();
        }
        if (bottomPickerOpen) {
          // Refresh selection marks after model/perm change
          openBottomPicker(bottomPickerKind);
        }
        break;
      }
      case 'workspaceFiles': {
        // Ignore stale responses
        atFiles = Array.isArray(msg.files) ? msg.files : [];
        if (atOpen) {
          if (typeof msg.query === 'string' && msg.query !== atQuery) {
            // still apply if user typed more; keep latest list
          }
          atIndex = 0;
          renderAtMenu(false);
        }
        break;
      }
      case 'contextAdded': {
        // Chip appears via next state push; ensure focus stays in input
        els.input?.focus();
        break;
      }
      case 'openPicker':
        if (msg.picker === 'model') {
          openBottomPicker('model');
        } else if (msg.picker === 'permission') {
          openBottomPicker('permission');
        } else if (msg.picker === 'context') {
          openBottomPicker('context');
        }
        break;
      case 'permissionRequest':
        activePermission = {
          id: msg.id,
          toolCall: msg.toolCall,
          options: msg.options || [],
        };
        renderPermissionCard();
        break;
      case 'focusInput':
        els.input.focus();
        break;
      case 'insertText':
        els.input.value =
          (els.input.value ? els.input.value + '\n' : '') + (msg.text || '');
        autoResize();
        els.input.focus();
        break;
      default:
        break;
    }
  });

  // Ready
  post('ready', {});
})();
