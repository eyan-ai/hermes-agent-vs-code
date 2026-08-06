const vscode = acquireVsCodeApi();
const iconUri = document.body.dataset.icon;

const state = {
  sessions: [],
  activeSessionId: "",
  editorContext: null,
  workspaceItems: [],
  attachments: [],
  skill: "",
  historyOpen: false,
  memoryOpen: false,
  titleEditing: false,
  titleDraft: "",
  renamingSessionId: null,
  settingsOpen: false,
  contextOpen: false,
  skillOpen: false,
  running: false,
  modifyingIndex: null,
  draft: "",
  historyQuery: "",
  noticeDismissed: false,
  openThinking: {},
  openSteps: {},
  models: [],
  mutedPaths: {},
  copiedIndex: undefined,
  settings: {
    mode: "Auto",
    model: "5.5",
    effort: "Medium",
    skills: []
  }
};

const icons = {
  history: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>',
  add: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/></svg>',
  file: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
  folder: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  selection: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h10M4 17h13"/></svg>',
  send: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  stop: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
  search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  bolt: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m13 2-9 14h8l-1 6 9-14h-8z"/></svg>',
  gear: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6V20a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-1-.6 1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-.6-1H4a2 2 0 1 1 0-4h.1a1.8 1.8 0 0 0 .6-1 1.8 1.8 0 0 0-.36-1.98l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-.6V4a2 2 0 1 1 4 0v.1a1.8 1.8 0 0 0 1 .6 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.8 1.8 0 0 0 19.4 9c.2.35.4.65.6 1h.1a2 2 0 1 1 0 4H20a1.8 1.8 0 0 0-.6 1Z"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  branch: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h3a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3"/><path d="M6 8v10"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12 5 5 9-10"/></svg>',
  chevron: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 4 4 4-4 4"/></svg>',
  eyeOff: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.9 17.9A10.8 10.8 0 0 1 12 20C6.5 20 2.7 15.9 1 12c.7-1.6 1.8-3.1 3.1-4.4"/><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9.3 4.1 11 8a12.4 12.4 0 0 1-2 3.2"/><path d="M3 3l18 18"/></svg>'
};

