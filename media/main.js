const vscode = acquireVsCodeApi();
const iconUri = document.body.dataset.icon;

const state = {
  sessions: [],
  activeSessionId: "",
  editorContext: null,
  workspaceItems: [],
  attachments: [],
  skill: "",
  command: "",
  tokenType: "",
  queue: [],
  queueCollapsed: false,
  editingQueueId: null,
  historyOpen: false,
  memoryOpen: false,
  titleEditing: false,
  titleDraft: "",
  renamingSessionId: null,
  settingsOpen: false,
  contextOpen: false,
  commandOpen: false,
  running: false,
  modifyingIndex: null,
  draft: "",
  historyQuery: "",
  noticeDismissed: false,
  openThinking: {},
  openSteps: {},
  renameDrafts: {},
  renameOriginals: {},
  models: [],
  contextMuted: false,
  copiedIndex: undefined,
  permission: null,
  permissionResolving: false,
  permissionDraft: "",
  todosOpen: false,
  userScrolledUp: false,
  pinBottom: false,
  pendingSubmissionScrollIntent: null,
  expandedUserMessages: {},
  settings: {
    mode: "Auto",
    model: "",
    skills: [],
    commands: []
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
  stop: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
  search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  bolt: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m13 2-9 14h8l-1 6 9-14h-8z"/></svg>',
  gear: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6V20a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-1-.6 1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-.6-1H4a2 2 0 1 1 0-4h.1a1.8 1.8 0 0 0 .6-1 1.8 1.8 0 0 0-.36-1.98l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-.6V4a2 2 0 1 1 4 0v.1a1.8 1.8 0 0 0 1 .6 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.8 1.8 0 0 0 19.4 9c.2.35.4.65.6 1h.1a2 2 0 1 1 0 4H20a1.8 1.8 0 0 0-.6 1Z"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  branch: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h3a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3"/><path d="M6 8v10"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12 5 5 9-10"/></svg>',
  chevron: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 4 4 4-4 4"/></svg>',
  todoChevron: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>',
  collapse: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10 4-4 4 4"/></svg>',
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

function focusPromptAtEnd() {
  const prompt = document.querySelector("#prompt");
  if (!prompt) return;
  prompt.focus();
  const range = document.createRange();
  range.selectNodeContents(prompt);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function caretAtTokenBoundary(prompt) {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed) return false;
  const anchor = selection.anchorNode;
  if (anchor === prompt) return selection.anchorOffset <= 1;
  if (anchor?.nodeType === Node.TEXT_NODE && anchor.previousSibling?.classList?.contains("prompt-token")) {
    return selection.anchorOffset <= 1;
  }
  return false;
}

function clearComposerDraft() {
  state.skill = "";
  state.command = "";
  state.tokenType = "";
  state.draft = "";
  state.attachments = [];
  state.modifyingIndex = null;
  state.editingQueueId = null;
  state.commandOpen = false;
  state._commandFilter = "";
  state._commandIndex = 0;
}

function selectedToken() {
  if (state.skill) return { name: `/${state.skill}`, type: "skill", value: state.skill };
  if (state.command) return { name: state.command, type: "command", value: state.command };
  return null;
}

function promptBody(prompt = document.querySelector("#prompt")) {
  if (!prompt) return state.draft;
  const clone = prompt.cloneNode(true);
  clone.querySelectorAll(".prompt-token").forEach(node => node.remove());
  const text = typeof clone.innerText === "string" ? clone.innerText : clone.textContent;
  return text.replace(/\u00a0/g, " ").trim();
}

function selectCommandOption(option) {
  if (!option) return;
  state.skill = option.type === "skill" ? option.value : "";
  state.command = option.type === "command" ? option.value : "";
  state.tokenType = option.type;
  state.draft = "";
  state.commandOpen = false;
  state._commandFilter = "";
  render();
  focusPromptAtEnd();
}

function commandMatches(command, filter) {
  const value = String(filter || "").toLowerCase();
  if (!value) return true;
  return String(command.name || "").toLowerCase().includes(value)
    || String(command.description || "").toLowerCase().includes(value);
}

function filteredCommandGroups() {
  const filter = (state._commandFilter || "").toLowerCase();
  return (state.settings.commands || []).map(group => ({
    ...group,
    commands: (group.commands || []).filter(command => commandMatches(command, filter))
  })).filter(group => group.commands.length);
}

function flatCommandOptions() {
  return filteredCommandGroups().flatMap(group => group.commands || []);
}

function renderCommandListOnly() {
  const popover = document.querySelector("#commandPopover .command-list");
  if (!popover) return;
  const groups = filteredCommandGroups();
  let optionIndex = 0;
  popover.innerHTML = groups.length ? groups.map(group => `<section class="command-group">
    <div class="command-group-title">${h(group.name)}</div>
    ${(group.commands || []).map(command => `<button class="command-option ${optionIndex++ === (state._commandIndex || 0) ? "active" : ""}" type="button" data-command-index="${optionIndex - 1}">
      <span class="command-name">${h(command.name)}</span><span class="command-desc">${h(command.description || "")}</span>
    </button>`).join("")}
  </section>`).join("") : `<div class="option-empty">No matching commands</div>`;
  popover.querySelectorAll(".command-option").forEach(button => {
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => selectCommandOption(flatCommandOptions()[Number(button.dataset.commandIndex)]));
  });
}

function setRenameDraft(id, title) {
  if (!Object.prototype.hasOwnProperty.call(state.renameOriginals, id)) {
    state.renameOriginals[id] = title;
  }
  state.renameDrafts[id] = title;
}

function saveRename(id, title) {
  const value = (title || "").trim() || "Untitled";
  delete state.renameDrafts[id];
  delete state.renameOriginals[id];
  state.renamingSessionId = null;
  vscode.postMessage({ type: "renameSession", id, title: value });
}

function cancelRename(id) {
  const original = state.renameOriginals[id];
  const session = state.sessions.find(s => s.id === id);
  if (session && original !== undefined) session.title = original;
  delete state.renameDrafts[id];
  delete state.renameOriginals[id];
  state.renamingSessionId = null;
}

function estimateTitleCaretIndex(event, text) {
  const textEl = document.querySelector("#titleBtn .title-text");
  if (!textEl) return String(text || "").length;
  const rect = textEl.getBoundingClientRect();
  if (!rect.width) return String(text || "").length;
  const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const style = getComputedStyle(textEl);
  const canvas = estimateTitleCaretIndex._canvas || (estimateTitleCaretIndex._canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  if (!ctx) return String(text || "").length;
  ctx.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;
  const value = String(text || "");
  let best = value.length;
  for (let index = 0; index <= value.length; index += 1) {
    const width = ctx.measureText(value.slice(0, index)).width;
    if (width >= x) {
      const prev = index > 0 ? ctx.measureText(value.slice(0, index - 1)).width : 0;
      best = (x - prev) > (width - x) ? index : Math.max(0, index - 1);
      break;
    }
  }
  return Math.max(0, Math.min(value.length, best));
}

function saveTitleEdit() {
  if (!state.titleEditing) return false;
  const title = state.titleDraft.trim() || "Untitled";
  vscode.postMessage({ type: "renameSession", id: state.activeSessionId, title });
  state.titleEditing = false;
  return true;
}

function pathDisplayName(value) {
  const raw = String(value || "").replace(/[?#].*$/, "").replace(/[\\/]+$/, "");
  const name = raw.split(/[\\/]/).pop() || raw;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function renderPathLinks(text, { basenameOnly = false } = {}) {
  const value = String(text || "");
  if (!value) return "";
  const pattern = /(https?:\/\/[^\s<>"')]+|file:\/\/[^\s<>"')]+|(?:~|\/)[^\s<>"')]+|(?:\.{1,2}\/|[\w.-]+\/)[^\s<>"')]+\.[\w.-]+)/g;
  let html = "";
  let last = 0;
  value.replace(pattern, (match, _unused, offset) => {
    html += h(value.slice(last, offset));
    const label = h(basenameOnly ? pathDisplayName(match) : match);
    const title = ` title="${h(match)}"`;
    if (/^https?:\/\//i.test(match)) {
      html += `<a class="action-path" href="#" data-href="${h(match)}"${title}>${label}</a>`;
    } else if (match.startsWith("file://")) {
      html += `<a class="action-path" href="#" data-uri="${h(match)}"${title}>${label}</a>`;
    } else {
      html += `<a class="action-path" href="#" data-path="${h(encodeURIComponent(match))}"${title}>${label}</a>`;
    }
    last = offset + match.length;
    return match;
  });
  html += h(value.slice(last));
  return html;
}

function renderActionFileLink(filePath) {
  const value = String(filePath || "").trim();
  if (!value) return "";
  if (value.startsWith("file://")) {
    return `<a class="action-path" href="#" data-uri="${h(value)}" title="${h(value)}">${h(pathDisplayName(value))}</a>`;
  }
  return `<a class="action-path" href="#" data-path="${h(encodeURIComponent(value))}" title="${h(value)}">${h(pathDisplayName(value))}</a>`;
}

function renderActionDescription(action, description) {
  const value = String(description || "").trim();
  if (!value) return "";
  if (/^https?:\/\/\S+$/i.test(value)) return renderPathLinks(value);
  if (/^(?:Read|Edit|Write|Create|Delete)$/i.test(action)) {
    return renderActionFileLink(value);
  }
  return renderPathLinks(value);
}

function activeSession() {
  return state.sessions.find(session => session.id === state.activeSessionId) || state.sessions[0] || { title: "Untitled", messages: [] };
}

/** Pull the current todo plan from the running assistant message, if any. */
function activePlan() {
  const session = activeSession();
  const running = [...(session.messages || [])].reverse().find(m => m.role === "assistant" && m.status === "running");
  return running && Array.isArray(running.plan) && running.plan.length ? running.plan : null;
}

/**
 * Display title with a fallback: once a session has messages, a still-
 * "Untitled" title reads as the first user message (trimmed). The ACP title
 * sync is async (server generates it up to ~30s later), so the topbar and
 * history should never sit on a bare "Untitled" while content exists.
 */
function displayTitle(session) {
  if (session.title && session.title !== "Untitled") return session.title;
  const firstUser = (session.messages || []).find(message => message.role === "user" && message.text);
  if (firstUser && firstUser.text) {
    const text = firstUser.text.replace(/\s+/g, " ").trim();
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }
  return "Untitled";
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
  // Muting is a global switch: once the user unlinks the default context it
  // stays unlinked across document switches, but the chip keeps showing the
  // document that WOULD be referenced (see renderComposer).
  if (state.contextMuted) return null;
  return context;
}

function attachmentsForMessage(message) {
  const items = [...(message.attachments || [])];
  if (message.editorContext && !items.some(item => item.path === message.editorContext.path)) items.push(message.editorContext);
  return items;
}

function canSubmit() {
  if (state.command === "/steer") return Boolean(state.draft.trim());
  return Boolean(selectedToken() || state.draft.trim());
}

function updateSend() {
  const send = document.querySelector("#sendBtn");
  if (!send) return;
  const hasContent = canSubmit();
  send.classList.toggle("ready", state.running || hasContent);
  send.classList.toggle("stop", state.running && !hasContent);
  send.innerHTML = state.running && !hasContent ? icons.stop : icons.send;
}

function currentRenderState() {
  state._now = Date.now();
  const session = activeSession();
  const messages = session.messages || [];
  const running = messages.some(message => message.role === "assistant" && message.status === "running");
  state.running = running;
  if (!state.userScrolledUp) state.pinBottom = true;
  if (!running) state.pinBottom = false;
  return { session, messages, running };
}

function conversationHtml(messages) {
  return `${renderDiagnostics()}${messages.length ? renderThread(messages) : renderHero()}`;
}

function liveKey(node) {
  return node?.nodeType === Node.ELEMENT_NODE ? node.getAttribute("data-live-key") : "";
}

function compatibleLiveNode(current, desired) {
  return Boolean(current && desired
    && current.nodeType === desired.nodeType
    && (current.nodeType !== Node.ELEMENT_NODE || current.tagName === desired.tagName));
}

function syncLiveAttributes(current, desired) {
  for (const attribute of [...current.attributes]) {
    if (!desired.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of [...desired.attributes]) {
    if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  }
}

function morphLiveNode(current, desired) {
  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.nodeValue !== desired.nodeValue) current.nodeValue = desired.nodeValue;
    return;
  }
  syncLiveAttributes(current, desired);
  morphLiveChildren(current, desired);
}

function morphLiveChildren(current, desired) {
  let cursor = current.firstChild;
  for (const desiredChild of [...desired.childNodes]) {
    const key = liveKey(desiredChild);
    let match = key
      ? [...current.childNodes].find(node => liveKey(node) === key)
      : (cursor && !liveKey(cursor) && compatibleLiveNode(cursor, desiredChild) ? cursor : undefined);
    if (!match) {
      match = desiredChild.cloneNode(true);
      current.insertBefore(match, cursor);
    } else {
      if (match !== cursor) current.insertBefore(match, cursor);
      morphLiveNode(match, desiredChild);
    }
    cursor = match.nextSibling;
  }
  while (cursor) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
}

function reconcileConversationRegion(scrollEl, messages) {
  const desired = document.createElement("div");
  desired.innerHTML = conversationHtml(messages);
  morphLiveChildren(scrollEl, desired);
}

function finishRenderedRegions(prevScrollTop, { forceSubmissionBottom = false } = {}) {
  updateQuestionOverflow();
  requestAnimationFrame(() => {
    const el = document.querySelector(".scroll");
    if (!el) return;
    syncScrollPadding(el);
    watchComposerSize();
    const assistants = [...el.querySelectorAll(".assistant[data-message-id]")];
    const latestAssistant = assistants[assistants.length - 1];
    const newRunArrived = Number.isInteger(state.awaitingAssistantCount)
      && assistants.length > state.awaitingAssistantCount;
    if (forceSubmissionBottom) {
      el.scrollTop = el.scrollHeight;
      state.awaitingAssistantCount = undefined;
    } else if (newRunArrived && latestAssistant) {
      latestAssistant.scrollIntoView({ block: "end" });
      state.awaitingAssistantCount = undefined;
      state.pinBottom = true;
    } else {
      el.scrollTop = state.pinBottom ? el.scrollHeight : prevScrollTop;
    }
    syncRunningThinkingViewports();
    updateJumpToLatest();
  });
}

function render({ forceSubmissionBottom = false } = {}) {
  const { session, messages, running } = currentRenderState();
  const scrollEl = document.querySelector(".scroll");
  const prevScrollTop = scrollEl ? scrollEl.scrollTop : 0;
  document.querySelector("#app").innerHTML = `
    <div class="app">
      <header class="topbar">
        <button class="title-btn ${state.titleEditing ? "editing" : ""}" id="titleBtn" type="button">
          <span class="title-text">${h(displayTitle(session))}</span>
          <span class="title-edit">${icons.edit}</span>
          <input class="title-input" id="titleInput" maxlength="64" value="${h(state.titleEditing ? state.titleDraft : (displayTitle(session)))}">
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
        <div class="scroll" id="conversationRegion">${conversationHtml(messages)}</div>
        <button class="jump-to-latest" id="jumpToLatest" type="button" aria-label="Return to latest output" title="Return to latest output">↓ <span>Latest</span></button>
        ${renderComposer(running)}
      </section>
  </div>`;
  bind();
  const accessoryEl = document.querySelector("#composerAccessories");
  if (accessoryEl) accessoryEl._renderKey = accessoryRenderKey();
  autosizePrompt();
  if (state.commandOpen) renderCommandListOnly();
  finishRenderedRegions(prevScrollTop, { forceSubmissionBottom });
}

function renderLiveRegions({ forceSubmissionBottom = false } = {}) {
  const scrollEl = document.querySelector("#conversationRegion");
  const accessoryEl = document.querySelector("#composerAccessories");
  if (!scrollEl || !accessoryEl) {
    render({ forceSubmissionBottom });
    return;
  }
  const { session, messages } = currentRenderState();
  const prevScrollTop = scrollEl.scrollTop;
  reconcileConversationRegion(scrollEl, messages);
  refreshAccessoryRegion(accessoryEl);
  const titleText = document.querySelector("#titleBtn .title-text");
  if (titleText) titleText.textContent = displayTitle(session);
  bindConversationRegion();
  updateSend();
  finishRenderedRegions(prevScrollTop, { forceSubmissionBottom });
}

function renderAccessoriesOnly() {
  const accessoryEl = document.querySelector("#composerAccessories");
  if (!accessoryEl) {
    render();
    return;
  }
  refreshAccessoryRegion(accessoryEl);
  requestAnimationFrame(() => {
    const scrollEl = document.querySelector(".scroll");
    syncScrollPadding(scrollEl);
    watchComposerSize();
  });
}

function syncRunningThinkingViewports() {
  document.querySelectorAll(".step-content.thinking-step-running:not(.collapsed)").forEach(view => {
    view.scrollTop = view.scrollHeight;
    const updateFade = () => {
      const overflow = view.scrollHeight > view.clientHeight + 1;
      view.classList.toggle("has-top-overflow", overflow && view.scrollTop > 1);
    };
    updateFade();
    view.addEventListener("scroll", updateFade, { passive: true });
  });
}

function updateJumpToLatest() {
  const button = document.querySelector("#jumpToLatest");
  if (!button) return;
  button.classList.toggle("visible", Boolean(state.running && state.userScrolledUp));
}

// User scrolling away from the bottom releases the auto-follow; scrolling
// back to the bottom re-engages it for the next chunk.
let scrollHandlerBound = false;
function bindScrollWatch() {
  if (scrollHandlerBound) return;
  scrollHandlerBound = true;
  document.addEventListener("wheel", event => {
    const el = event.target?.closest?.(".scroll");
    if (!el || event.deltaY >= 0) return;
    state.userScrolledUp = true;
    state.pinBottom = false;
    updateJumpToLatest();
  }, { capture: true, passive: true });
  document.addEventListener("scroll", event => {
    const el = event.target;
    if (!el || !el.classList || !el.classList.contains("scroll")) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    if (!atBottom) {
      state.userScrolledUp = true;
      state.pinBottom = false;
    } else if (state.running) {
      state.userScrolledUp = false;
      state.pinBottom = true;
    }
    updateJumpToLatest();
  }, true);
}
bindScrollWatch();

// Issue 7: The composer is fixed over the bottom of the message list, so the
// list needs bottom padding >= composer height + a safety gap, otherwise the
// last line of the last message stays hidden under the input box no matter how
// far the user scrolls. The composer height is NOT static (attachments row,
// autosized prompt, permission mode, todos capsule and the status line all
// change it), so we measure the real value and mirror it into .scroll's
// padding-bottom. Acceptance: at full scroll the last line clears the composer
// top by >= 30px; requirement is composer height + 20px minimum, we use +36px.
const BOTTOM_CLEARANCE = 36; // visible gap between the last line and composer top
let composerSizeObserver = null;
function syncScrollPadding(scrollEl) {
  const el = scrollEl || document.querySelector(".scroll");
  const composer = document.querySelector(".composer-wrap");
  if (!el || !composer) return;
  el.style.paddingBottom = `${composer.offsetHeight + BOTTOM_CLEARANCE}px`;
  document.querySelector(".conversation")?.style.setProperty("--composer-height", `${composer.offsetHeight}px`);
}
// The composer-wrap node is rebuilt on every render(), so re-observe the fresh
// node after each render. ResizeObserver catches height changes that happen
// without a re-render (e.g. the prompt textarea auto-growing while typing).
function watchComposerSize() {
  if (composerSizeObserver) {
    composerSizeObserver.disconnect();
    composerSizeObserver = null;
  }
  const composer = document.querySelector(".composer-wrap");
  if (!composer) return;
  composerSizeObserver = new ResizeObserver(() => {
    const el = document.querySelector(".scroll");
    syncScrollPadding(el);
    // Keep the bottom pinned while streaming so the newest line stays visible
    // just above the composer when it grows (attachments, taller prompt).
    if (el && state.running && el.scrollHeight - el.scrollTop - el.clientHeight < 96) {
      el.scrollTop = el.scrollHeight;
    }
  });
  composerSizeObserver.observe(composer);
}
// Window/webview resize changes the composer size too — keep padding in sync.
window.addEventListener("resize", () => {
  const el = document.querySelector(".scroll");
  syncScrollPadding(el);
  if (el && state.running && el.scrollHeight - el.scrollTop - el.clientHeight < 96) {
    el.scrollTop = el.scrollHeight;
  }
});

function renderDiagnostics() {
  const diagnostics = state.diagnostics || [];
  if (!diagnostics.length) return "";
  return `<div class="diagnostics" data-live-key="diagnostics">${diagnostics.map((item, index) => `<div class="diagnostic ${h(item.kind || "warning")}" data-live-key="diagnostic:${index}"><strong>${h(item.title)}</strong><span>${h(item.message)}</span></div>`).join("")}</div>`;
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
      const expanded = frame.classList.contains("expanded");
      const overflowing = !expanded && frame.scrollHeight > frame.clientHeight + 1;
      frame.classList.toggle("fade-overflow", overflowing);
      frame.closest(".bubble")?.classList.toggle("question-expandable", overflowing);
    });
  });
}

function renderHero() {
  return `<div class="hero" data-live-key="hero">
    <img src="${iconUri}" alt="">
    <h1>Hermes Agent</h1>
    <p>Ask Hermes to understand, edit,<br>or explain your current code.</p>
  </div>`;
}

function renderHistory() {
  return `<div class="history ${state.historyOpen ? "open" : ""}" id="history">
    <label class="history-search">${icons.search}<input id="historySearch" type="search" placeholder="Search sessions..." value="${h(state.historyQuery)}"></label>
    <div class="history-list">${renderHistoryItems()}</div>
  </div>`;
}

function renderHistoryItems() {
  const query = state.historyQuery.toLowerCase();
  const sessions = state.sessions.filter(session => session.title.toLowerCase().includes(query));
  return sessions.map(session => {
    const renaming = state.renamingSessionId === session.id;
    const active = state.sessions.find(s => s.id === session.id);
    const title = state.renameDrafts[session.id] ?? (active ? active.title : session.title);
    return `<div class="history-item ${session.id === state.activeSessionId ? "active" : ""} ${renaming ? "renaming" : ""}" data-session="${session.id}">
      ${renaming
        ? `<input class="history-rename" maxlength="64" value="${h(title)}">`
        : `<span class="history-name">${h(displayTitle(active || session))}</span>`}
      <span class="history-age">${ageLabel(session)}</span>
      <span class="history-actions">
        ${renaming ? "" : `<button class="history-action rename-history" type="button">${icons.edit}</button>`}
        <button class="history-action delete-history" type="button">${icons.trash}</button>
      </span>
    </div>`;
  }).join("");
}

function refreshHistoryResults() {
  const list = document.querySelector("#history .history-list");
  if (!list) return;
  list.innerHTML = renderHistoryItems();
  bindHistoryItems(list);
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
  return `<div class="thread" data-live-key="thread">${messages.map((message, index) => {
    if (message.role === "user") return renderUser(message, index, messages);
    if (message.role === "system") return renderCommandNotice(message);
    return renderAssistant(message, index, messages);
  }).join("")}</div>`;
}

function renderCommandNotice(message) {
  const kind = ["error", "warning"].includes(message.kind) ? message.kind : "info";
  return `<div class="command-notice ${kind}" data-message-id="${h(message.id)}" data-live-key="message:${h(message.id)}">
    ${message.command ? `<span class="command-notice-name">${h(message.command)}</span>` : ""}
    <span class="command-notice-text">${h(message.text)}</span>
  </div>`;
}

function renderUser(message, index, messages) {
  const attachments = attachmentsForMessage(message);
  const textOnly = attachments.length === 0;
  const messageKey = String(message.id || `user-${index}`);
  const expanded = Boolean(state.expandedUserMessages[messageKey]);
  // Issue 6: Only the most recent user message gets the "latest" magnetic class
  const laterUser = messages.slice(index + 1).some(item => item.role === "user");
  const isLatest = !laterUser;
  return `<div class="message user ${isLatest ? "latest-user" : ""}" data-message-id="${h(messageKey)}" data-live-key="message:${h(messageKey)}">
    <div class="bubble ${textOnly ? "text-only" : ""} ${expanded ? "question-expanded" : ""}" data-message-key="${h(messageKey)}">
      ${laterUser ? "" : `<button class="modify-btn" type="button" data-index="${index}" title="Modify" aria-label="Modify">${icons.edit}</button>`}
      <div class="question-frame ${expanded ? "expanded" : ""}">
        ${attachments.length ? `<div class="attachments">${attachments.map(renderAttachment).join("")}</div>` : ""}
        ${message.steer ? `<div class="question-meta">Steered</div>` : ""}
        <div class="question-text">${message.skill ? `<span class="question-skill">/${h(message.skill)}</span> ` : ""}${message.command && !message.steer ? `<span class="question-skill">${h(message.command)}</span> ` : ""}${h(message.text)}</div>
      </div>
      ${expanded ? `<button class="question-collapse" type="button" data-message-key="${h(messageKey)}" title="Collapse" aria-label="Collapse message">${icons.collapse}</button>` : ""}
    </div>
  </div>`;
}

function runningDuration(startedAt, finishedAt) {
  const end = finishedAt || (state._now || Date.now());
  const seconds = Math.max(0, Math.round((end - (startedAt || end)) / 1000));
  if (seconds < 60) return `0m ${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/**
 * Working / interruption status shown as the LAST line of the agent's
 * answer body (not under the composer). Driven by message status:
 * - running  → animated "Working..." in the theme accent color
 * - stopped  → italic "Interrupted" (user pressed stop)
 * - failed   → italic "Tool Interrupted" (blocked by a tool/process issue)
 * The user-stop case also shows immediately via state._interrupted before
 * the extension's postState flips the message to "stopped".
 */
function answerStatusLine(message, index, messages) {
  const running = message.status === "running";
  if (message.status === "stopped") return `<div class="working-status interrupted">Interrupted</div>`;
  if (message.status === "failed") return `<div class="working-status tool-interrupted">Tool Interrupted</div>`;
  if (!running) return "";
  // Only the current assistant message hosts the animated Working line.
  const laterAssistant = messages.slice(index + 1).some(item => item.role === "assistant");
  if (laterAssistant) return "";
  if (state._interrupted === "user") {
    return `<div class="working-status interrupted">Interrupted</div>`;
  }
  return `<div class="working-status working"><span class="working-dot"></span><span class="working-label">Working</span><span class="working-ellipsis" aria-hidden="true"><span class="working-dot-char">.</span><span class="working-dot-char">.</span><span class="working-dot-char">.</span></span></div>`;
}

function renderAssistant(message, index, messages) {
  const running = message.status === "running";
  // Open while working (thinking streams live), auto-collapse once the
  // answer starts streaming (round-4: thinking over -> working folds),
  // unless the user manually toggled it.
  const manual = state.openThinking[message.id];
  const answerStarted = Boolean((message.text || "").trim());
  const thinkingOpen = manual !== undefined ? manual : (running && !answerStarted);
  const caret = icons.chevron.replace("<svg", '<svg class="thinking-caret"').replace('d="m6 4 4 4-4 4"', 'd="m4 6 4 4 4-4"');
  const copied = state.copiedIndex === index;
  const label = message.status === "continued"
    ? "Continued"
    : running
      ? `Working for ${runningDuration(message.startedAt)}`
      : (message.finishedAt ? `Worked for ${runningDuration(message.startedAt, message.finishedAt)}` : "Thinking");
  return `<div class="assistant" data-message-id="${h(message.id)}" data-live-key="message:${h(message.id)}">
    <div class="run-header" data-live-key="assistant-header">
      <button class="thinking-toggle ${running ? "running" : ""} ${thinkingOpen ? "open" : ""}" type="button" data-mid="${message.id}" aria-expanded="${thinkingOpen}">
        <span class="run-label">${label}</span>${caret}
      </button>
    </div>
    <div class="thinking ${running ? "thinking-running" : ""} ${thinkingOpen ? "" : "collapsed"}" data-live-key="assistant-thinking">
      ${(message.thinking || []).map((step, i) => renderThinkingStep(step, message.id, i, message.thinking, running)).join("")}
    </div>
    <div class="answer" data-live-key="assistant-answer"><div class="answer-content" data-live-key="answer-content">${window.markdownToHtml ? window.markdownToHtml(message.text) : h(message.text)}</div><div class="answer-status" data-live-key="answer-status">${answerStatusLine(message, index, messages)}</div></div>
    ${message.text ? `<div class="answer-actions">
      <button class="answer-action copy-answer ${copied ? "copied" : ""}" type="button" data-index="${index}" title="${copied ? "Copied" : "Copy response"}" aria-label="Copy response">${copied ? icons.check : icons.copy}</button>
    </div>` : ""}
  </div>`;
}

function thinkingStepDomKey(step, index, thinking) {
  if (step.toolCallId !== undefined && step.toolCallId !== null) return `tool:${step.toolCallId}`;
  const base = `${step.kind || "step"}:${step.streamId || step.title || "row"}`;
  const occurrence = thinking.slice(0, index)
    .filter(item => `${item.kind || "step"}:${item.streamId || item.title || "row"}` === base)
    .length;
  return `${base}:${occurrence}`;
}

function renderThinkingStep(step, messageId, index, thinking, running) {
  const key = `${messageId}:${index}`;
  const domKey = thinkingStepDomKey(step, index, thinking);
  const manual = state.openSteps[key];
  const lastIndex = thinking.length - 1;
  const lastStep = thinking[lastIndex];
  const runningThinkingStep = step.kind === "thinking"
    && index === lastIndex
    && running
    && !step.finalized;
  const lastIsRunning = lastStep && (lastStep.kind === "tool" || lastStep.kind === "thinking") && !lastStep.done && !lastStep.finalized;
  const open = manual !== undefined ? manual : (running && (index === lastIndex || (lastIsRunning && index >= lastIndex - 1 && thinking[lastIndex-1]?.kind === "tool" && !thinking[lastIndex-1]?.done)));
  if (step.kind === "tool" || (step.kind === "error" && step.title === "stderr")) {
    const code = (step.code || "").trim() || (step.kind === "error" ? (step.text || "").trim() : "");
    const detail = (step.detail || "").trim();
    const result = (step.result || "").trim();
    const succeeded = step.status === "completed" || step.status === "success" || (step.done && !step.error && step.status !== "failed");
    const failed = step.status === "failed" || step.status === "error" || step.error;
    const dotClass = failed ? "error" : succeeded ? "success" : "running";
    // Summary: action (first word) bold + dark, description follows as plain text.
    const action = step.action || "";
    const description = step.description || "";
    const summary = step.kind === "error" && step.title === "stderr"
      ? "Script output (stderr)"
      : (action
        ? `<strong>${h(action)}</strong>${description ? ` ${renderActionDescription(action, description)}` : ""}`
        : renderPathLinks(step.summary || step.title || "Tool call"));
    const badge = step.done || failed ? (failed ? `<span class="step-badge error">✗</span>` : `<span class="step-badge">✓</span>`) : "";
    const hasDetail = Boolean(code || detail || result || step.diff);
    return `<div class="timeline-item tool-item" data-live-key="${h(domKey)}">
      <span class="timeline-dot ${dotClass}"></span>
      <div class="timeline-body">
        <div class="step-row ${open ? "open" : ""}" data-step-key="${key}" role="button" tabindex="0" aria-expanded="${open}">
          <span class="step-summary"><span class="step-content-main">${summary}</span></span>
          ${badge}
          ${hasDetail ? `<span class="step-caret">›</span>` : ""}
        </div>
        ${hasDetail ? `<div class="step-content ${open ? "" : "collapsed"}">
          ${renderActionDetail(step, code, detail, result)}
          ${step.diff ? renderDiff(step.diff) : ""}
        </div>` : ""}
      </div>
    </div>`;
  }
  if (step.kind === "clarification") {
    return `<div class="timeline-item clarification-item" data-live-key="${h(domKey)}">
      <span class="timeline-dot success"></span>
      <div class="timeline-body">
        <div class="step-row ${open ? "open" : ""}" data-step-key="${key}" role="button" tabindex="0" aria-expanded="${open}">
          <span class="step-summary"><span class="step-content-main"><strong>AskUserQuestion</strong></span></span>
          <span class="step-caret">›</span>
        </div>
        <div class="step-content ${open ? "" : "collapsed"}"><div class="clarification-pair"><span>Q:</span><p>${h(step.question || "")}</p><span>A:</span><p>${h(step.answer || "")}</p></div></div>
      </div>
    </div>`;
  }
  const kind = step.kind === "success" ? "success" : step.kind === "error" ? "error" : "neutral";
  const text = (step.text || "").trim();
  // Process narrative ("我先读代码…") renders as a plain interleaved line,
  // like competitor UIs: a muted dot, no fold, no IN/OUT — it reads as
  // agent commentary between tool calls, not a structured step.
  if (step.kind === "note" && text) {
    return `<div class="timeline-item note-item" data-live-key="${h(domKey)}">
      <span class="timeline-dot neutral"></span>
      <div class="timeline-body"><p class="note-text">${h(text)}</p></div>
    </div>`;
  }
  // Converged thought: "Thought for 17s" title (duration when finished,
  // "Thinking…" while streaming) — the title row itself toggles content.
  // CLI-parser path has no per-step timestamps; once the run ends the
  // message is no longer running, so every step reads as finished.
  const finished = step.finalized || step.durationMs !== undefined || !running;
  const duration = step.durationMs !== undefined
    ? Math.max(1, Math.round(step.durationMs / 1000))
    : 0;
  const title = finished
    ? (step.durationMs !== undefined ? `Thinking ${duration}s` : (step.title || "Thinking"))
    : (step.title || "Thinking");
  const hasText = Boolean(text);
  return `<div class="timeline-item ${kind}-item" data-live-key="${h(domKey)}">
    <span class="timeline-dot ${kind}"></span>
    <div class="timeline-body">
      <div class="step-row ${open ? "open" : ""}" data-step-key="${key}" role="button" tabindex="0" aria-expanded="${open}">
        <span class="step-summary"><span class="step-content-main">${h(title)}</span></span>
        ${hasText ? `<span class="step-caret">›</span>` : ""}
      </div>
      ${hasText ? `<div class="step-content ${open ? "" : "collapsed"} ${runningThinkingStep ? "thinking-step-running" : ""}">
        <p class="thinking-text">${h(text)}</p>
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
    <div class="popover ${state.commandOpen ? "open" : ""}" id="commandPopover">
      <div class="popover-head"><span>Commands</span></div>
      <div class="command-list"></div>
    </div>
    <div class="popover ${state.settingsOpen ? "open" : ""}" id="modePopover">
      <div class="popover-head"><span>Run settings</span></div>
      <div class="mode-panel">
        <div class="settings-row modes-title"><span>Mode</span><span class="settings-value">${h(state.settings.mode)}</span></div>
        <div class="mode-picker">
          ${["Manual", "Auto"].map(mode => `<button class="approval-option ${state.settings.mode === mode ? "active" : ""}" data-mode="${mode}" type="button">
            <span>${mode === "Manual" ? "✋" : "⚡"}</span>
            <span><strong>${mode}</strong><span>${mode === "Manual" ? "Always ask for approval before making each edit." : "Only ask for approval when actions detected as potentially unsafe."}</span></span>
            <span>${state.settings.mode === mode ? "✓" : ""}</span>
          </button>`).join("")}
        </div>
        <div class="model-field">
          <label for="modelSelect">Model</label>
          <select class="model-select" id="modelSelect" ${state.models.length ? "" : "disabled"}>
            ${state.models.length
              ? state.models.map(model => `<option value="${h(model.id)}" title="${h(model.description || model.name)}" ${state.settings.model === model.id ? "selected" : ""}>${h(model.name || model.id)}</option>`).join("")
              : `<option value="">Current Hermes model</option>`}
          </select>
        </div>
      </div>
    </div>`;
}

function renderDiff(diff) {
  if (!diff) return "";
  const oldLines = Array.isArray(diff.oldLines) ? diff.oldLines : [];
  const newLines = Array.isArray(diff.newLines) ? diff.newLines : [];
  if (!oldLines.length && !newLines.length) return "";
  const deleted = oldLines.map(line => `<div class="diff-line diff-del"><span class="diff-sign">−</span><code>${h(line)}</code></div>`).join("");
  const added = newLines.map(line => `<div class="diff-line diff-add"><span class="diff-sign">+</span><code>${h(line)}</code></div>`).join("");
  return `<div class="diff-view">${deleted}${added}</div>`;
}

function renderIOBlock(label, content) {
  return `<table class="io-table"><tr><td class="io-label">${h(label)}</td><td class="io-content"><pre class="code-sample"><code>${h(content)}</code></pre></td></tr></table>`;
}

function renderCodeBlock(content, className = "") {
  return `<pre class="code-sample ${h(className)}"><code>${h(content)}</code></pre>`;
}

function renderActionDetail(step, code, detail, result) {
  const executionAction = Boolean(step.execution);
  const blocks = [];
  if (executionAction && code && result) blocks.push(renderIOTable(code, result));
  else {
    if (code) blocks.push(renderCodeBlock(code, "action-detail-card action-code"));
    if (detail) blocks.push(`<div class="action-detail-text">${h(detail)}</div>`);
    if (result) {
      blocks.push(isStructuredActionDetail(result)
        ? renderCodeBlock(result, "action-detail-card action-result")
        : `<div class="action-detail-text">${h(result)}</div>`);
    }
  }
  return blocks.join("");
}

function isStructuredActionDetail(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^```[\s\S]*```$/.test(text)) return true;
  if (/^(?:Traceback|Error:|STDOUT|STDERR|Exit code|Process exited)/im.test(text)) return true;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return true;
  } catch {}
  const lines = text.split("\n");
  return lines.length > 1 && lines.filter(line => /^(?:\s{2,}|[+\-|]|\$\s|>\s|\w[\w.-]*\s*[:=])/.test(line)).length >= Math.ceil(lines.length / 2);
}

