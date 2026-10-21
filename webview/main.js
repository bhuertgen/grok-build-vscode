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
    configChips: document.getElementById('configChips'),
    btnSelectionRange: document.getElementById('btnSelectionRange'),
    contextChips: document.getElementById('contextChips'),
    planPanel: document.getElementById('planPanel'),
    planList: document.getElementById('planList'),
    agentsPanel: document.getElementById('agentsPanel'),
    agentsList: document.getElementById('agentsList'),
    permCard: document.getElementById('permCard'),
    elicitCard: document.getElementById('elicitCard'),
    elicitCardTitle: document.getElementById('elicitCardTitle'),
    elicitCardMessage: document.getElementById('elicitCardMessage'),
    elicitCardBody: document.getElementById('elicitCardBody'),
    elicitError: document.getElementById('elicitError'),
    elicitAccept: document.getElementById('elicitAccept'),
    elicitDecline: document.getElementById('elicitDecline'),
    elicitCancel: document.getElementById('elicitCancel'),
    elicitCancelX: document.getElementById('elicitCancelX'),
    permCardTitle: document.getElementById('permCardTitle'),
    permCardDetail: document.getElementById('permCardDetail'),
    permAllow: document.getElementById('permAllow'),
    permAllowAlways: document.getElementById('permAllowAlways'),
    permReject: document.getElementById('permReject'),
    pendingEdits: document.getElementById('pendingEdits'),
    cliBanner: document.getElementById('cliBanner'),
    cliBannerTitle: document.getElementById('cliBannerTitle'),
    cliBannerDetail: document.getElementById('cliBannerDetail'),
    btnDismissCompat: document.getElementById('btnDismissCompat'),
    btnSetupCli: document.getElementById('btnSetupCli'),
    btnOpenCliSetting: document.getElementById('btnOpenCliSetting'),
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
  let activeElicitation = null;

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
  let bottomPickerKind = /** @type {null | 'model' | 'permission' | 'context' | 'config'} */ (null);
  /** config option id while the config picker is open */
  let configPickerId = '';
  let bottomPickerIndex = 0;
  /** @type {Array<{ value: string, label: string, description?: string, selected?: boolean }>} */
  let bottomPickerItems = [];

  /**
   * Chat scroll controller (sticky bottom with hysteresis).
   * Full DOM rebuilds thrash layout; without a sticky flag + rAF the view
   * jitters or fails to follow streaming text.
   */
  let stickToBottom = true;
  let scrollRaf = 0;
  /** True while renderMessages wipes/rebuilds DOM — ignore scroll events */
  let rebuildGuard = false;
  /**
   * Structural signature of the last render. When only streaming text grows,
   * signature stays equal → incremental body patch (no full wipe).
   * Tradeoff: markdown is still re-parsed for the streaming bubble; we avoid
   * destroying the rest of the transcript DOM (height drift / flicker).
   * Structural changes (new msg/tool, streaming flag flip, expand, session)
   * still full-rebuild with rebuildGuard + forcePin safety.
   */
  let lastMessagesSig = '';
  /** Distance from bottom (px) to consider "pinned" / "unpinned" */
  const STICK_PIN_PX = 40;
  const STICK_UNPIN_PX = 140;

  function distanceFromBottom() {
    const el = els.messages;
    if (!el) {
      return 0;
    }
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }

  function updateStickFromUserScroll() {
    const dist = distanceFromBottom();
    // Hysteresis: easy to re-pin, harder to unpin mid-stream
    if (dist <= STICK_PIN_PX) {
      stickToBottom = true;
    } else if (dist > STICK_UNPIN_PX) {
      stickToBottom = false;
    }
  }

  function pinToBottom() {
    stickToBottom = true;
  }

  /**
   * Explicit user scroll intent (wheel/keys/touch/scrollbar drag).
   * Streaming renders keep a double-rAF (scrollRaf) pending nearly all the
   * time, so the scroll listener used to drop every user scroll event while
   * streaming and the next render re-pinned (Issue #3 yank). Intent events are
   * never programmatic, so they can unpin immediately.
   */
  let userScrollIntentUntil = 0;
  const USER_INTENT_MS = 400;
  function noteUserScrollIntent() {
    userScrollIntentUntil = Date.now() + USER_INTENT_MS;
  }
  function userScrollIntentActive() {
    return Date.now() < userScrollIntentUntil;
  }
  function unpinFromUser() {
    stickToBottom = false;
    if (scrollRaf) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
    }
  }

  /**
   * Apply scroll after layout. Double rAF waits for browser reflow after
   * DOM updates so we don't set scrollTop against stale heights.
   */
  function scheduleScrollAfterRender(ctx) {
    if (scrollRaf) {
      cancelAnimationFrame(scrollRaf);
    }
    const apply = () => {
      scrollRaf = 0;
      const el = els.messages;
      if (!el) {
        return;
      }
      // Honor only the pre-wipe snapshot (ctx.forcePin). Do not re-read
      // stickToBottom here — wipe scroll events can falsely re-pin.
      // User may have scrolled up between render and this frame.
      if (ctx.forcePin && stickToBottom) {
        el.scrollTop = el.scrollHeight;
        stickToBottom = true;
        return;
      }
      // Keep reading position when user scrolled up (content usually grows at bottom)
      el.scrollTop = Math.max(0, ctx.prevScroll);
    };
    // First frame: DOM committed; second: layout metrics final
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = requestAnimationFrame(apply);
    });
  }

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
    renderElicitationCard();
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
        els.memoryBannerTitle.textContent = 'Session resumed';
      }
      if (els.memoryBannerDetail) {
        els.memoryBannerDetail.textContent =
          'CLI resume OK — the agent has the previous conversation.';
      }
      els.btnSeedHistory?.classList.add('hidden');
      return;
    }

    if (ctx === 'seeded') {
      els.memoryBanner.classList.remove('hidden');
      els.memoryBanner.classList.add('ok');
      if (els.memoryBannerTitle) {
        els.memoryBannerTitle.textContent = 'History in context';
      }
      if (els.memoryBannerDetail) {
        els.memoryBannerDetail.textContent =
          'Local chat was loaded into agent context (with the last/next message).';
      }
      els.btnSeedHistory?.classList.add('hidden');
      return;
    }

    if (ctx === 'local-only' || seedPending) {
      els.memoryBanner.classList.remove('hidden');
      els.memoryBanner.classList.add('warn');
      if (els.memoryBannerTitle) {
        els.memoryBannerTitle.textContent = seedPending
          ? 'Loading context'
          : 'UI history only';
      }
      if (els.memoryBannerDetail) {
        els.memoryBannerDetail.textContent = seedPending
          ? 'With the next message, the agent receives prior chat as background.'
          : 'History is visible, but the agent starts cold. Optionally load it into context.';
      }
      if (els.btnSeedHistory) {
        els.btnSeedHistory.classList.toggle('hidden', seedPending);
        els.btnSeedHistory.textContent = 'Load history into context';
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
      els.permCardTitle.textContent =
        activePermission.displayTitle || t.title || t.kind || 'Tool permission';
    }
    if (els.permCardDetail) {
      els.permCardDetail.textContent = '';
      // CLI 1.0.54+: binary/unreadable target — explicit hint, no diff/preview
      if (activePermission.unreadable) {
        const badge = document.createElement('span');
        badge.className = 'perm-unreadable';
        badge.textContent = activePermission.unreadableLabel || 'unreadable – no preview';
        els.permCardDetail.append(badge, document.createTextNode(' '));
      }
      const res = activePermission.resolved;
      els.permCardDetail.append(
        document.createTextNode(
          res
            ? `${t.kind || 'tool'} · ${res.label || res.decision}`
            : `${t.kind || 'tool'} · ${t.status || 'pending'} — Allow so Grok can continue.`
        )
      );
    }
    els.permCard.classList.toggle('resolved', !!activePermission.resolved);
    if (activePermission.resolved) {
      els.permCard.dataset.decision = activePermission.resolved.decision || '';
    } else {
      delete els.permCard.dataset.decision;
    }
  }


  function renderElicitationCard() {
    if (!els.elicitCard) {
      return;
    }
    if (!activeElicitation) {
      els.elicitCard.classList.add('hidden');
      if (els.elicitCardBody) {
        els.elicitCardBody.innerHTML = '';
      }
      if (els.elicitError) {
        els.elicitError.classList.add('hidden');
        els.elicitError.textContent = '';
      }
      return;
    }
    els.elicitCard.classList.remove('hidden');
    const e = activeElicitation;
    if (els.elicitCardTitle) {
      els.elicitCardTitle.textContent =
        e.mode === 'url' ? 'Open URL (consent)' : 'Agent needs input';
    }
    if (els.elicitCardMessage) {
      els.elicitCardMessage.textContent = e.message || '';
    }
    if (!els.elicitCardBody) {
      return;
    }
    // Rebuild body only when id changes
    if (els.elicitCardBody.dataset.elicitId !== e.id) {
      els.elicitCardBody.dataset.elicitId = e.id;
      els.elicitCardBody.innerHTML = '';
      if (e.mode === 'url') {
        const host = document.createElement('div');
        host.className = 'elicit-url-host';
        host.textContent = e.urlHost || '';
        els.elicitCardBody.appendChild(host);
        const box = document.createElement('div');
        box.className = 'elicit-url-box';
        box.textContent = e.url || '';
        els.elicitCardBody.appendChild(box);
        const note = document.createElement('div');
        note.className = 'hint';
        note.textContent =
          'Accept opens this URL in your browser. Decline or Cancel keeps chat usable.';
        els.elicitCardBody.appendChild(note);
        if (e.suspiciousUrl) {
          const w = document.createElement('div');
          w.className = 'elicit-warn';
          w.textContent = 'Warning: unusual URL (non-https or punycode host). Review carefully.';
          els.elicitCardBody.appendChild(w);
        }
        if (els.elicitAccept) {
          els.elicitAccept.textContent = 'Open URL';
        }
      } else {
        if (els.elicitAccept) {
          els.elicitAccept.textContent = 'Submit';
        }
        buildElicitForm(els.elicitCardBody, e.requestedSchema, e.defaults || {});
        // Focus first field without trapping forever
        const first = els.elicitCardBody.querySelector('input, select, textarea');
        if (first) {
          setTimeout(() => first.focus(), 30);
        }
      }
    }
  }

  function buildElicitForm(container, schema, defaults) {
    const props = (schema && schema.properties) || {};
    const required = new Set((schema && schema.required) || []);
    for (const [key, prop] of Object.entries(props)) {
      const field = document.createElement('div');
      field.className = 'elicit-field';
      const label = document.createElement('label');
      label.htmlFor = `elicit-field-${key}`;
      label.textContent = (prop && prop.title) || key;
      if (required.has(key)) {
        label.textContent += ' *';
      }
      if (prop && prop.description) {
        const hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = ' — ' + prop.description;
        label.appendChild(hint);
      }
      field.appendChild(label);

      const type = (prop && prop.type) || 'string';
      const def = defaults[key];
      let input;
      if (type === 'boolean') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = def === true;
      } else if (type === 'integer' || type === 'number') {
        input = document.createElement('input');
        input.type = 'number';
        input.step = type === 'integer' ? '1' : 'any';
        if (prop && prop.minimum != null) input.min = String(prop.minimum);
        if (prop && prop.maximum != null) input.max = String(prop.maximum);
        if (def != null) input.value = String(def);
      } else if (type === 'array' && elicitArrayOptions(prop)) {
        // CLI >= 1.0.51 multi-select questions: checkbox group
        input = document.createElement('div');
        input.className = 'elicit-multi';
        input.setAttribute('role', 'group');
        const selected = Array.isArray(def) ? def : [];
        for (const o of elicitArrayOptions(prop)) {
          const row = document.createElement('label');
          row.className = 'elicit-multi-option';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = o.value;
          cb.checked = selected.includes(o.value);
          row.appendChild(cb);
          row.appendChild(document.createTextNode(' ' + o.title));
          input.appendChild(row);
        }
      } else if (!['string', 'boolean', 'integer', 'number', 'array'].includes(type)) {
        // Unknown field type: show a safe note, send nothing for it
        const note = document.createElement('div');
        note.className = 'hint';
        note.textContent = `Unsupported field type "${String(type)}" — skipped.`;
        field.appendChild(note);
        container.appendChild(field);
        continue;
      } else if (type === 'array') {
        // free-form array as comma-separated for simplicity + a11y
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'comma-separated values';
        if (Array.isArray(def)) input.value = def.join(', ');
      } else if (prop && (prop.enum || prop.oneOf)) {
        input = document.createElement('select');
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '— choose —';
        input.appendChild(empty);
        const opts = prop.enum
          ? prop.enum.map((v) => ({ value: v, title: v }))
          : (prop.oneOf || []).map((o) => ({
              value: o.const,
              title: o.title || o.const,
            }));
        for (const o of opts) {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.title;
          if (def === o.value) opt.selected = true;
          input.appendChild(opt);
        }
      } else {
        input = document.createElement('input');
        const fmt = prop && prop.format;
        input.type =
          fmt === 'email' ? 'email' : fmt === 'uri' ? 'url' : fmt === 'date' ? 'date' : 'text';
        if (def != null) input.value = String(def);
      }
      input.id = `elicit-field-${key}`;
      input.dataset.elicitKey = key;
      input.dataset.elicitType = type;
      field.appendChild(input);
      container.appendChild(field);
    }
  }

  function elicitArrayOptions(prop) {
    const items = prop && prop.items;
    if (!items || typeof items !== 'object') return null;
    if (Array.isArray(items.enum)) {
      const names = Array.isArray(items.enumNames) ? items.enumNames : [];
      return items.enum
        .filter((v) => typeof v === 'string')
        .map((v, i) => ({ value: v, title: typeof names[i] === 'string' ? names[i] : v }));
    }
    const list = Array.isArray(items.anyOf) ? items.anyOf : items.oneOf;
    if (Array.isArray(list)) {
      return list
        .filter((o) => o && typeof o.const === 'string')
        .map((o) => ({ value: o.const, title: typeof o.title === 'string' ? o.title : o.const }));
    }
    return null;
  }

  function collectElicitFormValues() {
    const out = {};
    if (!els.elicitCardBody) {
      return out;
    }
    for (const el of els.elicitCardBody.querySelectorAll('[data-elicit-key]')) {
      const key = el.dataset.elicitKey;
      const type = el.dataset.elicitType || 'string';
      if (el.classList && el.classList.contains('elicit-multi')) {
        out[key] = Array.from(el.querySelectorAll('input[type=checkbox]'))
          .filter((cb) => cb.checked)
          .map((cb) => cb.value);
      } else if (el.type === 'checkbox') {
        out[key] = !!el.checked;
      } else if (type === 'integer') {
        out[key] = el.value === '' ? '' : parseInt(el.value, 10);
      } else if (type === 'number') {
        out[key] = el.value === '' ? '' : Number(el.value);
      } else if (type === 'array') {
        out[key] = String(el.value || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        out[key] = el.value;
      }
    }
    return out;
  }

  function sendElicitation(decision) {
    if (!activeElicitation) {
      return;
    }
    const e = activeElicitation;
    const content = e.mode === 'form' ? collectElicitFormValues() : undefined;
    post('elicitationResponse', {
      id: e.id,
      decision,
      mode: e.mode,
      content,
      requestedSchema: e.requestedSchema,
    });
    // Optimistic clear — host may keep open on validation error via new request
    if (decision !== 'accept' || e.mode === 'url') {
      activeElicitation = null;
      renderElicitationCard();
    } else {
      // form accept: clear; invalid forms are re-shown only if agent re-requests
      activeElicitation = null;
      renderElicitationCard();
    }
  }

  function renderCliBanner() {
    const cli = state.cli || {};
    if (!els.cliBanner) {
      return;
    }
    els.cliBanner.classList.remove('too-old', 'soft-warn', 'unknown');
    const setTitle = (t) => {
      if (els.cliBannerTitle) {
        els.cliBannerTitle.textContent = t;
      }
    };
    if (cli.checking) {
      els.cliBanner.classList.remove('hidden');
      setTitle('Grok CLI');
      if (els.cliBannerDetail) {
        els.cliBannerDetail.textContent = 'Checking for Grok CLI…';
      }
      els.btnSetupCli?.classList.add('hidden');
      els.btnDismissCompat?.classList.add('hidden');
      els.btnOpenCliSetting?.classList.add('hidden');
      return;
    }
    els.btnOpenCliSetting?.classList.add('hidden');

    // Explicit grokBuild.cliPath is wrong (#41): clear error + "Open Setting"
    if (cli.invalidCliPath && !cli.ready) {
      els.cliBanner.classList.remove('hidden');
      els.cliBanner.classList.add('too-old');
      setTitle('Invalid grokBuild.cliPath');
      els.btnOpenCliSetting?.classList.remove('hidden');
      els.btnSetupCli?.classList.add('hidden');
      els.btnDismissCompat?.classList.add('hidden');
      if (els.cliBannerDetail) {
        els.cliBannerDetail.textContent = cli.error || 'grokBuild.cliPath does not point to the grok binary.';
      }
      return;
    }

    const level = cli.compatLevel || (!cli.ready ? 'missing' : null);
    const show = !!cli.showCompatBanner || level === 'missing' || level === 'too_old';
    if (!show || !level || level === 'ok') {
      els.cliBanner.classList.add('hidden');
      return;
    }

    els.cliBanner.classList.remove('hidden');
    if (level === 'too_old') {
      els.cliBanner.classList.add('too-old');
      setTitle('Grok CLI too old');
      els.btnSetupCli?.classList.remove('hidden');
      els.btnDismissCompat?.classList.add('hidden');
    } else if (level === 'missing') {
      setTitle('Grok CLI required');
      els.btnSetupCli?.classList.remove('hidden');
      els.btnDismissCompat?.classList.add('hidden');
    } else if (level === 'soft_warn') {
      els.cliBanner.classList.add('soft-warn');
      setTitle('Grok CLI update recommended');
      els.btnSetupCli?.classList.remove('hidden');
      els.btnDismissCompat?.classList.remove('hidden');
    } else if (level === 'unknown') {
      els.cliBanner.classList.add('unknown');
      setTitle('Grok CLI version unknown');
      els.btnSetupCli?.classList.add('hidden');
      els.btnDismissCompat?.classList.remove('hidden');
    } else {
      els.cliBanner.classList.add('hidden');
      return;
    }

    if (els.cliBannerDetail) {
      els.cliBannerDetail.textContent =
        cli.compatMessage ||
        cli.error ||
        'Install the official CLI, then click Setup. Hybrid mode: grok agent stdio.';
    }
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
    const n = state.sessions.length;
    // Shorter labels when crowded so tabs stay distinguishable beside chips (row 2).
    const maxLen = n > 5 ? 10 : n > 3 ? 14 : 18;
    for (const s of state.sessions) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tab' + (s.localId === state.activeId ? ' active' : '');
      tab.title = s.title || 'Chat';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', s.localId === state.activeId ? 'true' : 'false');

      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = truncate(s.title || 'Chat', maxLen);
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
      els.statusText.textContent = cli.invalidCliPath ? 'Invalid cliPath' : 'CLI missing';
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
    renderConfigChips(s);

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
      case 'idle':
        return 'Idle — send a message to start the agent';
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
      ${t.unreadable ? '<span class="perm-unreadable" title="Binary/unreadable file — no diff/preview">unreadable</span>' : ''}
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
    wrap.dataset.msgId = m.id;

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


  /** Mirror renderMessages skip rules so structure sig matches DOM children. */
  function shouldSkipMsg(m) {
    if (!m) {
      return true;
    }
    if (m.role === 'thought') {
      return false;
    }
    const cleaned = sanitizeMessageContent(m.content || '');
    if (
      (m.role === 'agent' || m.role === 'system') &&
      !cleaned.trim() &&
      !m.streaming &&
      !(m.images && m.images.length)
    ) {
      return true;
    }
    const html = formatMarkdown(
      m.role === 'user' ? m.content || '' : cleaned
    );
    if (!html.trim() && !(m.images && m.images.length) && !m.streaming) {
      return true;
    }
    return false;
  }

  /** Stable structure key (ids/roles/flags) — excludes message text content. */
  function timelineStructureSig(sessionId, timeline) {
    const parts = [String(sessionId || '')];
    for (const item of timeline) {
      if (item.type === 'tool-group') {
        const ids = (item.tools || []).map((t) => t.id).join(',');
        parts.push('tg:' + ids + ':' + (toolsExpanded ? '1' : '0'));
      } else if (item.type === 'tool' && item.t) {
        parts.push(
          't:' +
            item.t.id +
            ':' +
            (item.t.status || '') +
            ':' +
            (expandedTools.has(item.t.id) ? '1' : '0')
        );
      } else if (item.m) {
        const m = item.m;
        parts.push(
          'm:' +
            m.id +
            ':' +
            m.role +
            ':' +
            (m.streaming ? '1' : '0') +
            ':' +
            (m.role === 'thought' && expandedThoughts.has(m.id) ? '1' : '0')
        );
      }
    }
    return parts.join('|');
  }

  /** True when DOM children align 1:1 with timeline structure (safe to patch). */
  function canIncrementalPatch(timeline) {
    const root = els.messages;
    if (!root || root.querySelector('.empty-state')) {
      return false;
    }
    const children = root.children;
    if (children.length !== timeline.length) {
      return false;
    }
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      const el = children[i];
      if (item.type === 'tool-group') {
        if (!el.classList.contains('tool-group')) {
          return false;
        }
      } else if (item.type === 'tool' && item.t) {
        if (el.dataset.toolId !== item.t.id) {
          return false;
        }
      } else if (item.m?.role === 'thought') {
        if (!el.classList.contains('thought-row') || el.dataset.msgId !== item.m.id) {
          return false;
        }
      } else if (item.m) {
        if (el.dataset.msgId !== item.m.id) {
          return false;
        }
      } else {
        return false;
      }
    }
    return true;
  }

  /** Update streaming bubbles in place — no transcript wipe. */
  function patchStreamingContent(timeline) {
    const children = els.messages.children;
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      const m = item.m;
      if (!m || !m.streaming) {
        continue;
      }
      const el = children[i];
      if (!el) {
        continue;
      }
      if (m.role === 'agent' || m.role === 'system' || m.role === 'user') {
        const body = el.querySelector('.body');
        if (!body) {
          continue;
        }
        const cleaned =
          m.role === 'user'
            ? m.content || ''
            : sanitizeMessageContent(m.content || '');
        body.innerHTML = formatMarkdown(cleaned);
        body.classList.add('streaming-cursor');
      } else if (m.role === 'thought') {
        const body = el.querySelector('.thought-row-body');
        if (body) {
          body.textContent = m.content || '';
        }
      }
    }
  }

  function renderMessages() {
    const s = activeSession();
    const prevScroll = els.messages ? els.messages.scrollTop : 0;
    // Snapshot stickiness before any DOM change (wipe can reset scrollTop →
    // false unpin OR fire a scroll event that falsely re-pins).
    let forcePin = stickToBottom;
    if (els.messages && !forcePin) {
      updateStickFromUserScroll();
      forcePin = stickToBottom;
    }

    if (!s || (s.messages.length === 0 && !(s.toolCalls || []).length)) {
      lastMessagesSig = '';
      rebuildGuard = true;
      els.messages.innerHTML = '';
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
      rebuildGuard = false;
      return;
    }

    const timeline = buildTimeline(s).filter((item) => {
      if (item.type === 'tool' || item.type === 'tool-group') {
        return true;
      }
      return !shouldSkipMsg(item.m);
    });
    const sig = timelineStructureSig(s.localId, timeline);

    // Hot path: streaming text delta with unchanged structure — patch bodies only.
    if (
      sig &&
      sig === lastMessagesSig &&
      canIncrementalPatch(timeline)
    ) {
      patchStreamingContent(timeline);
      if (forcePin && els.messages) {
        els.messages.scrollTop = els.messages.scrollHeight;
      } else if (els.messages) {
        els.messages.scrollTop = Math.max(0, prevScroll);
      }
      scheduleScrollAfterRender({
        forcePin,
        prevScroll,
      });
      return;
    }

    // Structural change → full wipe (guarded). Keep rebuildGuard/forcePin safety.
    rebuildGuard = true;
    els.messages.innerHTML = '';

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
          if (a.path && a.startLine != null) {
            chip.classList.add('chip-link');
            chip.addEventListener('click', () => {
              post('openContextRange', {
                path: a.path,
                startLine: a.startLine,
                endLine: a.endLine || a.startLine,
              });
            });
          }
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

    lastMessagesSig = sig;

    // Sync pin immediately so paint does not flash scrollTop=0 (yoyo/jitter)
    // before the double-rAF settle. Still schedule rAF for final layout height.
    if (forcePin && els.messages) {
      els.messages.scrollTop = els.messages.scrollHeight;
    } else if (els.messages) {
      els.messages.scrollTop = Math.max(0, prevScroll);
    }
    rebuildGuard = false;

    scheduleScrollAfterRender({
      forcePin,
      prevScroll,
    });
  }


  function renderConfigChips(session) {
    const host = els.configChips;
    if (!host) {
      return;
    }
    host.innerHTML = '';
    const controls = session?.configControls || [];
    for (const opt of controls) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const current =
        opt.kind === 'boolean'
          ? opt.currentValue
            ? 'on'
            : 'off'
          : opt.currentValue || '—';
      const shortName = effortName(opt);
      btn.className =
        'chip-btn' +
        (opt.kind === 'boolean' && opt.currentValue ? ' config-on' : '');
      btn.textContent = shortName + ': ' + truncate(String(current), 12);
      btn.title =
        (opt.description || opt.name || opt.id) +
        '\n' +
        (opt.kind === 'boolean'
          ? 'Click to toggle (this session)'
          : 'Click to change (this session)') +
        '\nSetting grokBuild.reasoningEffort still seeds new sessions.';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openConfigControl(opt);
      });
      host.appendChild(btn);
    }
  }

  function effortName(opt) {
    const id = String(opt.id || '');
    const name = String(opt.name || '');
    // category first (CLI 1.0.52: thought_level), id/name fallback
    if (
      opt.category === 'thought_level' ||
      opt.category === 'thought' ||
      /effort|reasoning/i.test(id) ||
      /effort|reasoning/i.test(name)
    ) {
      return 'Effort';
    }
    return truncate(name || id, 14);
  }

  function openConfigControl(opt) {
    const s = activeSession();
    if (!s) {
      return;
    }
    if (opt.kind === 'boolean') {
      post('setConfigOption', {
        localId: s.localId,
        configId: opt.id,
        value: !opt.currentValue,
      });
      return;
    }
    configPickerId = opt.id;
    openBottomPicker('config');
  }

  function renderChips() {
    const s = activeSession();
    els.contextChips.innerHTML = '';
    if (!s?.contextItems?.length && pendingImages.length === 0) {
      return;
    }
    for (const c of s?.contextItems || []) {
      const chip = document.createElement('div');
      const ranged = c.startLine != null && c.endLine != null && c.path;
      chip.className = 'chip' + (ranged ? ' chip-link' : '');
      const label = document.createElement('span');
      label.title = c.detail || c.path || '';
      label.textContent = c.label;
      if (ranged) {
        label.addEventListener('click', () => {
          post('openContextRange', {
            path: c.path,
            startLine: c.startLine,
            endLine: c.endLine,
          });
        });
      }
      chip.appendChild(label);
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
      let diff;
      if (e.oldUnreadable) {
        // Binary/unreadable previous content: no diff (CLI 1.0.54 "unreadable")
        diff = document.createElement('span');
        diff.className = 'perm-unreadable';
        diff.textContent = 'unreadable';
        diff.title = 'Previous content is binary/unreadable — no diff available';
      } else {
        diff = document.createElement('button');
        diff.type = 'button';
        diff.textContent = 'Diff';
        diff.addEventListener('click', () => post('showDiff', { editId: e.id }));
      }
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
    // Keep "+" clickable when the CLI is not ready: the extension-side gate
    // explains why (invalid cliPath → Open Setting, missing → Setup CLI) (#41).
    els.btnNew.disabled = false;
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
    title.textContent = atQuery ? `@${atQuery}` : '@ file in project';
    els.slashMenu.appendChild(title);

    if (loading && atFiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'slash-empty';
      empty.textContent = 'Searching files…';
      els.slashMenu.appendChild(empty);
      return;
    }

    if (atFiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'slash-empty';
      empty.textContent = atQuery
        ? 'No file found — add files to the workspace'
        : 'No files in workspace (empty folder?)';
      els.slashMenu.appendChild(empty);
      // Fallback row: open VS Code QuickPick / dialog
      const browse = document.createElement('button');
      browse.type = 'button';
      browse.className = 'slash-item';
      browse.innerHTML =
        '<span class="slash-name">Browse…</span><span class="slash-desc">VS Code file picker</span>';
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
    } else if (kind === 'config') {
      const s = activeSession();
      const opt = (s?.configControls || []).find((c) => c.id === configPickerId);
      if (!opt || opt.kind !== 'select') {
        hideBottomPicker();
        return;
      }
      bottomPickerItems = (opt.options || []).map((c) => ({
        value: c.value,
        label: c.name || c.value,
        description: c.description || '',
        selected: c.value === opt.currentValue,
      }));
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
          : bottomPickerKind === 'config'
            ? 'Session option'
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
      } else if (kind === 'config') {
        post('setConfigOption', {
          localId: s?.localId,
          configId: configPickerId,
          value: item.value,
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
    pinToBottom(); // new turn always follows the stream
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

  // User scroll intent for stick-to-bottom
  if (els.messages) {
    els.messages.addEventListener(
      'scroll',
      () => {
        if (rebuildGuard) {
          return;
        }
        if (userScrollIntentActive()) {
          // Real user scroll: no hysteresis for leaving the bottom.
          if (distanceFromBottom() > STICK_PIN_PX) {
            unpinFromUser();
          } else {
            stickToBottom = true;
          }
          return;
        }
        // Ignore programmatic pin scroll events while a scroll apply is pending
        if (scrollRaf) {
          return;
        }
        updateStickFromUserScroll();
      },
      { passive: true }
    );
    els.messages.addEventListener(
      'wheel',
      (e) => {
        noteUserScrollIntent();
        if (e.deltaY < 0) {
          unpinFromUser();
        }
      },
      { passive: true }
    );
    els.messages.addEventListener(
      'touchmove',
      () => noteUserScrollIntent(),
      { passive: true }
    );
    els.messages.addEventListener('pointerdown', () => noteUserScrollIntent(), {
      passive: true,
    });
    els.messages.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) {
        noteUserScrollIntent();
        unpinFromUser();
      } else if (['ArrowDown', 'PageDown', 'End', ' '].includes(e.key)) {
        noteUserScrollIntent();
      }
    });
  }

  els.btnSend.addEventListener('click', send);
  els.btnStop.addEventListener('click', () => {
    const s = activeSession();
    if (s) {
      post('cancel', { localId: s.localId });
    }
  });
  els.btnNew.addEventListener('click', () => {
    pinToBottom();
    post('newSession', {});
  });
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
        title: 'Slash commands…',
        desc: 'Local and agent commands (/help, /plan, …)',
        icon: '/',
        run: () => openSlashMenuForced(),
      },
      {
        id: 'new',
        section: 'Session',
        title: 'New chat',
        desc: 'New session in this project',
        icon: '+',
        run: () => post('newSession', {}),
      },
      {
        id: 'history',
        section: 'Session',
        title: 'Chat history…',
        desc: 'Earlier chats in this project',
        icon: '↺',
        run: () => post('resumeSession', {}),
      },
      {
        id: 'model',
        section: 'Model & mode',
        title: 'Select model…',
        desc: 'Grok model for this session',
        meta: String(model).replace(/^grok-/, ''),
        icon: '◇',
        run: () => openBottomPicker('model'),
      },
      {
        id: 'perm',
        section: 'Model & mode',
        title: 'Permission mode…',
        desc: 'Ask / Once / Session / Always',
        meta: String(perm),
        icon: '🛡',
        run: () => openBottomPicker('permission'),
      },
      {
        id: 'mode',
        section: 'Model & mode',
        title: 'Toggle Plan / Execute',
        desc: 'Current mode',
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
        section: 'Context',
        title: 'Add context…',
        desc: 'File, symbol, git, folder',
        icon: '@',
        run: () => openBottomPicker('context'),
      },
      {
        id: 'active',
        section: 'Context',
        title: 'Active file / selection',
        desc: 'Current editor as context',
        icon: '📄',
        run: () => post('openContextKind', { kind: 'active' }),
      },
      {
        id: 'setup',
        section: 'System',
        title: 'CLI setup…',
        desc: 'Find / install Grok CLI',
        icon: '⌘',
        run: () => post('setupCli', {}),
      },
      {
        id: 'check',
        section: 'System',
        title: 'Check CLI status',
        desc: 'Version and reachability',
        icon: '✓',
        run: () => post('checkCli', {}),
      },
      {
        id: 'update',
        section: 'System',
        title: 'Update CLI…',
        desc: state.cli?.updateAvailable
          ? state.cli.updateMessage || 'Update available'
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
      empty.textContent = 'No actions found';
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
  els.btnSelectionRange?.addEventListener('click', () => {
    closeAttachMenu();
    post('insertSelectionRange', {});
  });
  els.chipModel?.addEventListener('click', () => openBottomPicker('model'));
  els.chipPerm?.addEventListener('click', () => openBottomPicker('permission'));
  els.btnImage?.addEventListener('click', () => {
    closeAttachMenu();
    els.imageInput?.click();
  });
  els.btnSetupCli?.addEventListener('click', () => post('setupCli', {}));
  els.btnOpenCliSetting?.addEventListener('click', () => post('openCliPathSetting', {}));
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
  els.btnDismissCompat?.addEventListener('click', () => post('dismissCompat', {}));
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
    renderElicitationCard();
  }
  els.permAllow?.addEventListener('click', () => sendPermission('allow'));
  els.permAllowAlways?.addEventListener('click', () => sendPermission('allow_always'));
  els.permReject?.addEventListener('click', () => sendPermission('reject'));

  els.elicitAccept?.addEventListener('click', () => sendElicitation('accept'));
  els.elicitDecline?.addEventListener('click', () => sendElicitation('decline'));
  els.elicitCancel?.addEventListener('click', () => sendElicitation('cancel'));
  els.elicitCancelX?.addEventListener('click', () => sendElicitation('cancel'));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && activeElicitation) {
      ev.preventDefault();
      sendElicitation('cancel');
    }
  });

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
      !(els.configChips && els.configChips.contains(e.target)) &&
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

  // Ctrl/Cmd+Shift+G chord prefix: blur composer so the second key (n/p/c/i/Esc)
  // is not typed into the textarea (chord-leak). VS Code still receives the chord.
  let chordPrefixUntil = 0;
  const CHORD_SECOND = new Set(['n', 'p', 'c', 'i', 'escape']);
  document.addEventListener(
    'keydown',
    (e) => {
      const key = (e.key || '').toLowerCase();
      const chordMod = (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey;
      if (chordMod && key === 'g') {
        chordPrefixUntil = Date.now() + 2500;
        if (document.activeElement === els.input) {
          els.input.blur();
        }
        return;
      }
      if (chordPrefixUntil && Date.now() <= chordPrefixUntil) {
        chordPrefixUntil = 0;
        // Swallow printable second keys if focus somehow stayed in the composer.
        if (
          document.activeElement === els.input &&
          (CHORD_SECOND.has(key) || (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey))
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      // Document-level Escape→cancel when busy and focus is not in an overlay filter.
      if (e.key === 'Escape' && !bottomPickerOpen && !atOpen && !slashOpen && !actionsOpen) {
        const t = e.target;
        if (t === els.actionsFilter) {
          return;
        }
        const s = activeSession();
        if (s?.busy) {
          e.preventDefault();
          post('cancel', { localId: s.localId });
        }
      }
    },
    true
  );

  els.input.addEventListener('focus', () => {
    post('setContext', { key: 'grokBuild.composerFocused', value: true });
  });
  els.input.addEventListener('blur', () => {
    post('setContext', { key: 'grokBuild.composerFocused', value: false });
  });
  window.addEventListener('focus', () => {
    post('setContext', { key: 'grokBuild.chatFocused', value: true });
  });
  window.addEventListener('blur', () => {
    post('setContext', { key: 'grokBuild.chatFocused', value: false });
    post('setContext', { key: 'grokBuild.composerFocused', value: false });
  });

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

    // Escape cancels a busy turn when no overlay menu is open (Stop / Cancel haptic).
    if (e.key === 'Escape') {
      const s = activeSession();
      if (s?.busy) {
        e.preventDefault();
        post('cancel', { localId: s.localId });
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
          pinToBottom(); // new/switched session → follow latest
        }
        // While session is streaming, keep pin if user hasn't scrolled away
        const active = state.sessions.find((x) => x.localId === state.activeId);
        if (active?.busy && stickToBottom) {
          pinToBottom();
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
      case 'elicitationRequest':
        activeElicitation = {
          id: msg.id,
          mode: msg.mode,
          message: msg.message,
          requestedSchema: msg.requestedSchema,
          defaults: msg.defaults,
          url: msg.url,
          urlHost: msg.urlHost,
          suspiciousUrl: !!msg.suspiciousUrl,
          elicitationId: msg.elicitationId,
        };
        if (els.elicitCardBody) {
          delete els.elicitCardBody.dataset.elicitId;
        }
        renderElicitationCard();
        break;
      case 'permissionRequest':
        activePermission = {
          id: msg.id,
          toolCall: msg.toolCall,
          options: msg.options || [],
          localId: msg.localId,
          displayTitle: msg.displayTitle,
          unreadable: !!msg.unreadable,
          unreadableLabel: msg.unreadableLabel,
        };
        renderPermissionCard();
    renderElicitationCard();
        break;
      case 'permissionResolved':
        // Answered anywhere (inline card, native modal, timeout, turn end)
        if (activePermission && activePermission.id === msg.id) {
          activePermission.resolved = { decision: msg.decision, label: msg.label };
          renderPermissionCard();
          const resolvedId = msg.id;
          setTimeout(() => {
            if (activePermission && activePermission.id === resolvedId) {
              activePermission = null;
              renderPermissionCard();
            }
          }, 1500);
        }
        break;
      case 'permissionsCleared':
        if (activePermission && (!msg.localId || !activePermission.localId || activePermission.localId === msg.localId)) {
          activePermission = null;
          renderPermissionCard();
        }
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
  post('setContext', { key: 'grokBuild.chatFocused', value: true });
})();
