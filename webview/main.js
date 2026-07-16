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
    btnContext: document.getElementById('btnContext'),
    btnSlash: document.getElementById('btnSlash'),
    btnImage: document.getElementById('btnImage'),
    btnModel: document.getElementById('btnModel'),
    imageInput: document.getElementById('imageInput'),
    statusBar: document.getElementById('statusBar'),
    statusText: document.getElementById('statusText'),
    usageText: document.getElementById('usageText'),
    chipModel: document.getElementById('chipModel'),
    chipPerm: document.getElementById('chipPerm'),
    btnPerm: document.getElementById('btnPerm'),
    contextChips: document.getElementById('contextChips'),
    planPanel: document.getElementById('planPanel'),
    planList: document.getElementById('planList'),
    pendingEdits: document.getElementById('pendingEdits'),
    cliBanner: document.getElementById('cliBanner'),
    cliBannerDetail: document.getElementById('cliBannerDetail'),
    btnSetupCli: document.getElementById('btnSetupCli'),
    slashMenu: document.getElementById('slashMenu'),
  };

  /** @type {{ sessions: any[], activeId: string | null, pendingEdits: any[], cli: any, processCount: number }} */
  let state = {
    sessions: [],
    activeId: null,
    pendingEdits: [],
    cli: { ready: true, checking: false },
    processCount: 0,
    settings: {
      permissionMode: 'ask',
      permissionLabel: 'Ask',
      alwaysApprove: false,
      defaultModel: null,
    },
  };

  /** @type {Array<{ mimeType: string, data: string }>} */
  let pendingImages = [];

  /** Slash menu state */
  let slashOpen = false;
  let slashIndex = 0;
  /** @type {Array<{ name: string, description: string, input?: { hint?: string } | null }>} */
  let slashFiltered = [];

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
    renderTabs();
    renderStatus();
    renderPlan();
    renderMessages();
    renderChips();
    renderPendingEdits();
    renderComposer();
  }

  function renderCliBanner() {
    const cli = state.cli || {};
    if (cli.checking) {
      els.cliBanner.classList.remove('hidden');
      els.cliBannerDetail.textContent = 'Checking for Grok CLI…';
      els.btnSetupCli.classList.add('hidden');
      return;
    }
    if (!cli.ready) {
      els.cliBanner.classList.remove('hidden');
      els.btnSetupCli.classList.remove('hidden');
      els.cliBannerDetail.textContent =
        cli.error ||
        'Install the official CLI, then click Setup. Hybrid mode: grok agent stdio.';
      return;
    }
    els.cliBanner.classList.add('hidden');
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
    if (state.processCount) {
      bits.push(`${state.processCount}p`);
    }
    els.statusText.textContent = bits.join(' · ');
    els.statusBar.classList.toggle('error', s.status === 'error');

    const modelId =
      s.model || state.settings?.defaultModel || 'default';
    if (els.chipModel) {
      els.chipModel.textContent = `Model: ${truncate(String(modelId), 28)}`;
      els.chipModel.title = `Active model: ${modelId}\nClick to change`;
    }
    if (els.chipPerm) {
      const pl = state.settings?.permissionLabel || 'Ask';
      els.chipPerm.textContent = `Perm: ${pl}`;
      els.chipPerm.title =
        `Permission mode: ${pl}` +
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

  function renderMessages() {
    const s = activeSession();
    els.messages.innerHTML = '';

    if (!s || s.messages.length === 0) {
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
          <p>Hybrid mode: the extension is only the IDE surface. The official <code>grok</code> binary runs the agent over ACP.</p>
          <p>Use <strong>Setup CLI…</strong> above, then start a session with <strong>+</strong>.</p>
        `;
      } else {
        empty.innerHTML = `
          ${logoHtml}
          <h2>Grok Build</h2>
          <p>Full agent power via the official Grok CLI (ACP). Plan or execute, multi-session, native diffs.</p>
          <p>Shortcuts: <kbd>Alt+G</kbd> context · <kbd>Enter</kbd> send</p>
        `;
      }
      els.messages.appendChild(empty);
      return;
    }

    const stickToBottom =
      els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 80;

    for (const m of s.messages) {
      const div = document.createElement('div');
      div.className = `msg ${m.role}`;
      div.dataset.msgId = m.id;

      if (m.role !== 'system') {
        const header = document.createElement('div');
        header.className = 'msg-header';
        const role = document.createElement('div');
        role.className = 'role';
        role.textContent =
          m.role === 'agent'
            ? 'Grok'
            : m.role === 'thought'
              ? 'Thinking'
              : m.role === 'user'
                ? 'You'
                : m.role;
        header.appendChild(role);

        if (m.content && !m.streaming) {
          const copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'btn-copy';
          copyBtn.title = 'Copy message (or select text and Ctrl+C)';
          copyBtn.textContent = 'Copy';
          copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void copyText(m.content || '', copyBtn);
          });
          header.appendChild(copyBtn);
        }
        div.appendChild(header);
      } else if (m.content) {
        // System lines: double-click to copy
        div.title = 'Double-click to copy';
        div.addEventListener('dblclick', () => {
          void copyText(m.content || '');
        });
      }

      const body = document.createElement('div');
      body.className = 'body' + (m.streaming ? ' streaming-cursor' : '');
      body.innerHTML = formatMarkdown(m.content || '');
      div.appendChild(body);

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

    // Tool cards (recent non-completed or last few)
    if (s.toolCalls?.length) {
      const recent = s.toolCalls.slice(-5);
      for (const t of recent) {
        const card = document.createElement('div');
        card.className = 'tool-card';
        card.innerHTML = `<div class="title">${escapeHtml(t.title)}</div>
          <div class="status">${escapeHtml(t.kind)} · ${escapeHtml(t.status)}</div>`;
        els.messages.appendChild(card);
      }
    }

    if (stickToBottom) {
      els.messages.scrollTop = els.messages.scrollHeight;
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

  function formatMarkdown(src) {
    if (!src) {
      return '';
    }
    let text = escapeHtml(src);

    // Fenced code blocks
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="lang-${escapeHtml(lang)}">${code.replace(/\n$/, '')}</code></pre>`;
    });

    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold / italic
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Links
    text = text.replace(
      /\[([^\]]+)\]\((https?:[^)]+)\)/g,
      '<a href="$2" rel="noreferrer">$1</a>'
    );

    // Paragraphs: double newlines
    const parts = text.split(/\n{2,}/).map((p) => {
      if (p.startsWith('<pre>')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    });
    return parts.join('');
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

  function updateSlashMenu() {
    const value = els.input.value;
    const parsed = parseSlashQuery(value);
    if (!parsed || parsed.hasArgs) {
      hideSlashMenu();
      return;
    }
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
      if (els.slashMenu) {
        els.slashMenu.classList.add('hidden');
        els.slashMenu.innerHTML = '';
      }
      return;
    }
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
    if (els.slashMenu) {
      els.slashMenu.classList.add('hidden');
      els.slashMenu.innerHTML = '';
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
  els.btnContext.addEventListener('click', () => post('addContext', {}));
  if (els.btnSlash) {
    els.btnSlash.addEventListener('click', () => openSlashMenuForced());
  }
  els.btnModel.addEventListener('click', () => post('selectModel', {}));
  if (els.btnPerm) {
    els.btnPerm.addEventListener('click', () => post('selectPermissionMode', {}));
  }
  if (els.chipModel) {
    els.chipModel.addEventListener('click', () => post('selectModel', {}));
  }
  if (els.chipPerm) {
    els.chipPerm.addEventListener('click', () => post('selectPermissionMode', {}));
  }
  els.btnImage.addEventListener('click', () => els.imageInput.click());
  els.btnSetupCli.addEventListener('click', () => post('setupCli', {}));

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
    updateSlashMenu();
  });

  document.addEventListener('mousedown', (e) => {
    if (
      slashOpen &&
      els.slashMenu &&
      !els.slashMenu.contains(e.target) &&
      e.target !== els.input &&
      e.target !== els.btnSlash
    ) {
      hideSlashMenu();
    }
  });

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
      case 'state':
        state.sessions = msg.sessions || [];
        state.activeId = msg.activeId;
        state.pendingEdits = msg.pendingEdits || [];
        state.cli = msg.cli || { ready: true, checking: false };
        state.processCount = msg.processCount || 0;
        state.settings = msg.settings || state.settings;
        render();
        // Refresh slash menu if open (commands may have arrived from agent)
        if (slashOpen) {
          updateSlashMenu();
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
})();