/** Single IN/OUT table with two rows when both inputs/outputs exist. */
function renderIOTable(code, result) {
  if (!code && !result) return "";
  const rows = [];
  if (code) rows.push(`<tr><td class="io-label">IN</td><td class="io-content"><pre class="code-sample"><code>${h(code)}</code></pre></td></tr>`);
  if (result) rows.push(`<tr><td class="io-label">OUT</td><td class="io-content"><pre class="code-sample"><code>${h(result)}</code></pre></td></tr>`);
  return `<table class="io-table">${rows.join("")}</table>`;
}

function renderTodosCapsule(plan) {
  const done = plan.filter(t => t.status === "completed").length;
  const total = plan.length;
  return `<div class="todos-wrap">
    <button class="todos-capsule ${state.todosOpen ? "open" : ""}" id="todosCapsule" type="button" aria-expanded="${state.todosOpen}">
      <span class="todos-spinner"></span>
      <span class="todos-label">Todos ${done}/${total}</span>
      <span class="todos-chevron">${icons.todoChevron}</span>
    </button>
    ${state.todosOpen ? `<div class="todos-dropdown">
      ${plan.map(t => {
        const icon = t.status === "completed" ? `<span class="todos-status done">✓</span>`
          : t.status === "in_progress" ? `<span class="todos-status running">●</span>`
          : `<span class="todos-status pending">○</span>`;
        return `<div class="todos-item ${t.status}">
          ${icon}
          <span class="todos-item-text">${h(t.content)}</span>
        </div>`;
      }).join("")}
    </div>` : ""}
  </div>`;
}