function h(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function activeSession() {
  return state.sessions.find(session => session.id === state.activeSessionId) || state.sessions[0] || { title: "Untitled", messages: [] };
}

function ageLabel(session) {
  const diff = Math.max(0, Date.now() - (session.updatedAt || session.createdAt || Date.now()));
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function currentContextAttachment() {
  const context = state.editorContext;
  if (!context) return null;
  if (state.mutedPaths[context.path]) return null;
  return context;
}

function attachmentsForMessage(message) {
  const items = [...(message.attachments || [])];
  if (message.editorContext && !items.some(item => item.path === message.editorContext.path)) items.push(message.editorContext);
  return items;
}

function canSubmit() {
  return Boolean(state.draft.trim() || state.attachments.length || state.skill || currentContextAttachment());
}

function updateSend() {
  const send = document.querySelector("#sendBtn");
  if (send) send.classList.toggle("ready", state.running || canSubmit());
}

function render() {
  const session = activeSession();
  const messages = session.messages || [];
  const running = messages.some(message => message.role === "assistant" && message.status === "running");
  state.running = running;
  // Scroll policy: while an agent is running we pin to the bottom so new
  // output is always visible. If the user scrolls up away from the bottom
  // we back off (see the scroll listener); when they return to the bottom
  // or a new run starts, we follow again.
  const scrollEl = document.querySelector(".scroll");
  if (!state.userScrolledUp) state.pinBottom = true;
  if (!running) state.pinBottom = false;
  const prevScrollTop = scrollEl ? scrollEl.scrollTop : 0;
  document.querySelector("#app").innerHTML = `
    <div class="app">
      <header class="topbar">
        <button class="title-btn ${state.titleEditing ? "editing" : ""}" id="titleBtn" type="button">
          <span class="title-text">${h(session.title || "Untitled")}</span>
          <span class="title-edit">${icons.edit}</span>
          <input class="title-input" id="titleInput" maxlength="64" value="${h(state.titleEditing ? state.titleDraft : (session.title || "Untitled"))}">
        </button>
        <div class="top-actions">
          <button class="icon-btn ${state.historyOpen ? "active" : ""}" id="historyBtn" type="button" title="History">${icons.history}</button>
          <button class="icon-btn" id="newBtn" type="button" title="New session">${icons.add}</button>
          <button class="icon-btn ${state.memoryOpen ? "active" : ""}" id="memoryBtn" type="button" title="Settings">${icons.gear}</button>
        </div>
      </header>
      ${renderHistory()}
      ${renderMemorySettings()}
      <section class="conversation">
        <div class="scroll">
          ${renderDiagnostics()}
          ${messages.length ? renderThread(messages) : renderHero()}
        </div>
        ${renderComposer(running)}
      </section>
  </div>`;
  bind();
  autosizePrompt();
  updateQuestionOverflow();
  // Restore scroll after the DOM rebuild: pin to the bottom while the agent
  // is streaming (auto-follow latest output), exact position otherwise.
  requestAnimationFrame(() => {
    const el = document.querySelector(".scroll");
    if (!el) return;
    el.scrollTop = state.pinBottom ? el.scrollHeight : prevScrollTop;
  });
}

// User scrolling away from the bottom releases the auto-follow; scrolling
// back to the bottom re-engages it for the next chunk.
let scrollHandlerBound = false;
function bindScrollWatch() {
  if (scrollHandlerBound) return;
  scrollHandlerBound = true;
  document.addEventListener("scroll", event => {
    const el = event.target;
    if (!el || !el.classList || !el.classList.contains("scroll")) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    if (!atBottom) state.userScrolledUp = true;
    else if (state.running) {
      state.userScrolledUp = false;
      state.pinBottom = true;
    }
  }, true);
}
bindScrollWatch();

function renderDiagnostics() {
  const diagnostics = state.diagnostics || [];
  if (!diagnostics.length) return "";
  return `<div class="diagnostics">${diagnostics.map(item => `<div class="diagnostic ${h(item.kind || "warning")}"><strong>${h(item.title)}</strong><span>${h(item.message)}</span></div>`).join("")}</div>`;
}

function autosizePrompt() {
  const prompt = document.querySelector("#prompt");
  if (!prompt) return;
  prompt.style.height = "auto";
  const maxHeight = parseFloat(getComputedStyle(prompt).maxHeight);
  prompt.style.height = `${Math.min(prompt.scrollHeight, maxHeight)}px`;
}

function updateQuestionOverflow() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".question-frame").forEach(frame => {
      frame.classList.toggle("fade-overflow", frame.scrollHeight > frame.clientHeight + 1);
    });
  });
}

function renderHero() {
  if (state.noticeDismissed) {
    return `<div class="hero">
      <img src="${iconUri}" alt="">
      <h1>Hermes Agent</h1>
      <p>Ask Hermes to understand, edit,<br>or explain your current code.</p>
    </div>`;
  }
  return `<div class="hero">
    <img src="${iconUri}" alt="">
    <h1>Hermes Agent</h1>
    <p>Ask Hermes to understand, edit,<br>or explain your current code.</p>
    <article class="notice">
      <div class="notice-head">${icons.bolt}<span>Editor context is enabled</span><button class="notice-close" id="noticeClose" type="button" title="Dismiss" aria-label="Dismiss">×</button></div>
      <div class="notice-body">Hermes can use the active VS Code file or selected lines as context. Use <strong>@</strong> to add files and folders.</div>
    </article>
  </div>`;
}