function renderComposer(running) {
  const context = state.editorContext;
  const contextChip = context
    ? `<button class="composer-chip ${state.contextMuted ? "muted" : ""}" id="contextChip" type="button" title="${state.contextMuted ? "Use context" : "Mute context"}" aria-label="${state.contextMuted ? "Use context" : "Mute context"}">${state.contextMuted ? icons.eyeOff : (context.type === "selection" ? icons.selection : icons.file)}<span>${h(context.name)}</span></button>`
    : "";
  const p = state.permission;
  const permissionActive = Boolean(p);
  return `<div class="composer-wrap">
    ${renderPopovers()}
    <div id="composerAccessories">${renderAccessories()}</div>
    <div class="composer ${permissionActive ? "permission-mode" : ""}">
      <div class="composer-top ${state.attachments.length ? "visible" : ""}">
        ${state.attachments.map(item => `<span class="attachment-pill" title="${h(item.name)}">${glyphFor(item.type)}<span class="attachment-name">${h(item.name)}</span><button class="remove-pill" data-path="${h(item.path)}" type="button" aria-label="Remove ${h(item.name)}">×</button></span>`).join("")}
      </div>
      ${permissionActive ? renderPermissionInside() : renderPromptLine(running, contextChip)}
    </div>
  </div>`;
}

function renderAccessories() {
  const plan = activePlan();
  if (!plan) state.todosOpen = false;
  return `${plan ? renderTodosCapsule(plan) : ""}${renderQueue()}`;
}

function accessoryRenderKey() {
  return JSON.stringify({
    plan: activePlan(),
    queue: state.queue || [],
    queueCollapsed: state.queueCollapsed,
    editingQueueId: state.editingQueueId,
    todosOpen: state.todosOpen
  });
}

function refreshAccessoryRegion(accessoryEl = document.querySelector("#composerAccessories")) {
  if (!accessoryEl) return false;
  const key = accessoryRenderKey();
  if (accessoryEl._renderKey === key) return false;
  accessoryEl.innerHTML = renderAccessories();
  accessoryEl._renderKey = accessoryRenderKey();
  bindAccessoryRegion();
  return true;
}

function queueItemText(item) {
  const token = item.skill ? `/${item.skill}` : (item.command || "");
  return `${token}${token && item.prompt ? " " : ""}${item.prompt || ""}`.trim();
}

function renderQueue() {
  const queue = state.queue || [];
  if (!queue.length) return "";
  return `<section class="queue-panel ${state.queueCollapsed ? "collapsed" : ""}" aria-label="Queued messages">
    <button class="queue-head" id="queueToggle" type="button" aria-expanded="${!state.queueCollapsed}">
      <span class="queue-title">Queued messages</span>
      <span class="queue-head-meta"><span>${queue.length} queued</span><span class="queue-chevron">⌃</span></span>
    </button>
    <div class="queue-list">
      ${queue.map((item, index) => `<div class="queue-row ${item.id === state.editingQueueId ? "editing" : ""}" data-queue-id="${h(item.id)}">
        <span class="queue-index">${index + 1}</span>
        <span class="queue-text" title="${h(queueItemText(item))}">${h(queueItemText(item))}</span>
        <span class="queue-actions">
          <button class="queue-action queue-steer" type="button" data-action="steer" title="Submit without interrupting the model" aria-label="Submit without interrupting the model">Steer</button>
          <button class="queue-action" type="button" data-action="edit" title="Edit" aria-label="Edit">${icons.edit}</button>
          <button class="queue-action queue-delete" type="button" data-action="delete" title="Delete" aria-label="Delete">${icons.trash}</button>
        </span>
      </div>`).join("")}
    </div>
  </section>`;
}