function renderHistory() {
  const query = state.historyQuery.toLowerCase();
  const sessions = state.sessions.filter(session => session.title.toLowerCase().includes(query));
  return `<div class="history ${state.historyOpen ? "open" : ""}" id="history">
    <label class="history-search">${icons.search}<input id="historySearch" type="search" placeholder="Search sessions..." value="${h(state.historyQuery)}"></label>
    <div class="history-list">
      ${sessions.map(session => {
        const renaming = state.renamingSessionId === session.id;
        return `<div class="history-item ${session.id === state.activeSessionId ? "active" : ""} ${renaming ? "renaming" : ""}" data-session="${session.id}">
          ${renaming
            ? `<input class="history-rename" maxlength="64" value="${h(session.title)}">`
            : `<span class="history-name">${h(session.title)}</span>`}
          <span class="history-age">${ageLabel(session)}</span>
          <span class="history-actions">
            <button class="history-action rename-history" type="button">${renaming ? "✓" : icons.edit}</button>
            <button class="history-action delete-history" type="button">${icons.trash}</button>
          </span>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function renderMemorySettings() {
  const rows = [
    ["Agent personality", "Tone, values, and behavioral instructions", "SOUL.md"],
    ["About you", "Personal context available to this agent", "USER.md"],
    ["Long-term memory", "Facts retained across conversations", "MEMORY.md"]
  ];
  return `<div class="memory-settings ${state.memoryOpen ? "open" : ""}" id="memorySettings">
    <section class="memory-card">
      <h2>Personality & memory</h2>
      <p>Edit the files that shape how this agent behaves and what it remembers.</p>
      <div class="memory-list">
        ${rows.map(([title, desc, file]) => `<button class="memory-row" type="button" data-file="${h(file)}">
          <span><strong>${h(title)}</strong><small>${h(desc)}</small></span>
          <code>${h(file)}</code>
          ${icons.chevron}
        </button>`).join("")}
      </div>
    </section>
  </div>`;
}

function renderThread(messages) {
  return `<div class="thread">${messages.map((message, index) => message.role === "user" ? renderUser(message, index, messages) : renderAssistant(message, index, messages)).join("")}</div>`;
}

function renderUser(message, index, messages) {
  const attachments = attachmentsForMessage(message);
  const textOnly = attachments.length === 0;
  const laterUser = messages.slice(index + 1).some(item => item.role === "user");
  return `<div class="message user">
    <div class="bubble ${textOnly ? "text-only" : ""}">
      ${laterUser ? "" : `<button class="modify-btn" type="button" data-index="${index}" title="Modify" aria-label="Modify">${icons.edit}</button>`}
      <div class="question-frame">
        ${attachments.length ? `<div class="attachments">${attachments.map(renderAttachment).join("")}</div>` : ""}
        <div class="question-text">${message.skill ? `<span class="question-skill">/${h(message.skill)}</span> ` : ""}${h(message.text)}</div>
      </div>
    </div>
  </div>`;
}

function renderAssistant(message, index, messages) {
  const running = message.status === "running";
  const worked = message.startedAt && message.finishedAt ? Math.max(1, Math.round((message.finishedAt - message.startedAt) / 1000)) : 0;
  // Open while working (thinking streams live), auto-collapse once the run
  // finishes, unless the user manually toggled it.
  const manual = state.openThinking[message.id];
  const thinkingOpen = manual !== undefined ? manual : running;
  const caret = icons.chevron.replace("<svg", '<svg class="thinking-caret"').replace('d="m6 4 4 4-4 4"', 'd="m4 6 4 4 4-4"');
  const copied = state.copiedIndex === index;
  return `<div class="assistant">
    <div class="run-header">
      <button class="thinking-toggle ${running ? "running" : ""} ${thinkingOpen ? "open" : ""}" type="button" data-mid="${message.id}" aria-expanded="${thinkingOpen}">
        <span class="run-label">${running ? "Working" : `Worked for 0m ${worked}s`}</span>${caret}
      </button>
      <span>${h(state.settings.mode)}</span>
    </div>
    <div class="thinking ${thinkingOpen ? "" : "collapsed"}">
      ${(message.thinking || []).map((step, i) => renderThinkingStep(step, message.id, i, running)).join("")}
    </div>
    <div class="answer">${window.markdownToHtml ? window.markdownToHtml(message.text) : h(message.text)}</div>
    ${message.text ? `<div class="answer-actions">
      <button class="answer-action copy-answer ${copied ? "copied" : ""}" type="button" data-index="${index}" title="${copied ? "Copied" : "Copy response"}" aria-label="Copy response">${copied ? icons.check : icons.copy}</button>
    </div>` : ""}
  </div>`;
}

function renderThinkingStep(step, messageId, index, running) {
  const key = `${messageId}:${index}`;
  const manual = state.openSteps[key];
  const open = manual !== undefined ? manual : state.running;
  if (step.kind === "tool" || (step.kind === "error" && step.title === "stderr")) {
    const code = (step.code || "").trim() || (step.kind === "error" ? (step.text || "").trim() : "");
    const result = (step.result || "").trim();
    const dotClass = step.status === "success" ? "success" : step.status === "error" ? "error" : "";
    const summary = step.kind === "error" && step.title === "stderr" ? "Script output (stderr)" : (step.summary || step.title || "Tool call");
    // Converged action row: natural-language summary with the outcome badge
    // on the same line; the whole row toggles the command/result details.
    const badge = step.done ? (step.status === "error" ? `<span class="step-badge error">✗</span>` : `<span class="step-badge">✓</span>`) : "";
    const hasDetail = Boolean(code || result);
    return `<div class="timeline-item tool-item">
      <span class="timeline-dot ${dotClass}"></span>
      <div class="timeline-body">
        <button class="step-row ${open ? "open" : ""}" data-step-key="${key}" type="button" aria-expanded="${open}">
          <span class="step-summary">${h(summary)}</span>
          ${badge}
          ${hasDetail ? `<span class="step-caret">›</span>` : ""}
        </button>
        ${hasDetail ? `<div class="step-content ${open ? "" : "collapsed"}">
          ${code ? `<div class="io-block"><span class="io-label">IN</span><pre class="code-sample"><code>${h(code)}</code></pre></div>` : ""}
          ${result ? `<div class="io-block"><span class="io-label">OUT</span><pre class="code-sample"><code>${h(result)}</code></pre></div>` : ""}
        </div>` : ""}
      </div>
    </div>`;
  }
  const kind = step.kind === "success" ? "success" : step.kind === "error" ? "error" : "neutral";
  const text = (step.text || "").trim();
  // Converged thought: "Thought for 17s" title (duration when finished,
  // "Thinking…" while streaming) — the title row itself toggles content.
  // CLI-parser path has no per-step timestamps; once the run ends the
  // message is no longer running, so every step reads as finished.
  const finished = step.finalized || step.durationMs !== undefined || !running;
  const duration = step.durationMs !== undefined
    ? Math.max(1, Math.round(step.durationMs / 1000))
    : 0;
  const title = finished
    ? (step.durationMs !== undefined ? `Thought for ${duration}s` : (step.title || "Thinking"))
    : (step.title || "Thinking");
  const hasText = Boolean(text);
  return `<div class="timeline-item ${kind}-item">
    <span class="timeline-dot ${kind}"></span>
    <div class="timeline-body">
      <button class="step-row ${open ? "open" : ""}" data-step-key="${key}" type="button" aria-expanded="${open}">
        <span class="step-summary">${h(title)}</span>
        ${hasText ? `<span class="step-caret">›</span>` : ""}
      </button>
      ${hasText ? `<div class="step-content ${open ? "" : "collapsed"}">
        <p>${h(text)}</p>
      </div>` : ""}
    </div>
  </div>`;
}

function renderAttachment(item) {
  return `<button class="attachment" type="button" title="${h(item.name)}" data-uri="${h(item.uri || "")}">${glyphFor(item.type)}<span class="attachment-name">${h(item.name)}</span></button>`;
}

function glyphFor(type) {
  return `<span class="attachment-glyph" aria-hidden="true">${type === "folder" ? icons.folder : icons.file}</span>`;
}

function renderPopovers() {
  return `<div class="popover ${state.contextOpen ? "open" : ""}" id="contextPopover">
      <div class="popover-head"><span>Add workspace context</span></div>
      <div class="option-list">${state.workspaceItems.length ? state.workspaceItems.map(item => `<button class="option" type="button" data-path="${h(item.path)}" title="${h(item.path)}">${item.type === "folder" ? icons.folder : icons.file}<span class="option-name">${h(item.name)}</span></button>`).join("") : `<div class="option-empty">No files found</div>`}</div>
    </div>
    <div class="popover ${state.skillOpen ? "open" : ""}" id="skillPopover">
      <div class="popover-head"><span>Skills</span></div>
      <div class="skill-list">${(state.settings.skills || []).map(skill => `<button class="skill-option" type="button" data-skill="${h(skill.name)}"><span>/${h(skill.name)}</span><span class="skill-desc">${h(skill.description || "")}</span></button>`).join("")}</div>
    </div>
    <div class="popover ${state.settingsOpen ? "open" : ""}" id="modePopover">
      <div class="popover-head"><span>Run settings</span><button class="mini-btn" id="resetMode" type="button">Reset</button></div>
      <div class="mode-panel">
        <div class="settings-row modes-title"><span>Mode</span><span class="settings-value">${h(state.settings.mode)}</span></div>
        <div class="mode-picker">
          ${["Manual", "Auto"].map(mode => `<button class="approval-option ${state.settings.mode === mode ? "active" : ""}" data-mode="${mode}" type="button">
            <span>${mode === "Manual" ? "✋" : "⚡"}</span>
            <span><strong>${mode}</strong><span>${mode === "Manual" ? "Always ask for approval before making each edit." : "Only ask for approval when actions detected as potentially unsafe."}</span></span>
            <span>${state.settings.mode === mode ? "✓" : ""}</span>
          </button>`).join("")}
        </div>
      </div>
    </div>`;
}

function renderComposer(running) {
  const context = state.editorContext;
  const muted = Boolean(context && state.mutedPaths[context.path]);
  const contextChip = context
    ? `<button class="composer-chip ${muted ? "muted" : ""}" id="contextChip" type="button" title="${muted ? "Use context" : "Mute context"}" aria-label="${muted ? "Use context" : "Mute context"}">${muted ? icons.eyeOff : (context.type === "selection" ? icons.selection : icons.file)}<span>${h(context.name)}</span></button>`
    : "";
  return `<div class="composer-wrap">
    ${renderPopovers()}
    <div class="composer">
      <div class="composer-top ${state.attachments.length ? "visible" : ""}">
        ${state.attachments.map(item => `<span class="attachment-pill" title="${h(item.name)}">${glyphFor(item.type)}<span class="attachment-name">${h(item.name)}</span><button class="remove-pill" data-path="${h(item.path)}" type="button" aria-label="Remove ${h(item.name)}">×</button></span>`).join("")}
      </div>
      <div class="input-line">
        ${state.skill ? `<span class="prompt-skill">/${h(state.skill)}</span>` : ""}
        <textarea id="prompt" class="prompt" rows="2" placeholder="Ask Hermes to edit...">${h(state.draft)}</textarea>
      </div>
      <div class="toolbar">
        <button class="tool-btn" id="pickBtn" type="button" title="Add files or folders" aria-label="Add files or folders">${icons.add}</button>
        <div class="divider"></div>
        <div class="context-strip">${contextChip}</div>
        <button class="tool-btn" id="modeBtn" type="button" title="Run settings"><span class="mode-label">${h(state.settings.mode)}</span>${icons.chevron.replace("<svg", '<svg class="dropdown-icon"')}</button>
        <button class="send ${running || canSubmit() ? "ready" : ""} ${running ? "stop" : ""}" id="sendBtn" type="button">${running ? icons.stop : icons.send}</button>
      </div>
    </div>
  </div>`;
}

function bind() {
  document.querySelector("#titleBtn")?.addEventListener("click", event => {
    event.stopPropagation();
    if (!state.titleEditing) state.titleDraft = activeSession().title || "Untitled";
    state.titleEditing = true;
    render();
    const input = document.querySelector("#titleInput");
    input?.focus();
    input?.select();
  });
  document.querySelector("#titleInput")?.addEventListener("input", event => {
    state.titleDraft = event.target.value;
  });
  document.querySelector("#titleInput")?.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.isComposing) {
      state.titleEditing = false;
      render();
    } else if (event.key === "Enter" && !event.isComposing) {
      const title = state.titleDraft.trim() || "Untitled";
      vscode.postMessage({ type: "renameSession", id: state.activeSessionId, title });
      state.titleEditing = false;
      render();
    }
  });
  document.querySelector("#noticeClose")?.addEventListener("click", () => {
    state.noticeDismissed = true;
    render();
  });
  document.querySelectorAll(".thinking-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.mid;
      state.openThinking[id] = !state.openThinking[id];
      render();
    });
  });
  document.querySelectorAll(".step-row").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.stepKey;
      state.openSteps[key] = !(state.openSteps[key] ?? state.running);
      render();
    });
  });
  document.querySelector("#historyBtn")?.addEventListener("click", event => {
    event.stopPropagation();
    state.historyOpen = !state.historyOpen;
    state.memoryOpen = false;
    render();
  });
  document.querySelector("#memoryBtn")?.addEventListener("click", event => {
    event.stopPropagation();
    state.memoryOpen = !state.memoryOpen;
    state.historyOpen = false;
    render();
  });
  document.querySelectorAll(".memory-row").forEach(row => {
    row.addEventListener("click", () => vscode.postMessage({ type: "openMemoryDoc", file: row.dataset.file }));
  });
  document.querySelector("#newBtn")?.addEventListener("click", () => vscode.postMessage({ type: "newSession" }));
  document.querySelector("#historySearch")?.addEventListener("input", event => {
    state.historyQuery = event.target.value;
    render();
  });
  document.querySelectorAll(".history-item").forEach(item => {
    const id = item.dataset.session;
    item.querySelector(".history-name")?.addEventListener("click", () => vscode.postMessage({ type: "selectSession", id }));
    item.querySelector(".rename-history")?.addEventListener("click", event => {
      event.stopPropagation();
      const input = item.querySelector(".history-rename");
      if (input) vscode.postMessage({ type: "renameSession", id, title: input.value });
      else {
        state.renamingSessionId = id;
        render();
      }
    });
    item.querySelector(".history-rename")?.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.isComposing) vscode.postMessage({ type: "renameSession", id, title: event.target.value });
    });
    item.querySelector(".delete-history")?.addEventListener("click", event => {
      event.stopPropagation();
      vscode.postMessage({ type: "deleteSession", id });
    });
  });
  document.querySelectorAll(".attachment[data-uri]").forEach(button => {
    button.addEventListener("click", () => vscode.postMessage({ type: "openAttachment", attachment: { uri: button.dataset.uri } }));
  });
  document.querySelectorAll(".modify-btn").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const message = activeSession().messages?.[index];
      if (!message) return;
      state.modifyingIndex = index;
      state.draft = message.text || "";
      state.skill = message.skill || "";
      state.attachments = [...(message.attachments || [])];
      render();
      document.querySelector("#prompt")?.focus();
    });
  });
  document.querySelectorAll(".copy-answer").forEach(button => {
    button.addEventListener("click", () => {
      const message = activeSession().messages?.[Number(button.dataset.index)];
      if (!message?.text) return;
      vscode.postMessage({ type: "copyAnswer", text: message.text });
      state.copiedIndex = Number(button.dataset.index);
      // In-place feedback: swap icon to a check without re-rendering the
      // whole thread, so the viewport never jumps. Revert after 2s.
      const revert = () => {
        if (state.copiedIndex !== Number(button.dataset.index)) return;
        state.copiedIndex = undefined;
        button.classList.remove("copied");
        button.innerHTML = icons.copy;
        button.title = "Copy response";
      };
      clearTimeout(button._copyTimer);
      button._copyTimer = setTimeout(revert, 2000);
      button.classList.add("copied");
      button.innerHTML = icons.check;
      button.title = "Copied";
    });
  });
  document.querySelector("#pickBtn")?.addEventListener("click", () => vscode.postMessage({ type: "pickLocal" }));
  document.querySelector("#modeBtn")?.addEventListener("click", () => {
    state.settingsOpen = !state.settingsOpen;
    state.contextOpen = false;
    state.skillOpen = false;
    render();
  });
  document.querySelector("#contextChip")?.addEventListener("click", () => {
    const context = state.editorContext;
    if (!context) return;
    state.mutedPaths[context.path] = !state.mutedPaths[context.path];
    render();
  });
  document.querySelectorAll(".remove-pill").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      state.attachments = state.attachments.filter(item => item.path !== button.dataset.path);
      render();
    });
  });
  document.querySelectorAll(".option").forEach(button => {
    button.addEventListener("click", () => {
      const item = state.workspaceItems.find(entry => entry.path === button.dataset.path);
      if (item && !state.attachments.some(existing => existing.path === item.path)) state.attachments.push(item);
      state.contextOpen = false;
      render();
    });
  });
  document.querySelectorAll(".skill-option").forEach(button => {
    button.addEventListener("click", () => {
      state.skill = button.dataset.skill;
      state.skillOpen = false;
      render();
    });
  });
  document.querySelectorAll(".approval-option").forEach(button => {
    button.addEventListener("click", () => {
      state.settings.mode = button.dataset.mode;
      settingsChanged();
      render();
    });
  });
  document.querySelector("#resetMode")?.addEventListener("click", () => {
    state.settings.mode = "Auto";
    settingsChanged();
    render();
  });
  const prompt = document.querySelector("#prompt");
  prompt?.addEventListener("input", event => {
    autosizePrompt();
    const value = event.target.value;
    state.draft = value;
    updateSend();
    if (value.includes("@")) {
      const query = value.match(/@([^\s]*)$/)?.[1] || "";
      state.contextOpen = true;
      state.skillOpen = false;
      state.settingsOpen = false;
      vscode.postMessage({ type: "searchWorkspace", query });
    } else if (value.trimStart().startsWith("/")) {
      state.skillOpen = true;
      state.contextOpen = false;
      state.settingsOpen = false;
      render();
    }
  });
  prompt?.addEventListener("keydown", event => {
    if (event.key === "Backspace" && state.skill && prompt.selectionStart === 0) {
      state.skill = "";
      render();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  });
  document.querySelector("#sendBtn")?.addEventListener("click", submit);
}