function renderPromptLine(running, contextChip) {
  const token = selectedToken();
  const placeholder = token ? "" : "Do anything. Use @context or /command";
  const hasContent = canSubmit();
  return `<div>
    <div class="input-line prompt" id="prompt" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="${placeholder}">${token ? `<span class="prompt-token" contenteditable="false" data-token-type="${h(token.type)}">${h(token.name)}</span> ` : ""}${h(state.draft)}</div>
    <div class="toolbar">
      <button class="tool-btn plus-btn" id="pickBtn" type="button" title="Add files or folders" aria-label="Add files or folders">${icons.add}</button>
      <div class="context-strip">${contextChip}</div>
      <button class="tool-btn" id="modeBtn" type="button" title="Run settings"><span class="mode-label">${h(state.settings.mode)}</span>${icons.chevron.replace("<svg", '<svg class="dropdown-icon"')}</button>
      <button class="send ${running || canSubmit() ? "ready" : ""} ${running && !hasContent ? "stop" : ""}" id="sendBtn" type="button">${running && !hasContent ? icons.stop : icons.send}</button>
    </div>
  </div>`;
}

function renderPermissionInside() {
  const p = state.permission;
  const choices = Array.isArray(p.choices) ? p.choices : [];
  return `<div class="permission-panel">
    <div class="permission-head">${icons.bolt}<strong>${h(p.question || p.title || "Allow this action?")}</strong></div>
    ${p.diff ? renderDiff(p.diff) : ""}
    ${p.previewAction ? `<button class="permission-preview" id="permissionPreview" type="button" ${state.permissionResolving ? "disabled" : ""}>${h(p.previewAction)}</button>` : ""}
    <div class="permission-actions">
      ${choices.map(choice => `<button class="permission-btn permission-choice ${choice.danger ? "permission-deny" : ""}" data-decision="${h(choice.decision)}" data-option-id="${h(choice.optionId || "")}" type="button" ${state.permissionResolving ? "disabled" : ""}>${h(choice.label)}</button>`).join("")}
    </div>
    ${p.allowFeedback === false ? "" : `<textarea class="permission-feedback" id="permissionFeedback" rows="1" placeholder="Tell Hermes what to do instead" ${state.permissionResolving ? "disabled" : ""}>${h(state.permissionDraft)}</textarea>`}
  </div>`;
}

function bindConversationRegion() {
  const jumpButton = document.querySelector("#jumpToLatest");
  if (jumpButton && !jumpButton._jumpBindingReady) {
    jumpButton._jumpBindingReady = true;
    jumpButton.addEventListener("click", () => {
      const region = document.querySelector("#conversationRegion");
      if (!region) return;
      state.userScrolledUp = false;
      state.pinBottom = true;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      region.scrollTo({ top: region.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
      updateJumpToLatest();
    });
  }
  document.querySelectorAll(".thinking-toggle").forEach(button => {
    if (button._thinkingBindingReady) return;
    button._thinkingBindingReady = true;
    button.addEventListener("click", () => {
      const id = button.dataset.mid;
      state.openThinking[id] = !state.openThinking[id];
      renderLiveRegions();
    });
  });
  document.querySelectorAll(".step-row").forEach(button => {
    if (button._stepBindingReady) return;
    button._stepBindingReady = true;
    button.addEventListener("click", event => {
      if (event.target.closest("a")) return;
      const key = button.dataset.stepKey;
      state.openSteps[key] = button.getAttribute("aria-expanded") !== "true";
      renderLiveRegions();
    });
    button.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const key = button.dataset.stepKey;
      state.openSteps[key] = button.getAttribute("aria-expanded") !== "true";
      renderLiveRegions();
    });
  });
  document.querySelectorAll(".attachment[data-uri]").forEach(button => {
    if (button._attachmentBindingReady) return;
    button._attachmentBindingReady = true;
    button.addEventListener("click", () => vscode.postMessage({ type: "openAttachment", attachment: { uri: button.dataset.uri } }));
  });
  document.querySelectorAll(".message.user .bubble").forEach(bubble => {
    if (bubble._questionBindingReady) return;
    bubble._questionBindingReady = true;
    bubble.addEventListener("click", event => {
      if (event.target.closest("button, a, .attachment")) return;
      if (!bubble.classList.contains("question-expandable")) return;
      const messageKey = bubble.dataset.messageKey;
      if (!messageKey) return;
      state.expandedUserMessages[messageKey] = true;
      renderLiveRegions();
    });
  });
  document.querySelectorAll(".question-collapse").forEach(button => {
    if (button._collapseBindingReady) return;
    button._collapseBindingReady = true;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      delete state.expandedUserMessages[button.dataset.messageKey];
      renderLiveRegions();
    });
  });
  document.querySelectorAll(".modify-btn").forEach(button => {
    if (button._modifyBindingReady) return;
    button._modifyBindingReady = true;
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const message = activeSession().messages?.[index];
      if (!message) return;
      state.modifyingIndex = index;
      state.draft = message.text || "";
      state.skill = message.skill || "";
      state.command = message.command || "";
      state.tokenType = message.skill ? "skill" : (message.command ? "command" : "");
      state.attachments = [...(message.attachments || [])];
      render();
      document.querySelector("#prompt")?.focus();
    });
  });
  document.querySelectorAll(".copy-answer").forEach(button => {
    if (button._copyBindingReady) return;
    button._copyBindingReady = true;
    button.addEventListener("click", () => {
      const message = activeSession().messages?.[Number(button.dataset.index)];
      if (!message?.text) return;
      vscode.postMessage({ type: "copyAnswer", text: message.text });
      state.copiedIndex = Number(button.dataset.index);
      const revert = () => {
        if (state.copiedIndex !== Number(button.dataset.index)) return;
        state.copiedIndex = undefined;
        button.classList.remove("copied");
        button.innerHTML = icons.copy;
        button.title = "Copy response";
      };
      clearTimeout(button._copyTimer);
      button._copyTimer = setTimeout(revert, 1000);
      button.classList.add("copied");
      button.innerHTML = icons.check;
      button.title = "Copied";
    });
  });
}

function bindAccessoryRegion() {
  const queueToggle = document.querySelector("#queueToggle");
  if (queueToggle && !queueToggle._queueBindingsReady) {
    queueToggle._queueBindingsReady = true;
    queueToggle.addEventListener("click", () => {
      state.queueCollapsed = !state.queueCollapsed;
      renderAccessoriesOnly();
    });
  }
  document.querySelectorAll(".queue-row").forEach(row => {
    if (row._queueBindingsReady) return;
    row._queueBindingsReady = true;
    const item = (state.queue || []).find(entry => entry.id === row.dataset.queueId);
    if (!item) return;
    row.querySelector('[data-action="steer"]')?.addEventListener("click", () => {
      if (state.editingQueueId === item.id) clearComposerDraft();
      vscode.postMessage({ type: "queueSteer", id: item.id });
    });
    row.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      state.editingQueueId = item.id;
      state.draft = item.prompt || "";
      state.skill = item.skill || "";
      state.command = item.command || "";
      state.tokenType = item.skill ? "skill" : (item.command ? "command" : "");
      state.attachments = [...(item.attachments || [])];
      render();
      focusPromptAtEnd();
    });
    row.querySelector('[data-action="delete"]')?.addEventListener("click", () => {
      if (state.editingQueueId === item.id) clearComposerDraft();
      vscode.postMessage({ type: "queueDelete", id: item.id });
    });
  });
}