// Persistent outside-click handling: closes popovers, commits title edits.
// Bound once at module level so it survives re-renders (unlike a per-render
// { once: true } listener, which stopped working after its first fire).
document.addEventListener("click", event => {
  const link = event.target.closest("a[data-href]");
  if (link) {
    event.preventDefault();
    vscode.postMessage({ type: "openLink", url: link.dataset.href });
    return;
  }
  let changed = false;
  if (!event.target.closest(".history, #historyBtn") && state.historyOpen) {
    state.historyOpen = false;
    changed = true;
  }
  if (!event.target.closest(".memory-settings, #memoryBtn") && state.memoryOpen) {
    state.memoryOpen = false;
    changed = true;
  }
  if (!event.target.closest(".popover, #modeBtn") && (state.contextOpen || state.skillOpen || state.settingsOpen)) {
    state.contextOpen = false;
    state.skillOpen = false;
    state.settingsOpen = false;
    changed = true;
  }
  if (state.titleEditing && !event.target.closest("#titleBtn")) {
    const title = state.titleDraft.trim() || "Untitled";
    vscode.postMessage({ type: "renameSession", id: state.activeSessionId, title });
    state.titleEditing = false;
    changed = true;
  }
  if (changed) render();
});

function settingsChanged() {
  vscode.postMessage({ type: "settingsChanged", settings: state.settings });
}