function bindHistoryItems(root = document) {
  root.querySelectorAll(".history-item").forEach(item => {
    const id = item.dataset.session;
    item.querySelector(".history-name")?.addEventListener("click", () => {
      if (state.renamingSessionId && state.renamingSessionId !== id) {
        saveRename(state.renamingSessionId, state.renameDrafts[state.renamingSessionId]);
      }
      state.historyOpen = false;
      vscode.postMessage({ type: "selectSession", id });
      render();
    });
    item.querySelector(".rename-history")?.addEventListener("click", event => {
      event.stopPropagation();
      const session = state.sessions.find(s => s.id === id);
      setRenameDraft(id, session ? session.title : "Untitled");
      state.renamingSessionId = id;
      render();
      requestAnimationFrame(() => document.querySelector(`.history-item[data-session="${id}"] .history-rename`)?.focus());
    });
    item.querySelector(".history-rename")?.addEventListener("input", event => {
      state.renameDrafts[id] = event.target.value;
    });
    item.querySelector(".history-rename")?.addEventListener("blur", () => {
      if (state.renamingSessionId !== id) return;
      const input = document.querySelector(`.history-item[data-session="${id}"] .history-rename`);
      saveRename(id, input ? input.value : state.renameDrafts[id]);
      setTimeout(() => render(), 0);
    });
    item.querySelector(".history-rename")?.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.isComposing) {
        saveRename(id, event.target.value);
        render();
      } else if (event.key === "Escape" && !event.isComposing) {
        cancelRename(id);
        render();
      }
    });
    item.querySelector(".history-rename")?.addEventListener("mousedown", event => event.stopPropagation());
    item.querySelector(".history-rename")?.addEventListener("click", event => event.stopPropagation());
    item.querySelector(".delete-history")?.addEventListener("click", event => {
      event.stopPropagation();
      vscode.postMessage({ type: "deleteSession", id });
    });
  });
}

function bind() {
  bindConversationRegion();
  bindAccessoryRegion();
  document.querySelector("#titleBtn")?.addEventListener("click", event => {
    event.stopPropagation();
    if (event.target.closest("#titleInput") || state.titleEditing) return;
    const title = displayTitle(activeSession());
    const caret = estimateTitleCaretIndex(event, title);
    if (!state.titleEditing) state.titleDraft = title;
    state.titleEditing = true;
    render();
    const input = document.querySelector("#titleInput");
    if (input) {
      input.focus();
      input.setSelectionRange(caret, caret);
    }
  });
  document.querySelector("#titleInput")?.addEventListener("input", event => {
    state.titleDraft = event.target.value;
  });
  document.querySelector("#titleInput")?.addEventListener("pointerdown", event => event.stopPropagation());
  document.querySelector("#titleInput")?.addEventListener("click", event => event.stopPropagation());
  document.querySelector("#titleInput")?.addEventListener("blur", () => {
    if (saveTitleEdit()) render();
  });
  document.querySelector("#titleInput")?.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.isComposing) {
      state.titleEditing = false;
      render();
    } else if (event.key === "Enter" && !event.isComposing) {
      if (saveTitleEdit()) render();
    }
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
    refreshHistoryResults();
  });
  bindHistoryItems();
  document.querySelector("#pickBtn")?.addEventListener("click", () => vscode.postMessage({ type: "pickLocal" }));
  document.querySelector("#modeBtn")?.addEventListener("click", () => {
    state.settingsOpen = !state.settingsOpen;
    state.contextOpen = false;
    state.commandOpen = false;
    render();
  });
  document.querySelector("#contextChip")?.addEventListener("click", () => {
    state.contextMuted = !state.contextMuted;
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
      // Strip the @ trigger from the draft
      state.draft = state.draft.replace(/@\S*\s*$/, "").trimEnd();
      render();
      focusPromptAtEnd();
    });
  });
  document.querySelectorAll(".approval-option").forEach(button => {
    button.addEventListener("click", () => {
      state.settings.mode = button.dataset.mode;
      state.settingsOpen = false;
      settingsChanged();
      render();
    });
  });
  document.querySelector("#modelSelect")?.addEventListener("change", event => {
    state.settings.model = event.target.value;
    settingsChanged();
  });
  const prompt = document.querySelector("#prompt");
  prompt?.addEventListener("input", () => {
    autosizePrompt();
    const value = promptBody(prompt);
    state.draft = value;
    updateSend();
    if (selectedToken()) return;
    if (value.includes("@")) {
      const query = value.match(/@([^\s]*)$/)?.[1] || "";
      state.contextOpen = true;
      state.commandOpen = false;
      state.settingsOpen = false;
      vscode.postMessage({ type: "searchWorkspace", query });
      return;
    }
    if (value.trimStart().startsWith("/")) {
      const commandFilter = value.trimStart().slice(1).toLowerCase();
      const wasOpen = state.commandOpen;
      state.commandOpen = true;
      state.contextOpen = false;
      state.settingsOpen = false;
      state._commandFilter = commandFilter;
      state._commandIndex = 0;
      if (!wasOpen || !document.querySelector("#commandPopover .command-list")) {
        render();
        focusPromptAtEnd();
        return;
      }
      renderCommandListOnly();
      return;
    }
    if (state.commandOpen) {
      state.commandOpen = false;
      render();
    }
  });
  prompt?.addEventListener("keydown", event => {
    if (event.key === "Backspace" && selectedToken() && caretAtTokenBoundary(prompt)) {
      event.preventDefault();
      state.skill = "";
      state.command = "";
      state.tokenType = "";
      render();
      focusPromptAtEnd();
      return;
    }
    if (state.commandOpen) {
      const options = flatCommandOptions();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        state._commandIndex = Math.min((state._commandIndex || 0) + 1, Math.max(0, options.length - 1));
        renderCommandListOnly();
        document.querySelector(".command-option.active")?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        state._commandIndex = Math.max((state._commandIndex || 0) - 1, 0);
        renderCommandListOnly();
        document.querySelector(".command-option.active")?.scrollIntoView({ block: "nearest" });
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && options.length && !event.isComposing) {
        event.preventDefault();
        selectCommandOption(options[state._commandIndex || 0]);
        return;
      }
      if (event.key === " " && !event.isComposing) {
        const typed = `/${(state._commandFilter || "").trim().toLowerCase()}`;
        const exact = options.find(option => option.name.toLowerCase() === typed);
        if (exact) {
          event.preventDefault();
          selectCommandOption(exact);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        state.commandOpen = false;
        render();
        focusPromptAtEnd();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  });
  prompt?.addEventListener("paste", event => {
    // If files are pasted (from clipboard), add them as attachments
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file") {
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        // Notify extension to handle the file URI through node
        try {
          const reader = new FileReader();
          reader.onload = () => {
            vscode.postMessage({ type: "pastedFile", name: file.name, dataUrl: reader.result });
          };
          reader.readAsDataURL(file);
        } catch { /* best effort */ }
        focusPromptAtEnd();
        return;
      }
    }
  });
  // Send/stop button is handled by a global delegated click listener that
  // survives DOM re-renders — no per-render binding needed.

  document.querySelectorAll(".permission-choice[data-decision]").forEach(button => {
    button.addEventListener("click", () => {
      if (state.permissionResolving) return;
      state.permissionResolving = true;
      vscode.postMessage({ type: "permissionResponse", decision: button.dataset.decision, optionId: button.dataset.optionId || undefined, requestId: state.permission.requestId, sessionId: state.permission.sessionId });
      render();
    });
  });
  document.querySelector("#permissionPreview")?.addEventListener("click", () => {
    vscode.postMessage({ type: "reopenPermissionPreview", requestId: state.permission.requestId, sessionId: state.permission.sessionId });
  });
  const permissionFeedback = document.querySelector("#permissionFeedback");
  permissionFeedback?.addEventListener("input", event => {
    state.permissionDraft = event.target.value;
  });
  permissionFeedback?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      const feedback = event.currentTarget.value.trim();
      if (!feedback || state.permissionResolving) return;
      state.permissionResolving = true;
      state.permissionDraft = feedback;
      vscode.postMessage({ type: "permissionResponse", decision: "feedback", feedback, requestId: state.permission.requestId, sessionId: state.permission.sessionId });
      render();
    }
  });
}

// Unified global click handler: survives DOM re-renders so stop/send never
// loses its click binding. Also handles popover dismiss and title editing.
document.addEventListener("click", event => {
  // Todos capsule — toggle the dropdown
  const cap = event.target.closest("#todosCapsule");
  if (cap) {
    event.stopPropagation();
    state.todosOpen = !state.todosOpen;
    renderAccessoriesOnly();
    return;
  }
  // Send / stop button — must be first so stopPropagation prevents the
  // popover-dismiss logic from firing, which would otherwise re-render and
  // drop the mousedown→click sequence mid-air.
  const sendBtn = event.target.closest("#sendBtn");
  if (sendBtn) {
    event.preventDefault();
    event.stopPropagation();
    if (state.running && !canSubmit()) {
      // Issue 2: track user-initiated stop for interrupted status
      state._interrupted = "user";
      vscode.postMessage({ type: "stop" });
    } else {
      submit();
    }
    return;
  }

  const link = event.target.closest("a[data-href]");
  if (link) {
    event.preventDefault();
    vscode.postMessage({ type: "openLink", url: link.dataset.href });
    return;
  }
  const documentLink = event.target.closest("a[data-doc-path]");
  if (documentLink) {
    event.preventDefault();
    const filePath = decodeURIComponent(documentLink.dataset.docPath);
    vscode.postMessage({ type: "openGeneratedDocument", path: filePath });
    return;
  }
  const pathLink = event.target.closest("a[data-path]");
  if (pathLink) {
    event.preventDefault();
    const filePath = decodeURIComponent(pathLink.dataset.path);
    vscode.postMessage({ type: "openAttachment", attachment: { path: filePath, name: filePath.split("/").pop() } });
    return;
  }
  const uriLink = event.target.closest("a[data-uri]");
  if (uriLink) {
    event.preventDefault();
    const uri = uriLink.dataset.uri;
    vscode.postMessage({ type: "openAttachment", attachment: { uri, name: uri.split("/").pop() } });
    return;
  }
  let changed = false;
  let accessoriesChanged = false;
  if (!event.target.closest(".history, #historyBtn") && state.historyOpen) {
    if (state.renamingSessionId) saveRename(state.renamingSessionId, state.renameDrafts[state.renamingSessionId]);
    state.historyOpen = false;
    changed = true;
  }
  if (!event.target.closest(".memory-settings, #memoryBtn") && state.memoryOpen) {
    state.memoryOpen = false;
    changed = true;
  }
  if (!event.target.closest(".popover, #modeBtn") && (state.contextOpen || state.commandOpen || state.settingsOpen)) {
    state.contextOpen = false;
    state.commandOpen = false;
    state.settingsOpen = false;
    changed = true;
  }
  if (!event.target.closest(".todos-wrap") && state.todosOpen) {
    state.todosOpen = false;
    accessoriesChanged = true;
  }
  if (state.titleEditing && !event.target.closest("#titleBtn")) {
    changed = saveTitleEdit() || changed;
  }
  if (changed) render();
  else if (accessoriesChanged) renderAccessoriesOnly();
});

function settingsChanged() {
  vscode.postMessage({ type: "settingsChanged", settings: { mode: state.settings.mode, model: state.settings.model } });
}

function submissionIdentityIds(items) {
  return (items || []).map(item => String(item?.id || "")).filter(Boolean);
}

function createPendingSubmissionScrollIntent() {
  return {
    sessionId: state.activeSessionId,
    conversationMessageIds: submissionIdentityIds(activeSession().messages),
    queueItemIds: submissionIdentityIds(state.queue)
  };
}

function acknowledgePendingSubmissionScroll(sessions, activeSessionId, queue) {
  const pending = state.pendingSubmissionScrollIntent;
  if (!pending || !activeSessionId || pending.sessionId !== activeSessionId) return false;
  const session = (sessions || []).find(item => item.id === activeSessionId);
  if (!session) return false;
  const previousMessageIds = new Set(pending.conversationMessageIds);
  const previousQueueIds = new Set(pending.queueItemIds);
  const hasNewConversationItem = submissionIdentityIds(session.messages).some(itemId => !previousMessageIds.has(itemId));
  const hasNewQueueItem = submissionIdentityIds(queue).some(itemId => !previousQueueIds.has(itemId));
  if (!hasNewConversationItem && !hasNewQueueItem) return false;
  state.pendingSubmissionScrollIntent = null;
  state.userScrolledUp = false;
  return true;
}

function submit() {
  state._interrupted = null;
  state.draft = promptBody();
  if (!canSubmit()) return;
  const payload = {
    prompt: state.draft,
    skill: state.skill,
    command: state.command,
    attachments: state.attachments,
    editorContext: currentContextAttachment(),
    settings: state.settings,
    replaceFromIndex: state.modifyingIndex
  };
  if (state.editingQueueId) {
    vscode.postMessage({ type: "queueEdit", id: state.editingQueueId, item: payload });
    clearComposerDraft();
    render();
    return;
  }
  state.pendingSubmissionScrollIntent = createPendingSubmissionScrollIntent();
  vscode.postMessage({ type: "sendPrompt", ...payload });
  state.userScrolledUp = false;
  if (!state.running || state.command === "/steer") {
    state.awaitingAssistantCount = (activeSession().messages || []).filter(message => message.role === "assistant").length;
  }
  clearComposerDraft();
  render();
}

window.addEventListener("message", event => {
  const message = event.data;
  if (message.type === "state") {
    const previousActiveSessionId = state.activeSessionId;
    const previousPermissionRequestId = state.permission?.requestId;
    const hadStructuralOverlay = state.historyOpen || state.memoryOpen || state.titleEditing || Boolean(state.renamingSessionId);
    const forceSubmissionBottom = acknowledgePendingSubmissionScroll(
      message.sessions || [],
      message.activeSessionId,
      message.queue || []
    );
    let composerReset = false;
    state.sessions = message.sessions || [];
    state.activeSessionId = message.activeSessionId;
    state.settings = { ...state.settings, ...(message.settings || {}) };
    state.queue = message.queue || [];
    if (state.editingQueueId && !state.queue.some(item => item.id === state.editingQueueId)) {
      clearComposerDraft();
      composerReset = true;
    }
    state.models = message.models || [];
    state.diagnostics = message.diagnostics || [];
    state.editorContext = message.editorContext;
    state.permission = message.permission || null;
    if (!state.permission || state.permission.requestId !== previousPermissionRequestId) {
      state.permissionResolving = false;
      state.permissionDraft = "";
    }
    const sessionChanged = Boolean(previousActiveSessionId) && previousActiveSessionId !== state.activeSessionId;
    const permissionChanged = previousPermissionRequestId !== state.permission?.requestId;
    const needsFullRender = !document.querySelector("#conversationRegion")
      || sessionChanged
      || permissionChanged
      || composerReset
      || hadStructuralOverlay;
    if (needsFullRender) {
      state.renamingSessionId = null;
      render({ forceSubmissionBottom });
    } else {
      renderLiveRegions({ forceSubmissionBottom });
    }
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
    focusPromptAtEnd();
  }
  if (message.type === "pastedFileReady") {
    for (const item of message.attachments || []) {
      if (!state.attachments.some(existing => existing.uri === item.uri || existing.path === item.path)) state.attachments.push(item);
    }
    render();
    focusPromptAtEnd();
  }
  if (message.type === "assistantChunk") {
    const session = activeSession();
    const assistant = session.messages?.find(item => item.id === message.messageId);
    if (assistant) assistant.text += message.chunk;
    renderLiveRegions();
  }
  if (message.type === "thinkingUpdate") {
    const session = activeSession();
    const assistant = session.messages?.find(item => item.id === message.messageId);
    if (assistant) assistant.thinking = message.thinking || [];
    renderLiveRegions();
  }
  if (message.type === "planUpdate") {
    const session = activeSession();
    const assistant = session.messages?.find(item => item.id === message.messageId);
    if (assistant) assistant.plan = message.plan || [];
    renderLiveRegions();
  }
  if (message.type === "focusInput") {
    document.querySelector("#prompt")?.focus();
  }
  if (message.type === "permissionRequest") {
    state.permissionResolving = false;
    state.permission = {
      requestId: message.requestId,
      sessionId: message.sessionId,
      title: message.title,
      question: message.question,
      choices: message.choices || [],
      allowFeedback: message.allowFeedback !== false,
      diff: message.diff || null,
      previewAction: message.previewAction || ""
    };
    render();
  }
  if (message.type === "permissionResolved") {
    state.permissionResolving = false;
    state.permission = null;
    state.permissionDraft = "";
    render();
  }
  if (message.type === "permissionResolveFailed") {
    state.permissionResolving = false;
    render();
  }
});

vscode.postMessage({ type: "ready" });