function submit() {
  if (state.running) {
    vscode.postMessage({ type: "stop" });
    return;
  }
  const prompt = document.querySelector("#prompt")?.value || "";
  state.draft = prompt;
  if (!state.draft.trim() && !state.attachments.length && !state.skill && !currentContextAttachment()) return;
  vscode.postMessage({
    type: "sendPrompt",
    prompt: state.draft,
    skill: state.skill,
    attachments: state.attachments,
    editorContext: currentContextAttachment(),
    settings: state.settings,
    replaceFromIndex: state.modifyingIndex
  });
  state.attachments = [];
  state.skill = "";
  state.draft = "";
  state.modifyingIndex = null;
  state.userScrolledUp = false;
  state.pinBottom = true;
  render();
}

window.addEventListener("message", event => {
  const message = event.data;
  if (message.type === "state") {
    state.sessions = message.sessions || [];
    state.activeSessionId = message.activeSessionId;
    state.settings = { ...state.settings, ...(message.settings || {}) };
    state.models = message.models || [];
    state.diagnostics = message.diagnostics || [];
    state.editorContext = message.editorContext;
    state.renamingSessionId = null;
    render();
  }
  if (message.type === "editorContext") {
    state.editorContext = message.context;
    render();
  }
  if (message.type === "workspaceItems") {
    state.workspaceItems = message.items || [];
    render();
  }
  if (message.type === "localPicked") {
    for (const item of message.attachments || []) {
      if (!state.attachments.some(existing => existing.path === item.path)) state.attachments.push(item);
    }
    render();
  }
  if (message.type === "assistantChunk") {
    const session = activeSession();
    const assistant = session.messages?.find(item => item.id === message.messageId);
    if (assistant) assistant.text += message.chunk;
    render();
  }
  if (message.type === "thinkingUpdate") {
    const session = activeSession();
    const assistant = session.messages?.find(item => item.id === message.messageId);
    if (assistant) assistant.thinking = message.thinking || [];
    render();
  }
  if (message.type === "focusInput") {
    document.querySelector("#prompt")?.focus();
  }
});

vscode.postMessage({ type: "ready" });
