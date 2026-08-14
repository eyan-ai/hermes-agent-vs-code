const vscode = require("vscode");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");
const { createChatParser } = require("./lib/chat-parser");
const { AcpClient } = require("./lib/acp-client");
const { createAcpRenderer } = require("./lib/acp-render");
const { changedLineIndices, locatePreviewForRemoval } = require("./lib/diff-preview");
const { TurnLifecycle, TurnCancelledError, isTurnCancelled } = require("./lib/turn-lifecycle");
const { buildCommandCatalog, DEFAULT_ACP_COMMANDS, parseQuickCommands, resolveCommand } = require("./lib/command-catalog");
const { textOf } = require("./lib/acp-text");
const { PromptQueue, resolveSubmission } = require("./lib/prompt-queue");
const { SessionCancellationBarrier } = require("./lib/session-cancellation-barrier");
const { forkAcpSession, installAcpSessionReplacement } = require("./lib/acp-session-handoff");
const { buildGeneratedDocumentCandidates } = require("./lib/generated-document");
const { configuredModelState, normalizeModelState, resolveSelectedModel } = require("./lib/model-settings");
const { prepareDocumentReviewBatch } = require("./lib/document-review");

const VIEW_ID = "hermesAgent.sidebar";
const EDITOR_VIEW_TYPE = "hermesAgent.editorSession";
const REVIEW_VIEW_TYPE = "hermesAgent.documentReview";
const SESSION_KEY = "hermesAgent.sessions";
const FINAL_ANSWER_ONLY_PROMPT = `The task execution has ended, but no user-facing final answer was produced.

Return only the final response for the user.

Requirements:
- Do not include reasoning or hidden thinking.
- Do not include planning or progress updates.
- Do not repeat tool calls.
- Do not call additional tools.
- Briefly state the result.
- If the task failed or is incomplete, explain that clearly.
- The response must not be empty.`;

const HERMES_HOME = path.join(os.homedir(), ".hermes");
const HERMES_DOC_PATHS = {
  "SOUL.md": path.join(HERMES_HOME, "SOUL.md"),
  "USER.md": path.join(HERMES_HOME, "memories", "USER.md"),
  "MEMORY.md": path.join(HERMES_HOME, "memories", "MEMORY.md")
};

let _hermesSkills = null;
let _hermesConfig = null;
let _activeProvider;
function hermesSkills() {
  if (_hermesSkills) return _hermesSkills;
  const skills = [];
  const seen = new Set();
  /** Recursively collect every SKILL.md under a root, parsing name + description. */
  function collectSkills(root) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const full = path.join(root, entry.name);
      // Follow symlinks: many installed skills (e.g. hub-installed ones) are
      // symlinked into the skills root, and Dirent.isDirectory() is false for
      // them — statSync resolves the target.
      let isDir = entry.isDirectory();
      if (!isDir && entry.isSymbolicLink()) {
        try { isDir = fs.statSync(full).isDirectory(); } catch { continue; }
      }
      if (!isDir) continue;
      // A directory may be a category (creative/ascii-art) or a skill itself.
      const mdPath = path.join(full, "SKILL.md");
        if (fs.existsSync(mdPath)) {
          try {
            const md = fs.readFileSync(mdPath, "utf8");
            let name = entry.name;
            let desc = "";
            const nameMatch = md.match(/^name:\s*(.+)$/m);
            if (nameMatch) name = nameMatch[1].trim();
            const descMatch = md.match(/^description:\s*(.+)$/m);
            if (descMatch) desc = descMatch[1].trim();
            if (!seen.has(name)) {
              seen.add(name);
              skills.push({ name, description: desc });
            }
          } catch { /* skip unreadable skills */ }
        } else {
          collectSkills(full);
        }
    }
  }
  // Scan the profile skills root (local + hub-installed) — this mirrors the
  // exact set `hermes skills list --enabled-only` shows, including skills
  // nested under category directories.
  collectSkills(path.join(HERMES_HOME, "skills"));
  // Also scan skill manifests from Hermes' known skill registry path
  try {
    const manifestDir = path.join(HERMES_HOME, "installed");
    const manifestEntries = fs.readdirSync(manifestDir, { withFileTypes: true });
    for (const entry of manifestEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(manifestDir, entry.name), "utf8"));
        const name = data.name || entry.name.replace(".json", "");
        const desc = data.description || data.desc || "";
        if (name && !seen.has(name)) {
          seen.add(name);
          skills.push({ name, description: desc });
        }
      } catch { /* skip */ }
    }
  } catch { /* no installed dir */ }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  _hermesSkills = skills;
  return skills;
}
function hermesConfig() {
  if (_hermesConfig) return _hermesConfig;
  const result = { model: "", provider: "", quickCommands: {} };
  try {
    const yaml = fs.readFileSync(path.join(HERMES_HOME, "config.yaml"), "utf8");
    const lines = yaml.split("\n");
    result.quickCommands = parseQuickCommands(yaml);
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^model:/.test(lines[index])) continue;
      for (let next = index + 1; next < lines.length; next += 1) {
        const line = lines[next];
        if (/^\S/.test(line)) break;
        const match = line.match(/^\s*(default|provider):\s*["']?([^"'\s]+)/);
        if (match) result[match[1] === "default" ? "model" : match[1]] = match[2];
      }
    }
  } catch { /* config absent — leave defaults */ }
  _hermesConfig = result;
  return result;
}

let _hermesModelState = null;
function hermesModelState() {
  if (_hermesModelState) return _hermesModelState;
  const config = hermesConfig();
  let providers = {};
  try {
    const catalog = JSON.parse(fs.readFileSync(path.join(HERMES_HOME, "cache", "model_catalog.json"), "utf8"));
    providers = catalog.providers || {};
  } catch { /* catalog absent */ }
  _hermesModelState = configuredModelState(config, providers);
  return _hermesModelState;
}


function activate(context) {
  const provider = new HermesSidebarProvider(context);
  _activeProvider = provider;
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand("hermesAgent.open", () => {
      return vscode.commands.executeCommand("workbench.view.extension.hermesAgent");
    }),
    vscode.commands.registerCommand("hermesAgent.openEditorSession", () => {
      return provider.openEditorSession();
    }),
    vscode.commands.registerCommand("hermesAgent.newSession", () => {
      return provider.newSession();
    }),
    vscode.commands.registerCommand("hermesAgent.focusInput", () => {
      provider.post({ type: "focusInput" });
    }),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      // Track the last active document across focus changes (the webview
      // steals focus when typing, so activeTextEditor goes undefined there).
      if (editor) provider.lastActiveEditor = editor;
      provider.refreshEditorContext();
      provider.ensureEditorIsolation();
    }),
    vscode.window.tabGroups.onDidChangeTabs(() => provider.ensureEditorIsolation()),
    vscode.window.tabGroups.onDidChangeTabGroups(() => provider.ensureEditorIsolation()),
    // When every editor tab is closed, the default context must be cleared
    // instead of pointing at a stale closed document. activeTextEditor can
    // be undefined just from focus loss, so clear only on an actual close.
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (provider.lastActiveEditor && provider.lastActiveEditor.document === doc) {
        provider.lastActiveEditor = undefined;
        provider.refreshEditorContext();
      }
    }),
    vscode.window.onDidChangeTextEditorSelection(() => provider.refreshEditorContext()),
    { dispose: () => provider.dispose() }
  );
}

function deactivate() {
  const provider = _activeProvider;
  _activeProvider = undefined;
  return provider?.dispose();
}

class HermesSidebarProvider {
  constructor(context) {
    this.context = context;
    this.view = undefined;
    this.panels = new Set();
    this.sessions = this.loadSessions();
    this.activeSessionId = this.sessions[0]?.id;
    this.cliTurns = new Map();
    this.lastActiveEditor = vscode.window.activeTextEditor;
    // ACP transport state (lazy): one shared `hermes acp` process for all
    // sessions; per-session mapping uiSession.id → acp session_id.
    this.acp = undefined;
    this.acpSessions = new Map();
    this.acpRenderers = new Map();
    this.acpAvailableCommands = new Map();
    this.acpCommandCaptures = new Map();
    this.retiredAcpSessions = new Set();
    this.activeTurns = new Map();
    this.mockTurns = new Set();
    this.promptQueue = new PromptQueue(id);
    this.cancellationBarriers = new SessionCancellationBarrier();
    this.drainingSessions = new Set();
    this.steeringQueueItems = new Set();
    this._stoppingPromise = null;
    this.pendingPermission = undefined;
    this.permissionQueue = [];
    this.permissionBatchState = new Map();
    this.permissionSessionGrants = new Map();
    this._permissionReminderTimer = undefined;
    this.docDiffDecorations = [];
    this.diffPreviewDocuments = new Map();
    this._diffPreviewProvider = vscode.workspace.registerTextDocumentContentProvider("hermes-diff-preview", {
      provideTextDocumentContent: uri => this.diffPreviewDocuments.get(uri.toString()) || ""
    });
    this._newFilePreviewProvider = vscode.workspace.registerTextDocumentContentProvider("hermes-new-file-preview", {
      provideTextDocumentContent: uri => this.diffPreviewDocuments.get(uri.toString()) || ""
    });
    this.context.subscriptions.push(this._diffPreviewProvider, this._newFilePreviewProvider);
    this._documentReviewPanel = undefined;
    this._documentReviewContext = undefined;
    this._movingEditorTabs = false;
  }

  resolveWebviewView(view) {
    this.view = view;
    this.configureWebview(view.webview);
  }

  post(message, explicitSessionId) {
    const messageSessionId = explicitSessionId || this.uiSessionIdForMessage(message);
    if (!messageSessionId || this.activeSessionId === messageSessionId) {
      this.view?.webview.postMessage(message);
    }
    for (const panel of this.panels) {
      if (!messageSessionId || panel.sessionId === messageSessionId) panel.webview.postMessage(message);
    }
  }

  uiSessionIdForMessage(message) {
    if (!message?.sessionId) return undefined;
    if (this.sessions.some(session => session.id === message.sessionId)) return message.sessionId;
    for (const [uiSessionId, acpSessionId] of this.acpSessions) {
      if (acpSessionId === message.sessionId) return uiSessionId;
    }
    return undefined;
  }

  configureWebview(webview, panel) {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
        vscode.Uri.joinPath(this.context.extensionUri, "resources")
      ]
    };
    webview.html = this.html(webview);
    webview.onDidReceiveMessage(message => this.onMessage(message, panel));
  }

  loadSessions() {
    const saved = this.context.globalState.get(SESSION_KEY);
    if (Array.isArray(saved) && saved.length > 0) {
      return saved.map(session => ({
        ...session,
        messages: (session.messages || [])
          .filter(message => !(message.role === "system" && message.command === "/deny"))
          .map(message => message.role === "assistant" && message.status === "running"
            ? { ...message, status: "stopped", finishedAt: message.finishedAt || Date.now() }
            : message)
      }));
    }
    return [createSession("Untitled")];
  }

  saveSessions() {
    return this.context.globalState.update(SESSION_KEY, this.sessions);
  }

  activeSession(sessionId = this.activeSessionId) {
    let session = this.sessions.find(item => item.id === sessionId);
    if (!session) {
      session = this.sessions[0] || createSession("Untitled");
      if (!this.sessions.length) this.sessions.push(session);
      if (!sessionId || sessionId === this.activeSessionId) this.activeSessionId = session.id;
    }
    return session;
  }

  async newSession(activate = true) {
    const session = createSession("Untitled");
    const configuredModels = hermesModelState();
    session.settings = {
      mode: lastMode(this.context),
      model: lastModel(this.context, configuredModels.current)
    };
    this.sessions.unshift(session);
    if (activate) this.activeSessionId = session.id;
    await this.saveSessions();
    // Surface the active document as default context immediately. If the
    // last-active editor is stale (extension activated after the file was
    // opened), pick up the currently focused editor as a fallback.
    if (!this.lastActiveEditor && vscode.window.activeTextEditor) {
      this.lastActiveEditor = vscode.window.activeTextEditor;
    }
    this.refreshEditorContext();
    this.postState();
    return session;
  }

  async openEditorSession() {
    const session = await this.newSession(false);
    await this.ensureEditorIsolation();
    const targetColumn = this.findAgentColumn() || this.columnRightOfDocuments();
    const panel = vscode.window.createWebviewPanel(
      EDITOR_VIEW_TYPE,
      session.title || "Hermes Agent",
      targetColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media"),
          vscode.Uri.joinPath(this.context.extensionUri, "resources")
        ]
      }
    );
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "resources", "nous-girl.png");
    // Bind the tab to its session so the title follows the session title.
    panel.sessionId = session.id;
    this.panels.add(panel);
    this.configureWebview(panel.webview, panel);
    panel.onDidDispose(() => {
      this.panels.delete(panel);
    });
    this.refreshEditorContext();
  }

  /** Keep editor-session tab titles in sync with their session title. */
  updatePanelTitles() {
    for (const panel of this.panels) {
      if (panel.sessionId) {
        const session = this.sessions.find(s => s.id === panel.sessionId);
        if (session && session.title && session.title !== "Untitled") {
          panel.title = session.title;
        }
      }
    }
  }

  findAgentColumn() {
    let column;
    for (const panel of this.panels) {
      if (panel.viewColumn !== undefined) column = Math.max(column || 0, panel.viewColumn);
    }
    for (const group of vscode.window.tabGroups.all) {
      if (group.tabs.some(tab => this.isHermesTab(tab))) column = Math.max(column || 0, group.viewColumn);
    }
    return column;
  }

  isHermesTab(tab) {
    if (!(tab?.input instanceof vscode.TabInputWebview)) return false;
    return tab.input.viewType === EDITOR_VIEW_TYPE
      || tab.input.viewType === `mainThreadWebview-${EDITOR_VIEW_TYPE}`;
  }

  isReviewTab(tab) {
    if (!(tab?.input instanceof vscode.TabInputWebview)) return false;
    return tab.input.viewType === REVIEW_VIEW_TYPE
      || tab.input.viewType === `mainThreadWebview-${REVIEW_VIEW_TYPE}`;
  }

  isDocumentTab(tab) {
    const input = tab?.input;
    return [
      vscode.TabInputText,
      vscode.TabInputTextDiff,
      vscode.TabInputCustom,
      vscode.TabInputNotebook,
      vscode.TabInputNotebookDiff
    ].filter(Boolean).some(Type => input instanceof Type);
  }

  tabUri(tab) {
    const input = tab?.input;
    if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputNotebook) {
      return input.uri;
    }
    if (input instanceof vscode.TabInputTextDiff || input instanceof vscode.TabInputNotebookDiff) {
      return input.modified;
    }
    return null;
  }

  agentColumns() {
    const columns = new Set(
      [...this.panels].map(panel => panel.viewColumn).filter(value => value !== undefined)
    );
    for (const group of vscode.window.tabGroups.all) {
      if (group.tabs.some(tab => this.isHermesTab(tab))) {
        columns.add(group.viewColumn);
      }
    }
    return columns;
  }

  columnRightOfDocuments() {
    const documentColumns = vscode.window.tabGroups.all
      .filter(group => group.tabs.some(tab => this.isDocumentTab(tab)))
      .map(group => group.viewColumn);
    if (!documentColumns.length) return vscode.ViewColumn.Beside;
    return Math.min(vscode.ViewColumn.Nine, Math.max(...documentColumns) + 1);
  }

  findExistingDocumentColumn() {
    const agentColumns = this.agentColumns();
    const groups = vscode.window.tabGroups.all.filter(group => !agentColumns.has(group.viewColumn));
    const withDocuments = groups.find(group => group.tabs.some(tab => this.isDocumentTab(tab)));
    return withDocuments?.viewColumn || groups[0]?.viewColumn;
  }

  async ensureDocumentColumn() {
    const existing = this.findExistingDocumentColumn();
    if (existing !== undefined) return existing;
    const panel = [...this.panels].find(item => item.viewColumn !== undefined);
    if (panel) panel.reveal(panel.viewColumn, false);
    await vscode.commands.executeCommand("workbench.action.newGroupLeft");
    return vscode.window.tabGroups.activeTabGroup?.viewColumn || vscode.ViewColumn.One;
  }

  async ensureEditorIsolation() {
    if (this._movingEditorTabs) return;
    const initialAgentColumns = this.agentColumns();
    if (!initialAgentColumns.size) return;
    this._movingEditorTabs = true;
    try {
      const documentColumns = vscode.window.tabGroups.all
        .filter(group => !initialAgentColumns.has(group.viewColumn) && group.tabs.some(tab => this.isDocumentTab(tab)))
        .map(group => group.viewColumn);
      let targetAgentColumn = Math.max(...initialAgentColumns);
      if (documentColumns.length && targetAgentColumn <= Math.max(...documentColumns)) {
        targetAgentColumn = Math.min(vscode.ViewColumn.Nine, Math.max(...documentColumns) + 1);
      }
      for (const panel of this.panels) {
        if (panel.viewColumn !== targetAgentColumn) panel.reveal(targetAgentColumn, true);
      }

      const agentColumns = this.agentColumns();
      const misplacedDocuments = vscode.window.tabGroups.all.flatMap(group =>
        agentColumns.has(group.viewColumn)
          ? group.tabs.filter(tab => this.isDocumentTab(tab)).map(tab => ({ group, tab }))
          : []
      );
      for (const { group, tab } of misplacedDocuments) {
        const targetColumn = await this.ensureDocumentColumn();
        const opened = await this.openDocumentTab(tab, targetColumn);
        if (opened && group.tabs.includes(tab)) await vscode.window.tabGroups.close(tab, true);
      }
    } finally {
      setTimeout(() => { this._movingEditorTabs = false; }, 75);
    }
  }

  async openDocumentTab(tab, viewColumn) {
    const input = tab?.input;
    if (input instanceof vscode.TabInputTextDiff || input instanceof vscode.TabInputNotebookDiff) {
      try {
        await vscode.commands.executeCommand("vscode.diff", input.original, input.modified, tab.label, {
          preview: false,
          preserveFocus: false,
          viewColumn
        });
        return true;
      } catch (error) {
        vscode.window.showErrorMessage(`Unable to move ${tab.label}: ${error.message}`);
        return false;
      }
    }
    const uri = this.tabUri(tab);
    return uri ? this.openDocumentUri(uri, { preview: false, viewColumn }) : false;
  }

  async onMessage(message, panel) {
    const sessionId = panel?.sessionId || this.activeSessionId;
    switch (message.type) {
      case "ready":
        this.postState();
        this.refreshEditorContext();
        break;
      case "newSession":
        {
          const session = await this.newSession(!panel);
          if (panel) panel.sessionId = session.id;
          this.postState();
        }
        break;
      case "selectSession":
        if (panel) panel.sessionId = message.id;
        else this.activeSessionId = message.id;
        await this.saveSessions();
        this.postState();
        // Re-sync the server-generated title for a previously-open session
        // (the AI title may have been generated after we last saw it).
        {
          const selected = this.sessions.find(s => s.id === message.id);
          if (selected && selected.acpSessionId) {
            this.syncAcpTitle(selected.acpSessionId, selected.id);
          }
        }
        break;
      case "renameSession":
        await this.renameSession(message.id, message.title);
        break;
      case "deleteSession":
        await this.deleteSession(message.id);
        if (panel && !this.sessions.some(session => session.id === panel.sessionId)) {
          panel.sessionId = this.sessions[0]?.id;
          this.postState();
        }
        break;
      case "searchWorkspace":
        await this.searchWorkspace(message.query, sessionId);
        break;
      case "pickLocal":
        await this.pickLocal(sessionId);
        break;
      case "pastedFile":
        await this.handlePastedFile(message, sessionId);
        break;
      case "sendPrompt":
        await this.sendPrompt(message, sessionId, panel);
        break;
      case "queueEdit":
        this.promptQueue.edit(sessionId, message.id, message.item || {});
        this.postState();
        break;
      case "queueDelete":
        this.promptQueue.remove(sessionId, message.id);
        this.postState();
        break;
      case "queueSteer":
        await this.steerQueuedPrompt(message.id, sessionId);
        break;
      case "copyAnswer":
        await vscode.env.clipboard.writeText(String(message.text || ""));
        break;
      case "acceptDiff": {
        await this.resolveDiffPermission(true, { sessionId });
        break;
      }
      case "rejectDiff": {
        await this.resolveDiffPermission(false, { sessionId });
        break;
      }
      case "permissionResponse": {
        const decision = message.decision || (message.allow ? "once" : "deny");
        await this.resolveDiffPermission(decision, {
          sessionId: message.sessionId || sessionId,
          requestId: message.requestId,
          optionId: message.optionId,
          feedback: message.feedback
        });
        break;
      }
      case "reopenPermissionPreview":
        await this.reopenPermissionPreview(message.sessionId || sessionId, message.requestId);
        break;
      case "openLink": {
        const url = String(message.url || "");
        if (/^https?:\/\//i.test(url)) await vscode.env.openExternal(vscode.Uri.parse(url));
        break;
      }
      case "stop":
        await this.stop(sessionId);
        break;
      case "openAttachment":
        await this.openAttachment(message.attachment);
        break;
      case "openGeneratedDocument":
        await this.openGeneratedDocument(message.path);
        break;
      case "openMemoryDoc":
        await this.openMemoryDoc(message.file);
        break;
      case "settingsChanged":
        await this.updateSessionSettings(sessionId, message.settings || {});
        break;
      default:
        break;
    }
  }

  async renameSession(id, title) {
    const session = this.sessions.find(item => item.id === id);
    if (!session) return;
    session.title = (title || "Untitled").trim() || "Untitled";
    session.updatedAt = Date.now();
    await this.saveSessions();
    this.postState();
  }

  modelStateForSession(session) {
    const runtime = session?.modelState;
    return runtime?.options?.length ? runtime : hermesModelState();
  }

  async updateSessionSettings(sessionId, settings) {
    const session = this.activeSession(sessionId);
    const previous = { ...(session.settings || {}) };
    const mode = settings.mode === "Manual" ? "Manual" : "Auto";
    const modelState = this.modelStateForSession(session);
    const selectedModel = resolveSelectedModel(settings.model, modelState.options, modelState.current);
    const acpSessionId = this.acpSessions.get(session.id);
    if (settings.model && selectedModel !== settings.model) {
      vscode.window.showWarningMessage("The selected Hermes model is no longer available.");
      this.postState();
      return false;
    }
    if (selectedModel && selectedModel !== previous.model && acpSessionId && this.acp) {
      try {
        await this.acp.request("session/set_model", {
          sessionId: acpSessionId,
          modelId: selectedModel
        });
      } catch (error) {
        vscode.window.showErrorMessage(`Unable to switch Hermes model: ${error.message}`);
        this.postState();
        return false;
      }
    }
    session.settings = { ...previous, mode, model: selectedModel };
    if (session.modelState?.options?.length && selectedModel) session.modelState.current = selectedModel;
    saveLastMode(this.context, mode);
    if (selectedModel) saveLastModel(this.context, selectedModel);
    await this.saveSessions();
    this.postState();
    return true;
  }

  async deleteSession(id) {
    if (this.sessions.length <= 1) return;
    const index = this.sessions.findIndex(item => item.id === id);
    if (index < 0) return;
    await this.cancelPermissionsForSession(id);
    // Drop the ACP session mapping (the server session stays alive until
    // its process exits; the renderer is gone with the UI session).
    const acpSessionId = this.acpSessions.get(id);
    if (acpSessionId) {
      this.permissionSessionGrants.delete(acpSessionId);
      this.acpRenderers.delete(acpSessionId);
      this.acpAvailableCommands.delete(acpSessionId);
      this.acpCommandCaptures.delete(acpSessionId);
      this.acpSessions.delete(id);
    }
    this.promptQueue.clear(id);
    this.sessions.splice(index, 1);
    if (this.activeSessionId === id) {
      this.activeSessionId = this.sessions[Math.max(0, index - 1)]?.id || this.sessions[0]?.id;
    }
    for (const panel of this.panels) {
      if (panel.sessionId === id) panel.sessionId = this.sessions[0]?.id;
    }
    await this.saveSessions();
    this.postState();
  }

  async searchWorkspace(query = "", sessionId) {
    const folders = vscode.workspace.workspaceFolders || [];
    if (!folders.length) {
      this.post({ type: "workspaceItems", items: [] }, sessionId);
      return;
    }
    const lower = query.toLowerCase();
    const files = await vscode.workspace.findFiles("**/*", "{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}", 120);
    const items = files
      .map(uri => toAttachment(uri, "file"))
      .filter(item => !lower || item.name.toLowerCase().includes(lower) || item.path.toLowerCase().includes(lower));
    // Files inside the opened folder only — the folder itself is not listed.
    this.post({ type: "workspaceItems", items: items.slice(0, 80) }, sessionId);
  }

  async pickLocal(sessionId) {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: true,
      canSelectMany: true,
      openLabel: "Add files or folders"
    });
    if (!uris) return;
    const attachments = [];
    for (const uri of uris) {
      const stat = await vscode.workspace.fs.stat(uri);
      const type = stat.type & vscode.FileType.Directory ? "folder" : "file";
      attachments.push(toAttachment(uri, type));
    }
    this.post({
      type: "localPicked",
      attachments
    }, sessionId);
  }

  async openAttachment(attachment) {
    const uri = this.attachmentUri(attachment);
    if (!uri) return;
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type & vscode.FileType.Directory) {
      await vscode.commands.executeCommand("revealFileInOS", uri);
      return;
    }
    await this.openDocumentUri(uri, { preview: true });
  }

  async openGeneratedDocument(rawPath) {
    const value = String(rawPath || "").trim();
    if (!value) return;

    const candidates = [];
    if (/^file:/i.test(value)) {
      try { candidates.push(vscode.Uri.parse(value)); } catch { /* invalid URI */ }
    }
    const fileCandidates = buildGeneratedDocumentCandidates(value, {
      workspaceFolders: (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath),
      cwd: this.workspaceCwd(),
      home: os.homedir()
    });
    candidates.push(...fileCandidates.map(candidate => vscode.Uri.file(candidate)));

    for (const uri of candidates) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type & vscode.FileType.Directory) continue;
        await this.openDocumentUri(uri, { preview: true });
        return;
      } catch { /* try the next candidate */ }
    }

    vscode.window.showWarningMessage(`Hermes could not find the generated document: ${value}`);
  }

  async openDocumentUri(uri, { preview = true, viewColumn } = {}) {
    const targetColumn = viewColumn ?? await this.ensureDocumentColumn();
    try {
      await vscode.commands.executeCommand("vscode.open", uri, {
        preview,
        preserveFocus: false,
        viewColumn: targetColumn
      });
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(`Unable to open ${path.basename(uri.fsPath || uri.path)}: ${error.message}`);
      return false;
    }
  }

  attachmentUri(attachment) {
    if (!attachment) return null;
    if (attachment.uri) return vscode.Uri.parse(attachment.uri);
    const rawPath = String(attachment.path || "");
    if (!rawPath) return null;
    if (path.isAbsolute(rawPath)) return vscode.Uri.file(rawPath);
    if (rawPath.startsWith("~/")) return vscode.Uri.file(path.join(os.homedir(), rawPath.slice(2)));
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || this.workspaceCwd();
    return vscode.Uri.file(path.join(folder, rawPath));
  }

  async handlePastedFile(message, sessionId) {
    const name = path.basename(String(message.name || "pasted-file"));
    const match = String(message.dataUrl || "").match(/^data:.*?;base64,(.*)$/);
    if (!match) return;
    const dir = vscode.Uri.joinPath(this.context.globalStorageUri, "pasted-attachments");
    await vscode.workspace.fs.createDirectory(dir);
    const safe = name.replace(/[^\w.\- ()@]/g, "_") || "pasted-file";
    const uri = vscode.Uri.joinPath(dir, `${Date.now()}-${safe}`);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(match[1], "base64"));
    this.post({ type: "pastedFileReady", attachments: [toAttachment(uri, "file")] }, sessionId);
  }

  async openMemoryDoc(file) {
    const allowed = new Set(["SOUL.md", "USER.md", "MEMORY.md"]);
    const name = allowed.has(file) ? file : "MEMORY.md";
    const filePath = HERMES_DOC_PATHS[name];
    const uri = vscode.Uri.file(filePath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      // First visit: create the real Hermes doc file with a header.
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(filePath)));
      await vscode.workspace.fs.writeFile(uri, Buffer.from(`# ${name.replace(/\.md$/, "")}\n\n`));
    }
    try {
      await this.openDocumentUri(uri, { preview: false });
    } catch (error) {
      vscode.window.showErrorMessage(`Unable to open ${name}: ${error.message}`);
    }
  }

  findDocumentColumn() {
    return this.findExistingDocumentColumn() || vscode.ViewColumn.One;
  }

  isSessionRunning(sessionId) {
    const acpTurn = this.activeTurns.get(sessionId);
    return Boolean(
      (acpTurn && !acpTurn.lifecycle.cancelled)
      || this.cliTurns.has(sessionId)
      || this.mockTurns.has(sessionId)
    );
  }

  queuePayload(message, resolution) {
    return {
      prompt: resolution.prompt,
      command: resolution.command,
      skill: resolution.skill,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      editorContext: message.editorContext || null,
      settings: message.settings || null,
      replaceFromIndex: Number.isInteger(message.replaceFromIndex) ? message.replaceFromIndex : undefined
    };
  }

  async sendPrompt(message, sessionId = this.activeSessionId, panel) {
    await this.cancellationBarriers.wait(sessionId);
    if (this._stoppingPromise) await this._stoppingPromise;
    if (message.command && message.command !== "/steer") {
      await this.dispatchCommand(message, sessionId, panel);
      return;
    }
    const active = this.isSessionRunning(sessionId);
    const resolution = resolveSubmission(message, active);
    if (resolution.action === "ignore") return;
    if (resolution.action === "steer") {
      const steered = await this.steerPrompt(this.queuePayload(message, resolution), sessionId);
      if (!steered) {
        this.promptQueue.enqueue(sessionId, this.queuePayload(message, { ...resolution, action: "queue" }));
        this.postState();
      }
      return;
    }
    if (resolution.action === "queue") {
      this.promptQueue.enqueue(sessionId, this.queuePayload(message, resolution));
      this.postState();
      return;
    }
    await this.startPrompt(this.queuePayload(message, resolution), sessionId);
  }

  availableCommandsForSession(sessionId) {
    const acpSessionId = this.acpSessions.get(sessionId);
    return this.acpAvailableCommands.get(acpSessionId) || DEFAULT_ACP_COMMANDS;
  }

  commandOptions(sessionId) {
    return {
      availableCommands: this.availableCommandsForSession(sessionId),
      quickCommands: hermesConfig().quickCommands
    };
  }

  async appendCommandNotice(sessionId, command, text, kind = "info") {
    const session = this.activeSession(sessionId);
    session.messages.push({
      id: id(),
      role: "system",
      command: String(command || ""),
      text: String(text || ""),
      kind,
      createdAt: Date.now()
    });
    session.updatedAt = Date.now();
    await this.saveSessions();
    this.postState();
  }

  resolveCommandInvocation(commandName, prompt, sessionId) {
    let command = String(commandName || "").trim();
    let args = String(prompt || "").trim();
    for (let depth = 0; depth < 5; depth += 1) {
      const entry = resolveCommand(command, this.commandOptions(sessionId));
      if (!entry) return { command, args, entry: undefined };
      if (entry.executor !== "alias") return { command: entry.name, args, entry };
      const target = String(entry.target || "").trim();
      const parts = target.split(/\s+/);
      command = parts.shift() || "";
      args = [...parts, args].filter(Boolean).join(" ");
    }
    return { command, args, entry: undefined };
  }

  applyAcpSessionState(session, acpSessionId, models) {
    this.acpSessions.set(session.id, acpSessionId);
    session.acpSessionId = acpSessionId;
    const runtimeModels = normalizeModelState(models);
    if (runtimeModels.options.length) session.modelState = runtimeModels;
  }

  async ensureMappedAcpSession(client, session) {
    const mapped = this.acpSessions.get(session.id);
    if (mapped) return mapped;

    const persisted = String(session.acpSessionId || "").trim();
    if (persisted && !this.retiredAcpSessions.has(persisted)) {
      this.acpSessions.set(session.id, persisted);
      try {
        const resumed = await client.request("session/resume", {
          cwd: this.workspaceCwd(),
          sessionId: persisted,
          mcpServers: []
        });
        this.applyAcpSessionState(session, persisted, resumed?.models);
        return persisted;
      } catch {
        if (this.acpSessions.get(session.id) === persisted) this.acpSessions.delete(session.id);
        session.acpSessionId = "";
      }
    }

    const created = await client.request("session/new", { cwd: this.workspaceCwd(), mcpServers: [], skip_memory: true });
    const acpSessionId = String(created?.sessionId || "").trim();
    if (!acpSessionId) throw new Error("Hermes did not return an ACP session");
    this.applyAcpSessionState(session, acpSessionId, created.models);
    return acpSessionId;
  }

  async ensureCommandAcpSession(sessionId) {
    const config = vscode.workspace.getConfiguration("hermesAgent");
    const command = config.get("command", "");
    if (!command) throw new Error("Hermes CLI is not configured.");
    const client = await this.ensureAcp(command);
    const session = this.activeSession(sessionId);
    const acpSessionId = await this.ensureMappedAcpSession(client, session);
    await this.saveSessions();
    return { client, acpSessionId };
  }

  async executeAcpCommand(command, args, sessionId) {
    if (this.isSessionRunning(sessionId)) {
      await this.appendCommandNotice(sessionId, command, "当前任务仍在运行。请先使用 /stop，或等待任务结束后再执行此命令。", "warning");
      return;
    }
    try {
      const { client, acpSessionId } = await this.ensureCommandAcpSession(sessionId);
      if (this.acpCommandCaptures.has(acpSessionId)) throw new Error("Another Hermes command is already running.");
      const capture = [];
      this.acpCommandCaptures.set(acpSessionId, capture);
      try {
        await client.request("session/prompt", {
          sessionId: acpSessionId,
          prompt: [{ type: "text", text: `${command}${args ? ` ${args}` : ""}` }]
        });
      } finally {
        this.acpCommandCaptures.delete(acpSessionId);
      }
      await this.appendCommandNotice(sessionId, command, capture.join("").trim() || `${command} completed.`);
    } catch (error) {
      await this.appendCommandNotice(sessionId, command, error.message || String(error), "error");
    }
  }

  async saveConversationSnapshot(sessionId) {
    const session = this.activeSession(sessionId);
    const savedDir = path.join(HERMES_HOME, "sessions", "saved");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "_");
    const filePath = path.join(savedDir, `hermes_vscode_conversation_${stamp}.json`);
    await fs.promises.mkdir(savedDir, { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify({
      source: "hermes-agent-vscode",
      uiSessionId: session.id,
      acpSessionId: this.acpSessions.get(session.id) || session.acpSessionId || "",
      title: session.title,
      savedAt: new Date().toISOString(),
      messages: session.messages
    }, null, 2), "utf8");
    return filePath;
  }

  async dispatchCommand(message, sessionId, panel) {
    const invocation = this.resolveCommandInvocation(message.command, message.prompt, sessionId);
    const { command, args, entry } = invocation;
    if (!entry) {
      await this.appendCommandNotice(sessionId, command || message.command, `Unknown or unavailable command: ${command || message.command}`, "error");
      return true;
    }
    if (entry.executor === "acp") {
      await this.executeAcpCommand(command, args, sessionId);
      return true;
    }
    switch (command) {
      case "/stop":
        if (await this.stop(sessionId)) {
          await this.appendCommandNotice(sessionId, command, "已停止当前任务。");
        } else {
          await this.appendCommandNotice(sessionId, command, "未能安全停止当前任务。重新加载窗口后再试。", "error");
        }
        return true;
      case "/new": {
        const session = await this.newSession(!panel);
        if (args) await this.renameSession(session.id, args);
        if (panel) panel.sessionId = session.id;
        await this.appendCommandNotice(session.id, command, `已创建新会话${args ? `：${args}` : "。"}`);
        return true;
      }
      case "/title": {
        const session = this.activeSession(sessionId);
        if (!args) await this.appendCommandNotice(sessionId, command, `当前会话标题：${session.title || "Untitled"}`);
        else {
          await this.renameSession(session.id, args);
          await this.appendCommandNotice(sessionId, command, `会话标题已更新为：${args}`);
        }
        return true;
      }
      case "/sessions":
        await this.appendCommandNotice(sessionId, command, this.sessions.map((session, index) => `${index + 1}. ${session.title || "Untitled"} (${session.id})`).join("\n"));
        return true;
      case "/resume": {
        const target = this.sessions.find(session => session.id === args || session.id.startsWith(args) || session.title === args);
        if (!args || !target) {
          await this.appendCommandNotice(sessionId, command, args ? `未找到会话：${args}` : "Usage: /resume <session id or exact title>", "error");
          return true;
        }
        if (panel) panel.sessionId = target.id;
        else this.activeSessionId = target.id;
        await this.saveSessions();
        await this.appendCommandNotice(target.id, command, `已切换到会话：${target.title || target.id}`);
        return true;
      }
      case "/model": {
        const session = this.activeSession(sessionId);
        if (!args) {
          const model = this.modelStateForSession(session).current || session.settings?.model || "unknown";
          await this.appendCommandNotice(sessionId, command, `当前模型：${model}`);
        } else {
          const changed = await this.updateSessionSettings(sessionId, { ...(session.settings || {}), model: args });
          await this.appendCommandNotice(sessionId, command, changed ? `模型已切换为：${args}` : `无法切换到模型：${args}`, changed ? "info" : "error");
        }
        return true;
      }
      case "/queue":
        if (!args) {
          await this.appendCommandNotice(sessionId, command, "Usage: /queue <prompt>", "error");
          return true;
        }
        this.promptQueue.enqueue(sessionId, { prompt: args, command: "", skill: "", attachments: [], editorContext: null });
        await this.appendCommandNotice(sessionId, command, `已加入队列：${args}`);
        if (!this.isSessionRunning(sessionId)) await this.drainQueue(sessionId);
        return true;
      case "/save":
        try {
          await this.appendCommandNotice(sessionId, command, `会话已保存：\n${await this.saveConversationSnapshot(sessionId)}`);
        } catch (error) {
          await this.appendCommandNotice(sessionId, command, `保存失败：${error.message || error}`, "error");
        }
        return true;
      case "/status":
        await this.appendCommandNotice(sessionId, command, `状态：${this.isSessionRunning(sessionId) ? "running" : "idle"}\n队列：${this.promptQueue.snapshot(sessionId).length}\n待审批：${this.pendingPermission?.uiSessionId === sessionId ? "yes" : "no"}`);
        return true;
      case "/usage": {
        const usage = this.activeSession(sessionId).usage;
        await this.appendCommandNotice(sessionId, command, usage ? `Input: ${usage.inputTokens || 0}\nOutput: ${usage.outputTokens || 0}\nTotal: ${usage.totalTokens || 0}` : "当前会话暂无可用的 token 用量数据。");
        return true;
      }
      case "/debug": {
        const session = this.activeSession(sessionId);
        await this.appendCommandNotice(sessionId, command, `UI session: ${session.id}\nACP session: ${this.acpSessions.get(session.id) || "not connected"}\nACP transport: ${this.acp ? "connected" : "disconnected"}\nTurn: ${this.isSessionRunning(session.id) ? "running" : "idle"}`);
        return true;
      }
      case "/help": {
        const catalog = buildCommandCatalog({ ...this.commandOptions(sessionId), skills: [] });
        const lines = catalog.flatMap(group => [group.name, ...(group.commands || []).map(item => `  ${item.name} — ${item.description}`)]);
        await this.appendCommandNotice(sessionId, command, lines.join("\n"));
        return true;
      }
      default:
        await this.appendCommandNotice(sessionId, command, `Command executor is unavailable: ${command}`, "error");
        return true;
    }
  }

  async startPrompt(message, sessionId = this.activeSessionId, drainAfter = true) {
    await this.cancellationBarriers.wait(sessionId);
    if (this._stoppingPromise) await this._stoppingPromise;
    const session = this.activeSession(sessionId);
    const prompt = String(message.prompt || "");
    if (Number.isInteger(message.replaceFromIndex) && message.replaceFromIndex >= 0) {
      session.messages.splice(message.replaceFromIndex);
    }
    const userMessage = {
      id: id(),
      role: "user",
      text: prompt,
      skill: message.skill || "",
      command: message.command || "",
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      editorContext: message.editorContext || null,
      createdAt: Date.now()
    };
    const assistantMessage = {
      id: id(),
      role: "assistant",
      text: "",
      status: "running",
      // No placeholder thinking: a fake "Preparing context…" row would
      // linger as noise once real reasoning streams in and merge into the
      // first genuine thought (desktop Hermes shows nothing until the model
      // actually emits reasoning_content).
      thinking: [],
      startedAt: Date.now()
    };
    session.messages.push(userMessage, assistantMessage);
    const titleSource = `${message.command || ""}${message.command && prompt ? " " : ""}${prompt}`;
    session.title = session.title === "Untitled" && titleSource ? titleSource.slice(0, 64) : session.title;
    session.updatedAt = Date.now();
    await this.saveSessions();
    this.postState();
    try {
      await this.runAgent(prompt, userMessage, assistantMessage, session.id);
    } finally {
      if (drainAfter) await this.drainQueue(session.id);
    }
  }

  async drainQueue(sessionId) {
    if (this.drainingSessions.has(sessionId)
      || this.isSessionRunning(sessionId)
      || this._stoppingPromise
      || this.cancellationBarriers.has(sessionId)) return;
    this.drainingSessions.add(sessionId);
    try {
      let next = this.promptQueue.shift(sessionId);
      while (next
        && !this.isSessionRunning(sessionId)
        && !this._stoppingPromise
        && !this.cancellationBarriers.has(sessionId)) {
        this.postState();
        await this.startPrompt(next, sessionId, false);
        next = this.promptQueue.shift(sessionId);
      }
    } finally {
      this.drainingSessions.delete(sessionId);
      this.postState();
    }
  }

  async steerQueuedPrompt(itemId, sessionId) {
    const key = `${sessionId}:${itemId}`;
    if (this.steeringQueueItems.has(key)) return;
    this.steeringQueueItems.add(key);
    try {
      const item = this.promptQueue.snapshot(sessionId).find(entry => entry.id === itemId);
      if (!item) return;
      if (this.isSessionRunning(sessionId)) {
        const steered = await this.steerPrompt(item, sessionId);
        if (steered) this.promptQueue.remove(sessionId, itemId);
      } else {
        this.promptQueue.remove(sessionId, itemId);
        await this.startPrompt({ ...item, command: "" }, sessionId);
      }
      this.postState();
    } finally {
      this.steeringQueueItems.delete(key);
    }
  }

  async steerPrompt(message, sessionId) {
    const turn = this.activeTurns.get(sessionId);
    const renderer = turn?.acpSessionId ? this.acpRenderers.get(turn.acpSessionId) : undefined;
    if (!turn?.client || !turn.acpSessionId || !renderer || turn.lifecycle.cancelled) return false;
    const prompt = String(message.prompt || "").trim();
    if (!prompt) return false;
    const session = this.activeSession(sessionId);
    const userMessage = {
      id: id(),
      role: "user",
      text: prompt,
      steer: true,
      command: "/steer",
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      editorContext: message.editorContext || null,
      createdAt: Date.now()
    };
    const assistantMessage = {
      id: id(),
      role: "assistant",
      text: "",
      status: "running",
      continuation: true,
      thinking: [],
      startedAt: Date.now()
    };
    session.messages.push(userMessage, assistantMessage);
    session.updatedAt = Date.now();
    renderer.continueWith(assistantMessage);
    renderer.ignoreNextAssistantText(/^(?:⏩\s*)?Steer queued for the active turn:/);
    turn.assistantMessage = assistantMessage;
    await this.saveSessions();
    this.postState();
    try {
      await turn.client.request("session/prompt", {
        sessionId: turn.acpSessionId,
        prompt: [{ type: "text", text: `/steer ${prompt}` }]
      });
    } catch (error) {
      assistantMessage.thinking.push({ kind: "error", title: "Steer unavailable", text: error.message || String(error), finalized: true });
      await this.saveSessions();
      this.postState();
    }
    return true;
  }

  async runAgent(prompt, userMessage, assistantMessage, sessionId) {
    const config = vscode.workspace.getConfiguration("hermesAgent");
    const command = config.get("command", "");
    if (!command) {
      assistantMessage.thinking.push({ kind: "error", title: "Agent backend not connected", text: "hermesAgent.command is empty. Using local preview response." });
      await this.mockStream(prompt, userMessage, assistantMessage, sessionId);
      return;
    }
    const useAcp = config.get("useAcp", true);
    if (useAcp) {
      try {
        await this.runAcp(command, prompt, userMessage, assistantMessage, sessionId);
        return;
      } catch (err) {
        if (assistantMessage.status === "stopped" || isTurnCancelled(err)) return;
        // ACP failed (missing extra, protocol error, …) — surface once, then
        // fall back to the CLI parser path so the extension still works.
        assistantMessage.thinking.push({ kind: "error", title: "ACP unavailable", text: `${err.message || err}\nFalling back to CLI output parsing.` });
        this.postState();
      }
    }
    await this.runCli(command, config.get("commandArgs", []), prompt, userMessage, assistantMessage, sessionId);
  }

  /**
   * Run one turn through the ACP transport (`hermes acp`).
   *
   * Streams structured session updates (thinking chunks, tool calls, message
   * deltas) into the SAME UI message protocol the CLI parser used, so the
   * webview is untouched.
   */
  async runAcp(command, prompt, userMessage, assistantMessage, sessionId) {
    const session = this.activeSession(sessionId);
    const lifecycle = new TurnLifecycle({ timeoutMs: 1500 });
    let releaseTurn;
    const released = new Promise(resolve => { releaseTurn = resolve; });
    const turn = {
      lifecycle,
      acpSessionId: undefined,
      uiSessionId: session.id,
      assistantMessage,
      client: undefined,
      released,
      release: () => {
        if (!releaseTurn) return;
        const resolve = releaseTurn;
        releaseTurn = undefined;
        resolve();
      }
    };
    this.activeTurns.set(session.id, turn);
    let client;
    let acpSessionId;
    let renderer;

    try {
      client = await this.ensureAcp(command);
      turn.client = client;
      if (lifecycle.cancelled) throw new TurnCancelledError();

      acpSessionId = await this.ensureMappedAcpSession(client, session);
      if (lifecycle.cancelled) throw new TurnCancelledError();
      turn.acpSessionId = acpSessionId;

      renderer = createAcpRenderer({ assistantMessage, post: msg => this.post(msg), session });
      this.acpRenderers.set(acpSessionId, renderer);

      const settings = session.settings || {};
      const mode = settings.mode || "Auto";
      const modelState = this.modelStateForSession(session);
      const selectedModel = resolveSelectedModel(settings.model || lastModel(this.context), modelState.options, modelState.current);
      if (selectedModel) {
        session.settings = { ...settings, model: selectedModel };
        const previousModel = modelState.current;
        if (selectedModel !== previousModel) {
          try {
            await client.request("session/set_model", { sessionId: acpSessionId, modelId: selectedModel });
            if (session.modelState?.options?.length) session.modelState.current = selectedModel;
            saveLastModel(this.context, selectedModel);
          } catch (error) {
            session.settings.model = previousModel;
            if (session.modelState?.options?.length) session.modelState.current = previousModel;
            vscode.window.showWarningMessage(`Unable to apply the inherited Hermes model: ${error.message}`);
          }
        } else if (session.modelState?.options?.length) {
          session.modelState.current = selectedModel;
        }
        await this.saveSessions();
        this.postState();
      }
      try {
        await client.request("session/set_mode", {
          sessionId: acpSessionId,
          modeId: mode === "Auto" ? "dont_ask" : "default"
        });
      } catch (error) {
        if (lifecycle.cancelled) throw new TurnCancelledError();
      }
      if (lifecycle.cancelled) throw new TurnCancelledError();

      const composed = composeHermesPrompt(prompt, userMessage);
      const finishReason = await client.request("session/prompt", {
        sessionId: acpSessionId,
        prompt: [{ type: "text", text: composed }]
      });

      if (finishReason?.usage) session.usage = finishReason.usage;

      if (lifecycle.cancelled) throw new TurnCancelledError();
      if (turn.assistantMessage.status === "running") {
        const status = finishReason && finishReason.stopReason === "refusal" ? "failed" : "done";
        const finalization = renderer.finalize(status);
        if (status === "done" && finalization && finalization.needsFinalAnswer) {
          renderer.beginFinalAnswerOnly();
          try {
            await client.request("session/prompt", {
              sessionId: acpSessionId,
              prompt: [{ type: "text", text: FINAL_ANSWER_ONLY_PROMPT }]
            });
          } catch (error) {
            if (lifecycle.cancelled) throw new TurnCancelledError();
          }
          if (lifecycle.cancelled) throw new TurnCancelledError();
          if (turn.assistantMessage.status === "running") renderer.finalize("done");
        }
      }
    } catch (error) {
      if (lifecycle.cancelled) throw new TurnCancelledError();
      throw error;
    } finally {
      lifecycle.settle();
      await this.expirePermissionsForSession(session.id, { acpSessionId });
      if (this.activeTurns.get(session.id) === turn) this.activeTurns.delete(session.id);
      if (acpSessionId && this.acpRenderers.get(acpSessionId) === renderer) this.acpRenderers.delete(acpSessionId);
      turn.release();
    }
    if (lifecycle.cancelled) throw new TurnCancelledError();
    // The server generates the AI title asynchronously (up to ~30s) and
    // notifies via session_info_update. Actively re-read the title from
    // Hermes' state.db a bit later so the topbar gets the real title even
    // if the notification was missed or the auxiliary titler is flaky.
    const acpId = acpSessionId;
    const uiId = session.id;
    setTimeout(() => this.syncAcpTitle(acpId, uiId), 12000);
    await this.saveSessions();
    this.postState();
  }

  /** Best-effort: pull the server-generated session title from state.db. */
  async syncAcpTitle(acpSessionId, uiSessionId) {
    try {
      const { execFile } = require("child_process");
      const dbPath = path.join(HERMES_HOME, "state.db");
      const sql = `SELECT title FROM sessions WHERE id = '${String(acpSessionId).replace(/'/g, "''")}' LIMIT 1;`;
      const title = await new Promise((resolve, reject) => {
        execFile("sqlite3", [dbPath, sql], { timeout: 8000 }, (err, stdout) => {
          if (err) return reject(err);
          resolve(String(stdout || "").trim());
        });
      });
      if (!title || title === "Untitled") return;
      const session = this.sessions.find(s => s.id === uiSessionId);
      if (session && session.title !== title) {
        session.title = title;
        session.updatedAt = Date.now();
        await this.saveSessions();
        this.postState();
      }
    } catch { /* state.db read is best-effort; the notification path may still deliver */ }
  }

  /** Lazily spawn `hermes acp` once and wire the session/update handler. */
  async ensureAcp(command) {
    if (this.acp) return this.acp;
    const client = new AcpClient({
      command,
      args: ["acp"],
      cwd: this.workspaceCwd(),
      handlers: {
        onSessionUpdate: (update, acpSessionId) => {
          if (this.retiredAcpSessions.has(acpSessionId)) return;
          if (update.sessionUpdate === "available_commands_update") {
            const available = update.availableCommands || update.available_commands || [];
            this.acpAvailableCommands.set(acpSessionId, available);
            this.postState();
            return;
          }
          const commandCapture = this.acpCommandCaptures.get(acpSessionId);
          if (commandCapture && update.sessionUpdate === "agent_message_chunk") {
            commandCapture.push(textOf(update.content));
            return;
          }
          // Title arrives via session_info_update (e.g. after the agent
          // generates a summary) — surface it in the topbar immediately.
          // The title sits on the update itself: {sessionUpdate,
          // title: "..."}.
          if (update.sessionUpdate === "session_info_update") {
            const title = update.title || "";
            if (title) {
              const session = [...this.sessions].find(s => this.acpSessions.get(s.id) === acpSessionId);
              if (session && session.title !== title) {
                session.title = title;
                session.updatedAt = Date.now();
                this.saveSessions().then(() => this.postState());
              }
            }
          }
          this.expirePermissionFromSessionUpdate(update, acpSessionId);
          const renderer = this.acpRenderers.get(acpSessionId);
          if (renderer) renderer.onSessionUpdate(update);
        },
        onError: err => {
          vscode.window.showWarningMessage(`Hermes ACP: ${err.message}`);
        },
        onPermissionRequest: request => {
          const params = request.params || {};
          const sessionId = params.sessionId || "";
          if (this.retiredAcpSessions.has(sessionId)) {
            client.respond(request.id, { outcome: { outcome: "cancelled" } });
            return;
          }
          const toolCall = params.toolCall || {};
          const options = Array.isArray(params.options) ? params.options : [];
          const allow = options.find(option => option.optionId === "allow_once" || option.optionId === "allow");
          const deny = options.find(option => option.optionId === "deny" || option.optionId === "reject_once");
          const uiSessionId = [...this.acpSessions].find(([, value]) => value === sessionId)?.[0];
          const mode = this.activeSession(uiSessionId).settings?.mode || "Auto";
          // Manual mode: always ask. Auto mode: auto-approve.
          // File write/edit/delete tools must ALWAYS confirm in Manual mode.
          const toolName = (toolCall.name || toolCall.title || "").toLowerCase();
          const diffs = Array.isArray(toolCall.content)
            ? toolCall.content.filter(block => block && block.type === "diff")
            : [];
          const diff = diffs[0] || null;
          const isFileMutation = Boolean(diffs.length)
            || /^(write|edit|patch|delete|remove|rename|create|touch|rm|mv)\b|^(write_file|edit_file|delete_file)/i.test(toolName);
          const scope = this.permissionScope(toolCall, diff);
          if (allow && this.hasPermissionSessionGrant(sessionId, scope)) {
            client.respond(request.id, { outcome: { outcome: "selected", optionId: allow.optionId } });
            return;
          }
          if (mode !== "Manual" && !isFileMutation && allow) {
            client.respond(request.id, { outcome: { outcome: "selected", optionId: allow.optionId } });
            return;
          }
          const title = toolCall.title || "Request permission";
          const targetUiSessionId = uiSessionId || this.activeSessionId;
          const batch = this.permissionBatchState.get(targetUiSessionId) || { accepted: 0, denied: 0, feedback: 0 };
          this.permissionBatchState.set(targetUiSessionId, batch);
          const pending = {
            client,
            request,
            acpSessionId: sessionId,
            toolCallId: toolCall.toolCallId || toolCall.tool_call_id || toolCall.id,
            uiSessionId: targetUiSessionId,
            title,
            toolCall,
            diff,
            diffs,
            scope,
            intent: this.permissionIntent(toolCall, options, diffs),
            denyAvailable: Boolean(deny)
          };
          this.capturePermissionAction(pending);
          this.permissionQueue.push(pending);
          this.presentNextPermission();
        },
        onExit: code => {
          const status = client.intentionalStop ? "stopped" : "failed";
          if (this.acp === client) {
            for (const renderer of this.acpRenderers.values()) {
              renderer.finalize(status);
            }
            this.acpRenderers.clear();
            this.acpAvailableCommands.clear();
            this.acpCommandCaptures.clear();
            this.acp = undefined;
            this.acpSessions.clear();
            this.retiredAcpSessions.clear();
            this.permissionSessionGrants.clear();
          }
          this.expirePermissionsForClient(client).catch(error => {
            vscode.window.showWarningMessage(`Unable to close Hermes confirmations after disconnect: ${error.message}`);
          });
          if (!client.intentionalStop && code) {
            vscode.window.showWarningMessage(`Hermes ACP exited (code ${code}).`);
          }
        },
        onStderr: line => {
          // Only genuine failures reach the UI. Hermes logs INFO/WARNING
          // chatter (auxiliary client health, payment fallbacks, registry
          // scans) to stderr — surfacing those would leak internal noise
          // like "marking openrouter unhealthy (payment / credit error)"
          // into the working timeline. Require an explicit error marker.
          if (/\[ERROR\]|\[CRITICAL\]|Traceback|^Error:|FATAL/i.test(line)) {
            if (Number(client.suppressCancellationErrorsUntil || 0) > Date.now()) return;
            const cancellingTurn = [...this.activeTurns.values()].find(turn =>
              turn.client === client && turn.lifecycle.cancelled
            );
            if (cancellingTurn) return;
            const matchingTurns = [...this.activeTurns.values()].filter(turn =>
              turn.client === client && turn.assistantMessage.status === "running"
            );
            if (matchingTurns.length !== 1) {
              vscode.window.showWarningMessage(`Hermes ACP transport error: ${line.slice(0, 300)}`);
              return;
            }
            const turn = matchingTurns[0];
            const last = turn.assistantMessage;
            if (last && !last._acpStderrNoted) {
              last._acpStderrNoted = true;
              last.thinking.push({ kind: "error", title: "stderr", text: line.slice(0, 1000) });
              this.post({ type: "thinkingUpdate", sessionId: turn.uiSessionId, messageId: last.id, thinking: last.thinking.map(step => ({ ...step })) });
            }
          }
        }
      }
    });
    this._startingAcp = client;
    try {
      await client.start();
      await client.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "hermes-agent-vscode", version: "0.2.50" }
      });
    } catch (err) {
      client.intentionalStop = true;
      await client.killAndWait(1000);
      throw err;
    } finally {
      if (this._startingAcp === client) this._startingAcp = undefined;
    }
    if (client.exited) throw new TurnCancelledError();
    this.acp = client;
    // Refresh state so the merged skills (configured + installed) flow to the
    // webview immediately after ACP init.
    setTimeout(() => this.postState(), 200);
    return client;
  }

  presentNextPermission() {
    if (this.pendingPermission || !this.permissionQueue.length) return;
    const pending = this.permissionQueue.shift();
    pending.diffInConfirmation = false;
    pending.previewKind = "loading";
    this.pendingPermission = pending;
    this.post({ type: "permissionRequest", ...this.permissionMessageForSession(pending.uiSessionId) }, pending.uiSessionId);
    this._diffPreviewPromise = this.showDocDiff(pending.diffs?.length ? pending.diffs : pending.diff, { pending })
      .then(result => {
        if (this.pendingPermission === pending) {
          this.post({ type: "permissionRequest", ...this.permissionMessageForSession(pending.uiSessionId) }, pending.uiSessionId);
        }
        return result;
      })
      .catch(error => {
        pending.previewKind = "error";
        vscode.window.showErrorMessage(`Unable to preview document changes: ${error.message}`);
        if (this.pendingPermission === pending) {
          this.post({ type: "permissionRequest", ...this.permissionMessageForSession(pending.uiSessionId) }, pending.uiSessionId);
        }
        return false;
      });
    this.schedulePermissionReminder(pending);
  }

  permissionScope(toolCall, diff) {
    const kind = String(toolCall?.kind || "").toLowerCase();
    if (kind === "edit") return "edit";
    if (kind === "execute") return "execute";
    const name = String(toolCall?.name || toolCall?.title || "").toLowerCase();
    return diff || /^(write|edit|patch|delete|remove|rename|create|touch|rm|mv)\b|^(write_file|edit_file|delete_file)/i.test(name)
      ? "edit"
      : "execute";
  }

  permissionIntent(toolCall, options, diffs = []) {
    if (diffs.length || this.permissionScope(toolCall, diffs[0]) === "edit") return "operation";
    const standard = /^(?:allow|allow_once|allow_session|allow_always|deny|deny_always|reject_once)$/;
    const customChoices = (options || []).filter(option => {
      const optionId = String(option.optionId || option.id || "").toLowerCase();
      return optionId && !standard.test(optionId);
    });
    return customChoices.length >= 2 ? "question" : "operation";
  }

  hasPermissionSessionGrant(sessionId, scope) {
    return Boolean(sessionId && scope && this.permissionSessionGrants.get(sessionId)?.has(scope));
  }

  grantPermissionForSession(sessionId, scope) {
    if (!sessionId || !scope) return;
    const grants = this.permissionSessionGrants.get(sessionId) || new Set();
    grants.add(scope);
    this.permissionSessionGrants.set(sessionId, grants);
  }

  permissionChoicesForPending(pending) {
    const fixed = [
      { decision: "once", label: "Yes" },
      { decision: "session", label: "Yes, always allow in this session" },
      { decision: "deny", label: "No", danger: true }
    ];
    if (pending.scope === "edit") return fixed;

    const options = Array.isArray(pending.request.params?.options) ? pending.request.params.options : [];
    const labels = {
      allow_once: "Yes",
      allow_session: "Yes, always allow in this session",
      allow_always: "Always allow",
      deny: "No",
      deny_always: "Always deny"
    };
    const choices = options.map(option => {
      const optionId = String(option.optionId || option.id || "");
      const kind = String(option.kind || "").toLowerCase();
      const rejecting = kind.startsWith("reject") || optionId.startsWith("deny");
      const decision = optionId === "allow_session"
        ? "session"
        : optionId === "allow_once"
          ? "once"
          : optionId === "deny" || optionId === "reject_once"
            ? "deny"
            : "option";
      return {
        decision,
        optionId,
        label: String(option.name || labels[optionId] || optionId),
        danger: rejecting
      };
    }).filter(choice => choice.optionId && choice.label);
    return choices.length ? choices : fixed;
  }

  permissionQuestion(pending) {
    const file = pending?.diff && (pending.diff.path || pending.diff.file);
    if (!file) {
      const title = String(pending?.title || "").trim();
      if (pending?.intent === "question" && title) return title;
      const toolName = String(pending?.toolCall?.name || pending?.toolCall?.kind || title).toLowerCase();
      if (/execute|terminal|bash|shell|python|command|run/.test(toolName)) return "Run this command?";
      if (/navigate|browser|open|fetch/.test(toolName)) return "Open this external resource?";
      return title && title.length <= 120 && !/[\n{};]/.test(title) ? title : "Allow this action?";
    }
    if (pending.previewKind === "new-file") return `Create ${path.basename(file)}?`;
    if (pending.previewKind === "full-review") return `Apply this change to ${path.basename(file)}?`;
    return `Make this edit to ${path.basename(file)}?`;
  }

  permissionMessageForSession(sessionId) {
    const pending = this.pendingPermission;
    if (!pending || pending.uiSessionId !== sessionId) return null;
    return {
      requestId: pending.request.id,
      sessionId: pending.uiSessionId,
      title: pending.title,
      question: this.permissionQuestion(pending),
      choices: this.permissionChoicesForPending(pending),
      allowFeedback: true,
      diff: pending.diffInConfirmation ? this.compactPermissionDiff(pending.diff) : null,
      previewAction: pending.previewAction || ""
    };
  }

  diffUri(diff) {
    const file = diff && (diff.path || diff.file || "");
    if (!file) return undefined;
    return path.isAbsolute(file)
      ? vscode.Uri.file(file)
      : vscode.Uri.file(path.join(this.workspaceCwd(), file));
  }

  openDocumentGroup(uri) {
    const target = uri?.toString();
    if (!target) return undefined;
    return vscode.window.tabGroups.all.find(group => group.tabs.some(tab => this.tabUri(tab)?.toString() === target));
  }

  async openEditorForExistingDocument(uri, document) {
    const target = uri?.toString();
    const visible = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === target);
    if (visible) return visible;
    const group = this.openDocumentGroup(uri);
    if (!group || !document) return undefined;
    return vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: group.viewColumn
    });
  }

  compactPermissionDiff(diff) {
    if (!diff) return null;
    const oldText = String(diff.oldText || diff.old_text || "");
    const newText = String(diff.newText || diff.new_text || "");
    const changed = changedLineIndices(oldText, newText);
    const splitLines = value => {
      const text = String(value || "");
      if (!text) return [];
      const lines = text.split("\n");
      if (text.endsWith("\n")) lines.pop();
      return lines;
    };
    const oldLines = splitLines(oldText);
    const newLines = splitLines(newText);
    return {
      path: diff.path || diff.file || "",
      oldLines: changed.old.map(index => oldLines[index]),
      newLines: changed.new.map(index => newLines[index])
    };
  }

  conversationLanguage(session) {
    const messages = [...(session?.messages || [])].reverse();
    for (const message of messages) {
      if (message.role !== "user") continue;
      const text = String(message.text || "");
      if (/\p{Script=Han}/u.test(text)) return "zh";
      if (/[A-Za-z]/.test(text)) return "en";
    }
    return "en";
  }

  permissionActionStep(pending) {
    const session = this.activeSession(pending?.uiSessionId);
    const assistants = [...(session.messages || [])].reverse().filter(message => message.role === "assistant");
    const captured = assistants.find(message => message.id === pending?.actionMessageId);
    if (captured && Number.isInteger(pending?.actionStepIndex)) {
      const step = captured.thinking?.[pending.actionStepIndex];
      if (step?.kind === "tool") {
        return { session, assistant: captured, step, index: pending.actionStepIndex };
      }
    }

    const actionId = String(pending?.toolCallId || "");
    const targetPath = String(pending?.diff?.path || pending?.diff?.file || pending?.diffs?.[0]?.path || pending?.diffs?.[0]?.file || "");
    const targetName = targetPath ? path.basename(targetPath) : "";
    let latestRunning;
    for (const assistant of assistants) {
      const thinking = Array.isArray(assistant.thinking) ? assistant.thinking : [];
      for (let index = thinking.length - 1; index >= 0; index -= 1) {
        const step = thinking[index];
        if (step?.kind !== "tool") continue;
        if (actionId && String(step.toolCallId || "") === actionId) {
          return { session, assistant, step, index };
        }
        const searchable = [step.description, step.summary, step.title, step.detail, step.diff?.path]
          .filter(Boolean)
          .join("\n");
        if (targetPath && (searchable.includes(targetPath) || (targetName && searchable.includes(targetName)))) {
          return { session, assistant, step, index };
        }
        if (!latestRunning && !step.done && !step.finalized) latestRunning = { session, assistant, step, index };
      }
    }
    return latestRunning;
  }

  capturePermissionAction(pending) {
    if (!pending || pending.intent === "question") return false;
    const match = this.permissionActionStep(pending);
    if (!match) return false;
    pending.actionMessageId = match.assistant.id;
    pending.actionStepIndex = match.index;
    return true;
  }

  runningAssistantForPermission(pending) {
    const session = this.activeSession(pending?.uiSessionId);
    const assistant = [...(session.messages || [])].reverse().find(message => message.role === "assistant" && message.status === "running");
    return { session, assistant };
  }

  async publishPermissionThinking(pending, assistant) {
    await this.saveSessions();
    this.post({
      type: "thinkingUpdate",
      sessionId: pending.uiSessionId,
      messageId: assistant.id,
      thinking: assistant.thinking.map(step => ({ ...step }))
    }, pending.uiSessionId);
  }

  async recordPermissionOutcome(pending, { feedback = "", denied = false } = {}) {
    const match = this.permissionActionStep(pending);
    if (!match) return false;
    const { session, assistant, step } = match;
    assistant.thinking = Array.isArray(assistant.thinking) ? assistant.thinking : [];
    const language = this.conversationLanguage(session);
    const reason = String(feedback || "").trim();
    const outcome = reason
      ? (language === "zh" ? `用户提出了新的要求：${reason}` : `The user requested a change: ${reason}`)
      : pending?.scope === "edit"
        ? (language === "zh" ? "未执行此次修改：用户拒绝了本次写入。" : "The edit was not applied because the user rejected this write.")
        : (language === "zh" ? "未执行该操作：用户拒绝了本次授权。" : "The action was not run because the user denied permission.");
    const existing = String(step.detail || "").trim();
    step.detail = existing && !existing.includes(outcome) ? `${existing}\n${outcome}` : (existing || outcome);
    step.result = "";
    step.done = true;
    step.finalized = true;
    step.error = Boolean(denied || reason);
    step.status = step.error ? "failed" : step.status;
    await this.publishPermissionThinking(pending, assistant);
    return true;
  }

  async recordPermissionQuestion(pending, answer) {
    const { assistant } = this.runningAssistantForPermission(pending);
    if (!assistant) return false;
    assistant.thinking = Array.isArray(assistant.thinking) ? assistant.thinking : [];
    const existing = assistant.thinking.find(item => String(item.toolCallId || "") === String(pending?.toolCallId || ""));
    if (existing) {
      existing.kind = "clarification";
      existing.title = "AskUserQuestion";
      existing.question = this.permissionQuestion(pending);
      existing.answer = answer;
      existing.done = true;
      existing.finalized = true;
      existing.status = "completed";
      existing.error = false;
    } else {
      assistant.thinking.push({
        kind: "clarification",
        title: "AskUserQuestion",
        toolCallId: pending?.toolCallId,
        question: this.permissionQuestion(pending),
        answer,
        done: true,
        finalized: true
      });
    }
    await this.publishPermissionThinking(pending, assistant);
    return true;
  }

  async continuePermissionFeedback(pending, feedbackText) {
    const turn = this.activeTurns.get(pending?.uiSessionId);
    if (!turn) {
      await this.startPrompt({ prompt: feedbackText }, pending.uiSessionId);
      return "new-turn";
    }
    if (!turn.client || !turn.acpSessionId || turn.lifecycle.cancelled) {
      throw new Error("The active Hermes turn is not available for confirmation feedback.");
    }
    const renderer = this.acpRenderers.get(turn.acpSessionId);
    renderer?.ignoreNextAssistantText(/^(?:⏩\s*)?Steer queued for the active turn:/);
    await turn.client.request("session/prompt", {
      sessionId: turn.acpSessionId,
      prompt: [{ type: "text", text: `/steer ${feedbackText}` }]
    });
    return "current-turn";
  }

  schedulePermissionReminder(pending) {
    this.clearPermissionReminder();
    const configured = Number(vscode.workspace.getConfiguration("hermesAgent").get("permissionReminderMinutes", 5));
    if (!Number.isFinite(configured) || configured <= 0) return;
    this._permissionReminderTimer = setInterval(() => {
      if (this.pendingPermission !== pending || pending.resolving) {
        this.clearPermissionReminder();
        return;
      }
      vscode.window.showInformationMessage("Hermes is waiting for your confirmation.");
    }, configured * 60 * 1000);
  }

  clearPermissionReminder() {
    if (!this._permissionReminderTimer) return;
    clearInterval(this._permissionReminderTimer);
    this._permissionReminderTimer = undefined;
  }

  expirePermissionFromSessionUpdate(update, acpSessionId) {
    if (update?.sessionUpdate !== "tool_call_update") return;
    const status = String(update.status || "").toLowerCase();
    if (!["completed", "failed", "cancelled", "denied", "rejected"].includes(status)) return;
    const toolCallId = update.toolCallId || update.tool_call_id;
    const pending = this.pendingPermission;
    if (!pending || pending.acpSessionId !== acpSessionId) return;
    if (!toolCallId || !pending.toolCallId || String(toolCallId) !== String(pending.toolCallId)) return;
    this.expirePendingPermission(pending).catch(error => {
      vscode.window.showWarningMessage(`Unable to close an expired Hermes confirmation: ${error.message}`);
    });
  }

  async expirePermissionsForSession(sessionId, { acpSessionId } = {}) {
    this.permissionQueue = this.permissionQueue.filter(pending => {
      const matches = acpSessionId
        ? pending.acpSessionId === acpSessionId
        : pending.uiSessionId === sessionId;
      return !matches;
    });
    const pending = this.pendingPermission;
    if (!this.permissionQueue.some(item => item.uiSessionId === sessionId)) this.permissionBatchState.delete(sessionId);
    if (!pending) return false;
    const matches = acpSessionId
      ? pending.acpSessionId === acpSessionId
      : pending.uiSessionId === sessionId;
    return matches ? this.expirePendingPermission(pending) : false;
  }

  async expirePendingPermission(pending = this.pendingPermission) {
    if (!pending || this.pendingPermission !== pending || pending.resolving) return false;
    pending.resolving = true;
    if (this._diffPreviewPromise) await this._diffPreviewPromise;
    if (this.pendingPermission !== pending) return false;

    let cleaned = false;
    try {
      cleaned = await this.rollbackDocDiffPreview();
    } catch {
      cleaned = false;
    }
    if (!cleaned) {
      vscode.window.showWarningMessage("The expired read-only Diff preview could not be closed.");
      this._diffPreview = undefined;
    }
    this.disposeDocDiffUi();
    this.clearPermissionReminder();
    this.pendingPermission = undefined;
    this._diffPreviewPromise = undefined;
    if (!this.permissionQueue.some(item => item.uiSessionId === pending.uiSessionId)) {
      this.permissionBatchState.delete(pending.uiSessionId);
    }
    this.post({ type: "permissionResolved", accepted: false, expired: true }, pending.uiSessionId);
    this.presentNextPermission();
    return true;
  }

  async cancelPermissionsForSession(sessionId) {
    const retained = [];
    for (const pending of this.permissionQueue) {
      if (pending.uiSessionId === sessionId) {
        pending.client.respond(pending.request.id, { outcome: { outcome: "cancelled" } });
      } else {
        retained.push(pending);
      }
    }
    this.permissionQueue = retained;
    this.permissionBatchState.delete(sessionId);
    if (this.pendingPermission?.uiSessionId === sessionId) {
      await this.resolveDiffPermission(false, { abandonUnsafePreview: true, sessionId, systemCancellation: true });
    }
  }

  cancelQueuedPermissionsForSession(sessionId) {
    let cancelled = 0;
    this.permissionQueue = this.permissionQueue.filter(pending => {
      if (pending.uiSessionId !== sessionId) return true;
      pending.client.respond(pending.request.id, { outcome: { outcome: "cancelled" } });
      cancelled += 1;
      return false;
    });
    this.permissionBatchState.delete(sessionId);
    return cancelled;
  }

  async cancelPermissionsForClient(client) {
    const retained = [];
    for (const pending of this.permissionQueue) {
      if (pending.client === client) {
        pending.client.respond(pending.request.id, { outcome: { outcome: "cancelled" } });
      } else {
        retained.push(pending);
      }
    }
    this.permissionQueue = retained;
    for (const session of this.sessions) {
      if (!this.permissionQueue.some(item => item.uiSessionId === session.id) && this.pendingPermission?.uiSessionId !== session.id) {
        this.permissionBatchState.delete(session.id);
      }
    }
    if (this.pendingPermission?.client === client) {
      await this.resolveDiffPermission(false, { abandonUnsafePreview: true, systemCancellation: true });
    }
  }

  async expirePermissionsForClient(client) {
    this.permissionQueue = this.permissionQueue.filter(pending => pending.client !== client);
    if (this.pendingPermission?.client === client) {
      await this.expirePendingPermission(this.pendingPermission);
    }
    for (const session of this.sessions) {
      if (!this.permissionQueue.some(item => item.uiSessionId === session.id) && this.pendingPermission?.uiSessionId !== session.id) {
        this.permissionBatchState.delete(session.id);
      }
    }
  }

  cancelTurnsForClient(client) {
    for (const turn of this.activeTurns.values()) {
      if (turn.client !== client) continue;
      turn.lifecycle.markCancelled();
      const renderer = this.acpRenderers.get(turn.acpSessionId);
      if (renderer) {
        renderer.finalize("stopped");
        this.acpRenderers.delete(turn.acpSessionId);
      }
      if (turn.assistantMessage.status === "running") {
        turn.assistantMessage.status = "stopped";
        turn.assistantMessage.finishedAt = Date.now();
      }
    }
  }

  async forkAcpSessionForCancellation(target, turn) {
    const oldAcpSessionId = String(target?.acpSessionId || turn?.acpSessionId || "").trim();
    const uiSessionId = target?.uiSessionId || turn?.uiSessionId;
    const client = target?.client || turn?.client;
    if (!uiSessionId || !oldAcpSessionId || !client) throw new Error("The active ACP turn is unavailable");
    if (this.acpSessions.get(uiSessionId) !== oldAcpSessionId) {
      throw new Error("The ACP session changed before the turn could be isolated");
    }

    const forked = await forkAcpSession(client, {
      sessionId: oldAcpSessionId,
      cwd: this.workspaceCwd(),
      mcpServers: []
    });
    const replacementAcpSessionId = forked.sessionId;
    const session = this.activeSession(uiSessionId);

    this.retiredAcpSessions.add(oldAcpSessionId);
    installAcpSessionReplacement({
      mappings: this.acpSessions,
      uiSessionId,
      oldSessionId: oldAcpSessionId,
      replacementSessionId: replacementAcpSessionId,
      session
    });
    const runtimeModels = normalizeModelState(forked.models);
    if (runtimeModels.options.length) session.modelState = runtimeModels;
    const availableCommands = this.acpAvailableCommands.get(oldAcpSessionId);
    if (availableCommands) this.acpAvailableCommands.set(replacementAcpSessionId, availableCommands);
    await this.saveSessions();

    return { client, oldAcpSessionId, replacementAcpSessionId };
  }

  async stopRetiredAcpTurn(turn, handoff) {
    if (turn) turn.lifecycle.markCancelled();
    const renderer = this.acpRenderers.get(handoff.oldAcpSessionId);
    if (renderer) renderer.finalize("stopped");
    this.acpRenderers.delete(handoff.oldAcpSessionId);
    this.acpAvailableCommands.delete(handoff.oldAcpSessionId);
    this.acpCommandCaptures.delete(handoff.oldAcpSessionId);
    this.permissionSessionGrants.delete(handoff.oldAcpSessionId);
    if (turn?.assistantMessage?.status === "running") {
      turn.assistantMessage.status = "stopped";
      turn.assistantMessage.finishedAt = Date.now();
    }
    handoff.client.suppressCancellationErrorsUntil = Date.now() + 5000;
    handoff.client.notify("session/cancel", { sessionId: handoff.oldAcpSessionId });
    await this.saveSessions();
    this.postState();
    await this.waitForTurnRelease(turn, turn?.uiSessionId);
  }

  async restartAcpTransportAndResume(target, turn) {
    const client = target?.client || turn?.client;
    const uiSessionId = target?.uiSessionId || turn?.uiSessionId;
    const oldAcpSessionId = String(target?.acpSessionId || turn?.acpSessionId || "").trim();
    if (!client || !uiSessionId || !oldAcpSessionId) throw new Error("The active ACP turn cannot be recovered");

    this.retiredAcpSessions.add(oldAcpSessionId);
    turn?.lifecycle.markCancelled();
    client.intentionalStop = true;
    client.suppressCancellationErrorsUntil = Date.now() + 5000;
    client.notify("session/cancel", { sessionId: oldAcpSessionId });
    this.cancelTurnsForClient(client);
    if (this.acp === client) this.acp = undefined;
    this.acpSessions.clear();
    this.acpRenderers.clear();
    this.acpAvailableCommands.clear();
    this.acpCommandCaptures.clear();
    this.permissionSessionGrants.clear();

    const terminated = await client.killAndWait(1000);
    if (!terminated) throw new Error("Hermes could not terminate the previous ACP process");
    await this.waitForTurnRelease(turn, uiSessionId);

    const replacementClient = await this.ensureAcp(client.command);
    const session = this.activeSession(uiSessionId);
    this.acpSessions.set(uiSessionId, oldAcpSessionId);
    session.acpSessionId = oldAcpSessionId;
    try {
      const resumed = await replacementClient.request("session/resume", {
        cwd: this.workspaceCwd(),
        sessionId: oldAcpSessionId,
        mcpServers: []
      });
      this.applyAcpSessionState(session, oldAcpSessionId, resumed?.models);
      this.retiredAcpSessions.delete(oldAcpSessionId);
      await this.saveSessions();
    } catch (error) {
      if (this.acpSessions.get(uiSessionId) === oldAcpSessionId) this.acpSessions.delete(uiSessionId);
      throw new Error(`Hermes could not resume the interrupted conversation safely: ${error.message}`);
    }
  }

  async isolateAcpTurnForStop(sessionId) {
    const turn = this.activeTurns.get(sessionId);
    if (!turn?.client || !turn.acpSessionId) return false;

    const barrier = this.cancellationBarriers.open(sessionId);
    if (!barrier.owner) {
      await barrier.promise;
      return true;
    }

    const target = {
      uiSessionId: sessionId,
      acpSessionId: turn.acpSessionId,
      client: turn.client
    };
    let handoff;
    let forkError;
    let isolated = false;
    try {
      try {
        handoff = await this.forkAcpSessionForCancellation(target, turn);
      } catch (error) {
        forkError = error;
      }

      turn.lifecycle.markCancelled();
      await this.cancelPermissionsForSession(sessionId);
      this.promptQueue.clear(sessionId);
      if (handoff) {
        await this.stopRetiredAcpTurn(turn, handoff);
      } else {
        await this.restartAcpTransportAndResume(target, turn);
      }
      isolated = true;
      return true;
    } catch (error) {
      const reason = error?.message || forkError?.message || String(error);
      vscode.window.showErrorMessage(`Hermes could not isolate the interrupted task. New questions are blocked until the window is reloaded. ${reason}`);
      return false;
    } finally {
      if (isolated) barrier.release();
    }
  }

  async acpStop(sessionId = this.activeSessionId) {
    const session = this.activeSession(sessionId);
    const acpSessionId = this.acpSessions.get(session.id);
    if (this.pendingPermission?.uiSessionId === session.id || this.permissionQueue.some(item => item.uiSessionId === session.id)) {
      await this.cancelPermissionsForSession(session.id);
    } else if (this._diffPreview && !this.pendingPermission) {
      const cleaned = await this.rollbackDocDiffPreview();
      if (cleaned) this.disposeDocDiffUi();
    }

    const turn = this.activeTurns.get(session.id);
    const currentClient = () => turn?.client || this._startingAcp || this.acp;
    const clientAtStop = currentClient();
    if (clientAtStop) clientAtStop.suppressCancellationErrorsUntil = Date.now() + 5000;
    let stopping;
    if (turn) {
      stopping = turn.lifecycle.stop({
        notify: () => {
          const client = currentClient();
          if (client && turn.acpSessionId) client.notify("session/cancel", { sessionId: turn.acpSessionId });
        },
        forceStop: async () => {
          const client = currentClient();
          if (!client) return true;
          client.intentionalStop = true;
          this.cancelTurnsForClient(client);
          await this.cancelPermissionsForClient(client);
          if (this.acp === client) this.acp = undefined;
          this.acpAvailableCommands.clear();
          this.acpCommandCaptures.clear();
          this.acpSessions.clear();
          const terminated = await client.killAndWait(1000);
          if (!terminated) {
            vscode.window.showErrorMessage("Hermes could not terminate the previous ACP process. New questions remain blocked.");
          }
          return terminated;
        }
      });
      this._stoppingPromise = stopping;
    } else if (this.acp && acpSessionId) {
      this.acp.notify("session/cancel", { sessionId: acpSessionId });
    }

    const renderer = this.acpRenderers.get(acpSessionId);
    if (renderer) {
      renderer.finalize("stopped");
      this.acpRenderers.delete(acpSessionId);
    }
    const last = [...session.messages].reverse().find(message => message.role === "assistant" && message.status === "running");
    if (last) {
      last.status = "stopped";
      last.finishedAt = Date.now();
    }
    await this.saveSessions();
    this.postState();

    if (!stopping) return;
    try {
      await stopping;
    } finally {
      if (this._stoppingPromise === stopping) this._stoppingPromise = null;
      await this.saveSessions();
      this.postState();
    }
  }

  async waitForTurnRelease(turn, sessionId, timeoutMs = 4000) {
    if (!turn?.released) return;
    let timer;
    const released = await Promise.race([
      turn.released.then(() => true),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })
    ]);
    clearTimeout(timer);
    if (released) return;
    // The transport has already passed through bounded cancellation. Detach
    // only the captured old turn so late completion cannot block or delete a
    // fresh turn for this UI session.
    turn.lifecycle.markCancelled();
    if (this.activeTurns.get(sessionId) === turn) this.activeTurns.delete(sessionId);
    if (turn.acpSessionId && this.acpRenderers.get(turn.acpSessionId)) {
      this.acpRenderers.delete(turn.acpSessionId);
    }
    turn.release?.();
  }

  isFileNotFound(error) {
    const code = String(error?.code || "");
    const name = String(error?.name || "");
    return code === "FileNotFound" || /FileNotFound|EntryNotFound/i.test(name);
  }

  async readDiffSource(uri, oldText) {
    const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === uri.toString());
    if (document) {
      return {
        sourceKind: "document",
        sourceText: document.getText(),
        documentVersion: document.version,
        document
      };
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return { sourceKind: "file", sourceText: Buffer.from(bytes).toString("utf8") };
    } catch (error) {
      if (!this.isFileNotFound(error)) throw error;
      if (oldText) return undefined;
      return { sourceKind: "missing", sourceText: "" };
    }
  }

  async readFileTextIfExists(uri) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString("utf8");
    } catch (error) {
      if (this.isFileNotFound(error)) return undefined;
      throw error;
    }
  }

  async diffSourceMatches(preview) {
    const uri = vscode.Uri.parse(preview.uri);
    const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === preview.uri);
    if (preview.previewKind === "inline-diff") {
      return Boolean(document
        && document.version === preview.documentVersion
        && document.getText() === preview.previewText);
    }
    if (preview.sourceKind === "missing") {
      if (document) return false;
      try {
        await vscode.workspace.fs.stat(uri);
        return false;
      } catch (error) {
        if (this.isFileNotFound(error)) return true;
        throw error;
      }
    }
    if (preview.sourceKind === "document") {
      if (document) {
        return document.version === preview.documentVersion && document.getText() === preview.sourceText;
      }
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(bytes).toString("utf8") === preview.sourceText;
      } catch (error) {
        if (this.isFileNotFound(error)) return false;
        throw error;
      }
    }
    if (document && document.getText() !== preview.sourceText) return false;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString("utf8") === preview.sourceText;
    } catch (error) {
      if (this.isFileNotFound(error)) return false;
      throw error;
    }
  }

  async showDocDiff(diffInput, { pending = this.pendingPermission } = {}) {
    const diffs = (Array.isArray(diffInput) ? diffInput : [diffInput]).filter(Boolean);
    const diff = diffs[0];
    const file = diff && (diff.path || diff.file || "");
    const reuseReviewPanel = Boolean(file && pending && this._documentReviewContext
      && this._documentReviewContext.uiSessionId === pending.uiSessionId
      && this._documentReviewContext.file === file);
    const previousCleaned = await this.rollbackDocDiffPreview({ preserveReviewPanel: reuseReviewPanel });
    if (!previousCleaned) {
      vscode.window.showErrorMessage("The previous Diff preview changed and could not be removed safely.");
      return false;
    }
    this.disposeDocDiffUi();
    if (!diff) return false;
    const normalizedDiffs = diffs.map(item => ({
      ...item,
      oldText: String(item.oldText || item.old_text || ""),
      newText: String(item.newText || item.new_text || "")
    }));
    if (!file || normalizedDiffs.some(item => !item.oldText && !item.newText)) return false;
    const uri = this.diffUri(diff);
    const sameDocument = normalizedDiffs.every(item => this.diffUri(item)?.toString() === uri.toString());
    if (!sameDocument) {
      vscode.window.showWarningMessage("Hermes received changes for multiple documents in one confirmation. Regenerate them as separate actions.");
      return false;
    }

    const source = await this.readDiffSource(uri, normalizedDiffs.find(item => item.oldText)?.oldText || "");
    if (!source) {
      vscode.window.showWarningMessage("Hermes expected existing text, but the target file does not exist.");
      return false;
    }
    const sourceEditor = source.document
      ? await this.openEditorForExistingDocument(uri, source.document)
      : undefined;
    const fallbackOffset = sourceEditor ? source.document.offsetAt(sourceEditor.selection.active) : 0;
    const sourceText = source.sourceText;
    const review = prepareDocumentReviewBatch({
      sourceKind: source.sourceKind,
      sourceText,
      diffs: normalizedDiffs,
      fallbackOffset
    });
    if (!review) {
      vscode.window.showWarningMessage("Hermes could not locate the requested text for Diff preview.");
      return false;
    }
    if (review.kind !== "full-review" && this._documentReviewPanel) {
      await this.closeDocumentReview({ restoreSessionId: pending?.uiSessionId });
    }

    this._diffPreview = {
      ...review.edit,
      uri: uri.toString(),
      previewUri: "",
      file,
      candidateText: review.candidateText,
      operations: review.operations,
      previewKind: review.kind,
      sourceText,
      sourceKind: source.sourceKind,
      documentVersion: source.documentVersion,
      uiSessionId: pending?.uiSessionId
    };
    if (pending) {
      pending.diff = {
        path: file,
        oldText: review.edit.oldText,
        newText: review.edit.newText
      };
      pending.diffInConfirmation = false;
      pending.previewKind = review.kind;
      pending.previewAction = "";
    }

    if (review.kind === "new-file") {
      if (pending) pending.previewAction = "Open file preview";
      await this.openNewFilePreview(this._diffPreview);
      return true;
    }
    if (sourceEditor) {
      if (this._documentReviewPanel) await this.closeDocumentReview({ restoreSessionId: pending?.uiSessionId });
      this._diffPreview.previewKind = "inline-diff";
      if (pending) {
        pending.previewKind = "inline-diff";
        pending.previewAction = "Show Diff in document";
      }
      await this.openInlineDiffPreview(this._diffPreview, sourceEditor);
      return true;
    }
    if (review.kind === "full-review") {
      if (pending) pending.previewAction = "Open full review";
      await this.openDocumentReview(this._diffPreview, pending);
      return true;
    }
    this._diffPreview.previewKind = "compact-diff";
    if (pending) {
      pending.previewKind = "compact-diff";
      pending.diffInConfirmation = true;
    }
    return true;
  }

  async openNewFilePreview(preview) {
    if (!preview) return false;
    if (preview.previewUri) {
      const existing = vscode.workspace.textDocuments.find(document => document.uri.toString() === preview.previewUri);
      if (existing) {
        await vscode.window.showTextDocument(existing, { preview: false, viewColumn: await this.ensureDocumentColumn() });
        return true;
      }
    }
    const previewUri = vscode.Uri.from({
      scheme: "hermes-new-file-preview",
      path: `/${path.basename(preview.file)}`,
      query: `id=${id()}`
    });
    this.diffPreviewDocuments.set(previewUri.toString(), preview.candidateText);
    try {
      const previewDocument = await vscode.workspace.openTextDocument(previewUri);
      await vscode.window.showTextDocument(previewDocument, {
        preview: false,
        viewColumn: await this.ensureDocumentColumn()
      });
    } catch (error) {
      this.diffPreviewDocuments.delete(previewUri.toString());
      throw error;
    }
    preview.previewUri = previewUri.toString();
    return true;
  }

  async openInlineDiffPreview(preview, existingEditor) {
    if (!preview) return false;
    const uri = vscode.Uri.parse(preview.uri);
    let editor = existingEditor;
    if (!editor || editor.document.uri.toString() !== preview.uri) {
      const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === preview.uri);
      editor = await this.openEditorForExistingDocument(uri, document);
    }
    if (!editor) return false;
    const document = editor.document;

    if (!preview.inlineApplied) {
      preview.diskTextBefore = await this.readFileTextIfExists(uri);
      preview.wasDirtyBefore = document.isDirty;
      if (preview.insertText) {
        const applied = await editor.edit(builder => {
          builder.insert(document.positionAt(preview.insertOffset), preview.insertText);
        }, { undoStopBefore: true, undoStopAfter: true });
        if (!applied) throw new Error("VS Code rejected the temporary inline Diff preview");
      }
      preview.inlineApplied = true;
      preview.previewText = document.getText();
      preview.documentVersion = document.version;
    }

    this.disposeDocDiffUi();
    this._diffEditor = editor;
    this.docDiffDecorations = [];

    const changedLines = changedLineIndices(preview.oldText, preview.newText);
    const oldStartLine = document.positionAt(preview.oldStart).line;
    if (changedLines.old.length) {
      const deleted = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor("diffEditor.removedTextBackground"),
        light: { backgroundColor: "rgba(196, 54, 54, 0.22)" },
        dark: { backgroundColor: "rgba(184, 62, 62, 0.30)" },
        isWholeLine: true,
        overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.deletedForeground")
      });
      editor.setDecorations(deleted, changedLines.old.map(index => document.lineAt(oldStartLine + index).range));
      this.docDiffDecorations.push(deleted);
    }

    let revealEnd = document.positionAt(preview.oldEnd);
    if (preview.contentEnd > preview.contentStart && changedLines.new.length) {
      const added = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor("diffEditor.insertedTextBackground"),
        light: { backgroundColor: "rgba(40, 142, 76, 0.20)" },
        dark: { backgroundColor: "rgba(54, 148, 82, 0.28)" },
        overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.addedForeground"),
        isWholeLine: true
      });
      const newStartLine = document.positionAt(preview.contentStart).line;
      const addedRanges = changedLines.new.map(index => document.lineAt(newStartLine + index).range);
      editor.setDecorations(added, addedRanges);
      this.docDiffDecorations.push(added);
      revealEnd = addedRanges[addedRanges.length - 1].end;
    }
    preview.revealStart = preview.oldStart;
    preview.revealEnd = document.offsetAt(revealEnd);
    editor.revealRange(new vscode.Range(document.positionAt(preview.revealStart), revealEnd), vscode.TextEditorRevealType.InCenter);
    return true;
  }

  reviewColumn() {
    const agentColumn = this.findAgentColumn();
    return agentColumn === undefined ? vscode.ViewColumn.Beside : Math.min(vscode.ViewColumn.Nine, agentColumn + 1);
  }

  async openDocumentReview(preview, pending = this.pendingPermission) {
    if (!preview) return false;
    const context = {
      file: preview.file,
      uiSessionId: pending?.uiSessionId,
      preview
    };
    this._documentReviewContext = context;
    let panel = this._documentReviewPanel;
    if (!panel) {
      panel = vscode.window.createWebviewPanel(
        REVIEW_VIEW_TYPE,
        `Review: ${path.basename(preview.file)}`,
        this.reviewColumn(),
        { enableScripts: true, enableFindWidget: true, retainContextWhenHidden: true }
      );
      this._documentReviewPanel = panel;
      panel.onDidDispose(() => {
        if (this._documentReviewPanel === panel) this._documentReviewPanel = undefined;
      });
    } else {
      panel.title = `Review: ${path.basename(preview.file)}`;
      panel.reveal(this.reviewColumn(), false);
    }
    panel.webview.html = this.documentReviewHtml(panel.webview, context);
    return true;
  }

  documentReviewHtml(webview, context) {
    const nonce = id();
    const preview = context.preview;
    const result = escapeHtml(preview.candidateText);
    const changes = (preview.operations || []).map(operation => {
      const sign = operation.type === "delete" ? "−" : operation.type === "add" ? "+" : "";
      const oldLine = operation.oldLine || "";
      const newLine = operation.newLine || "";
      return `<div class="change-row ${operation.type}"><span class="line-no">${oldLine}</span><span class="line-no">${newLine}</span><span class="sign">${sign}</span><code>${escapeHtml(operation.text)}</code></div>`;
    }).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width, initial-scale=1"><style nonce="${nonce}">
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
      header { position: sticky; top: 0; z-index: 2; padding: 12px 16px 0; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); }
      h1 { margin: 0 0 4px; font-size: 14px; }
      .status { margin-bottom: 10px; color: var(--vscode-descriptionForeground); font-size: 12px; }
      .tabs { display: flex; gap: 18px; }
      .tab { appearance: none; border: 0; border-bottom: 2px solid transparent; padding: 7px 1px; color: var(--vscode-descriptionForeground); background: transparent; cursor: pointer; font: inherit; }
      .tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); }
      main { min-width: 0; }
      .pane { display: none; }
      .pane.active { display: block; }
      .result { margin: 0; padding: 18px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--vscode-editor-font-size); line-height: 1.55; font-family: var(--vscode-editor-font-family); }
      .changes { padding: 10px 0 24px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
      .change-row { display: grid; grid-template-columns: 42px 42px 20px minmax(0, 1fr); min-height: 22px; line-height: 1.5; padding-right: 14px; }
      .change-row code { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .line-no { padding-right: 8px; text-align: right; color: var(--vscode-editorLineNumber-foreground); user-select: none; }
      .sign { text-align: center; user-select: none; }
      .change-row.delete { background: var(--vscode-diffEditor-removedTextBackground); }
      .change-row.add { background: var(--vscode-diffEditor-insertedTextBackground); }
    </style></head><body><header><h1>${escapeHtml(path.basename(preview.file))}</h1><div class="status">Candidate ready · Original unchanged</div><div class="tabs"><button class="tab active" data-tab="result">Result</button><button class="tab" data-tab="changes">Changes</button></div></header><main><section class="pane active" data-pane="result"><pre class="result">${result}</pre></section><section class="pane" data-pane="changes"><div class="changes">${changes}</div></section></main><script nonce="${nonce}">document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item === button)); document.querySelectorAll('.pane').forEach(item => item.classList.toggle('active', item.dataset.pane === button.dataset.tab)); }));</script></body></html>`;
  }

  documentReviewWaitingHtml(webview, context) {
    const nonce = id();
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';"><style nonce="${nonce}">body{margin:0;padding:24px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family)}h1{font-size:14px;margin:0 0 8px}p{color:var(--vscode-descriptionForeground);font-size:12px}</style></head><body><h1>${escapeHtml(path.basename(context.file))}</h1><p>Generating a revised candidate. The original document remains unchanged.</p></body></html>`;
  }

  async closeDocumentReview({ restoreSessionId } = {}) {
    const panel = this._documentReviewPanel;
    if (!panel) {
      this._documentReviewContext = undefined;
      return true;
    }
    const group = vscode.window.tabGroups.all.find(item => item.tabs.some(tab => this.isReviewTab(tab)));
    const closeDedicatedGroup = Boolean(group && group.tabs.length === 1);
    try {
      if (closeDedicatedGroup) {
        panel.reveal(group.viewColumn, false);
        await vscode.commands.executeCommand("workbench.action.closeEditorsAndGroup");
      } else {
        panel.dispose();
      }
    } catch {
      try { panel.dispose(); } catch { /* already closed */ }
    }
    this._documentReviewPanel = undefined;
    this._documentReviewContext = undefined;
    const agentPanel = [...this.panels].find(item => item.sessionId === restoreSessionId && item.viewColumn !== undefined);
    if (agentPanel) agentPanel.reveal(agentPanel.viewColumn, false);
    return true;
  }

  async reopenPermissionPreview(sessionId, requestId) {
    const pending = this.pendingPermission;
    if (!pending || pending.uiSessionId !== sessionId || (requestId && pending.request.id !== requestId)) return false;
    const preview = this._diffPreview;
    if (!preview) return false;
    if (preview.previewKind === "new-file") return this.openNewFilePreview(preview);
    if (preview.previewKind === "full-review") return this.openDocumentReview(preview, pending);
    if (preview.previewKind === "inline-diff") return this.openInlineDiffPreview(preview);
    return false;
  }

  async rollbackDocDiffPreview({ preserveReviewPanel = false } = {}) {
    const preview = this._diffPreview;
    if (!preview) {
      if (!preserveReviewPanel && this._documentReviewPanel) {
        await this.closeDocumentReview({ restoreSessionId: this._documentReviewContext?.uiSessionId });
      }
      return true;
    }
    if (preview.previewKind === "inline-diff") {
      const uri = vscode.Uri.parse(preview.uri);
      const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === preview.uri);
      if (!document) return false;
      if (document.version !== preview.documentVersion || document.getText() !== preview.previewText) return false;
      const diskText = await this.readFileTextIfExists(uri);
      const diskIsExpected = diskText === preview.diskTextBefore
        || diskText === preview.sourceText
        || diskText === preview.previewText;
      if (!diskIsExpected) return false;
      if (preview.insertText) {
        const removal = locatePreviewForRemoval(document.getText(), preview);
        if (!removal) return false;
        const edit = new vscode.WorkspaceEdit();
        edit.delete(uri, new vscode.Range(document.positionAt(removal.start), document.positionAt(removal.end)));
        if (!await vscode.workspace.applyEdit(edit)) return false;
      }
      if (document.getText() !== preview.sourceText) return false;
      if (diskText === preview.previewText || (!preview.wasDirtyBefore && document.isDirty && diskText === preview.sourceText)) {
        if (!await document.save()) return false;
      }
      this._diffPreview = undefined;
      return true;
    }
    const previewUri = preview.previewUri;
    if (previewUri) {
      const tab = vscode.window.tabGroups.all
        .flatMap(group => group.tabs)
        .find(item => this.tabUri(item)?.toString() === previewUri);
      if (tab) {
        try {
          const closed = await vscode.window.tabGroups.close(tab, true);
          if (!closed) return false;
        } catch {
          return false;
        }
      }
      this.diffPreviewDocuments.delete(previewUri);
    }
    if (preview.previewKind === "full-review") {
      if (preserveReviewPanel && this._documentReviewPanel && this._documentReviewContext) {
        this._documentReviewPanel.webview.html = this.documentReviewWaitingHtml(
          this._documentReviewPanel.webview,
          this._documentReviewContext
        );
      } else {
        await this.closeDocumentReview({ restoreSessionId: preview.uiSessionId });
      }
    }
    this._diffPreview = undefined;
    return true;
  }

  async resolveDiffPermission(decision, { abandonUnsafePreview = false, sessionId, requestId, optionId, feedback, systemCancellation = false } = {}) {
    const pending = this.pendingPermission;
    const normalizedDecision = decision === true ? "once" : decision === false ? "deny" : decision;
    const feedbackText = normalizedDecision === "feedback" ? String(feedback || "").trim() : "";
    if (normalizedDecision === "feedback" && !feedbackText) return false;
    const options = pending?.request.params?.options || [];
    const selectedOption = normalizedDecision === "option"
      ? options.find(option => String(option.optionId || option.id || "") === String(optionId || ""))
      : undefined;
    const selectedKind = String(selectedOption?.kind || "").toLowerCase();
    const selectedReject = selectedKind.startsWith("reject") || String(optionId || "").startsWith("deny");
    const accept = normalizedDecision === "once" || normalizedDecision === "session" || Boolean(selectedOption && !selectedReject);
    const hardDenial = Boolean(
      pending
      && !systemCancellation
      && normalizedDecision !== "feedback"
      && pending.intent !== "question"
      && !accept
    );
    if (sessionId && pending?.uiSessionId !== sessionId) return false;
    if (requestId && pending?.request.id !== requestId) return false;
    if (pending?.resolving) return false;
    if (pending) pending.resolving = true;
    if (this._diffPreviewPromise) await this._diffPreviewPromise;
    if (accept && pending?.diff && !this._diffPreview) {
      vscode.window.showErrorMessage("Hermes could not create a safe Diff preview. Regenerate the change before accepting.");
      this.post({ type: "permissionResolveFailed" }, pending.uiSessionId);
      pending.resolving = false;
      return false;
    }
    const resolvedPreview = this._diffPreview;
    if (accept && resolvedPreview) {
      const preview = resolvedPreview;
      if (!await this.diffSourceMatches(preview)) {
        vscode.window.showErrorMessage("The document changed during Diff preview. Keep your edits and generate the Diff again.");
        this.post({ type: "permissionResolveFailed" }, pending.uiSessionId);
        pending.resolving = false;
        return false;
      }
    }
    const preserveReviewPanel = normalizedDecision === "feedback" && resolvedPreview?.previewKind === "full-review";
    const cleaned = await this.rollbackDocDiffPreview({ preserveReviewPanel });
    if (!cleaned) {
      if (!abandonUnsafePreview) {
        vscode.window.showErrorMessage("The Diff preview changed and could not be removed safely. Review the document before continuing.");
        this.post({ type: "permissionResolveFailed" }, pending?.uiSessionId);
        if (pending) pending.resolving = false;
        return false;
      }
      vscode.window.showWarningMessage("The read-only Diff preview could not be closed while Hermes stopped.");
      this._diffPreview = undefined;
    }
    this.disposeDocDiffUi();
    this.clearPermissionReminder();
    this.pendingPermission = undefined;
    this._diffPreviewPromise = undefined;
    const selectedAnswer = String(selectedOption?.name || selectedOption?.label || selectedOption?.optionId || selectedOption?.id || "");
    if (!systemCancellation && pending?.intent === "question") {
      const answer = feedbackText || selectedAnswer || (accept ? "Yes" : "No");
      await this.recordPermissionQuestion(pending, answer);
    } else if (!systemCancellation && pending && feedbackText) {
      await this.recordPermissionOutcome(pending, { feedback: feedbackText, denied: true });
    } else if (!systemCancellation && pending && !accept) {
      await this.recordPermissionOutcome(pending, { denied: true });
    }
    const batch = pending ? (this.permissionBatchState.get(pending.uiSessionId) || { accepted: 0, denied: 0, feedback: 0 }) : null;
    if (batch && !systemCancellation) {
      if (feedbackText) batch.feedback += 1;
      else if (accept) batch.accepted += 1;
      else batch.denied += 1;
      this.permissionBatchState.set(pending.uiSessionId, batch);
    }
    const deniedTurn = hardDenial ? this.activeTurns.get(pending.uiSessionId) : undefined;
    const denialBarrier = hardDenial ? this.cancellationBarriers.open(pending.uiSessionId) : undefined;
    let denialHandoff;
    let denialForkError;
    if (hardDenial) {
      try {
        denialHandoff = await this.forkAcpSessionForCancellation(pending, deniedTurn);
      } catch (error) {
        denialForkError = error;
      }
    }
    if (deniedTurn) deniedTurn.lifecycle.markCancelled();
    if (pending) {
      if (normalizedDecision === "option" && selectedOption) {
        pending.client.respond(pending.request.id, {
          outcome: { outcome: "selected", optionId: selectedOption.optionId || selectedOption.id }
        });
      } else if (accept) {
        if (normalizedDecision === "session") {
          this.grantPermissionForSession(pending.acpSessionId, pending.scope);
        }
        const allow = options.find(option => option.optionId === "allow_once" || option.optionId === "allow");
        pending.client.respond(pending.request.id, {
          outcome: { outcome: "selected", optionId: allow ? allow.optionId : "allow_once" }
        });
      } else {
        pending.client.respond(pending.request.id, { outcome: { outcome: "cancelled" } });
      }
    }
    let discardedPrompts = 0;
    if (hardDenial) {
      let isolated = false;
      try {
        this.cancelQueuedPermissionsForSession(pending.uiSessionId);
        discardedPrompts = this.promptQueue.clear(pending.uiSessionId);
        if (denialHandoff) {
          await this.stopRetiredAcpTurn(deniedTurn, denialHandoff);
        } else {
          await this.restartAcpTransportAndResume(pending, deniedTurn);
        }
        isolated = true;
      } catch (error) {
        const reason = error?.message || denialForkError?.message || String(error);
        vscode.window.showErrorMessage(`Hermes could not isolate the rejected task. New questions are blocked until the window is reloaded. ${reason}`);
      } finally {
        if (isolated) denialBarrier.release();
      }
      if (!isolated) {
        this.post({ type: "permissionResolved", accepted: false, hardDenial: true, blocked: true, discardedPrompts }, pending.uiSessionId);
        this.presentNextPermission();
        return true;
      }
    }
    this.post({ type: "permissionResolved", accepted: accept, hardDenial, discardedPrompts }, pending?.uiSessionId);
    this.presentNextPermission();
    if (accept && resolvedPreview?.previewKind === "new-file") {
      this.openAppliedNewFile(resolvedPreview).catch(error => {
        vscode.window.showWarningMessage(`The file was approved but could not be opened: ${error.message}`);
      });
    }
    if (pending && normalizedDecision === "feedback") {
      await this.continuePermissionFeedback(pending, feedbackText);
    }
    const hasRemainingForSession = Boolean(pending && this.permissionQueue.some(item => item.uiSessionId === pending.uiSessionId));
    if (pending && !hasRemainingForSession) {
      this.permissionBatchState.delete(pending.uiSessionId);
    }
    return true;
  }

  async openAppliedNewFile(preview) {
    const uri = vscode.Uri.parse(preview.uri);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (Buffer.from(bytes).toString("utf8") === preview.candidateText) {
          await this.openDocumentUri(uri, { preview: false });
          return true;
        }
      } catch (error) {
        if (!this.isFileNotFound(error)) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }

  disposeDocDiffUi() {
    for (const decoration of this.docDiffDecorations || []) {
      try { decoration.dispose(); } catch { /* already gone */ }
    }
    this.docDiffDecorations = [];
    for (const key of ["_diffRejectToolbar", "_diffAcceptToolbar"]) {
      if (!this[key]) continue;
      try { this[key].dispose(); } catch { /* already gone */ }
      this[key] = undefined;
    }
    // Dispose commands.
    if (this._diffAcceptCmd) {
      try { this._diffAcceptCmd.dispose(); } catch { /* already gone */ }
      this._diffAcceptCmd = undefined;
    }
    if (this._diffRejectCmd) {
      try { this._diffRejectCmd.dispose(); } catch { /* already gone */ }
      this._diffRejectCmd = undefined;
    }
    this._diffEditor = undefined;
  }

  dispose() {
    if (this._disposePromise) return this._disposePromise;
    this._disposePromise = (async () => {
      this.clearPermissionReminder();
      this.permissionSessionGrants.clear();
      this.permissionBatchState.clear();
      if (this.pendingPermission) {
        this.pendingPermission.client.respond(this.pendingPermission.request.id, { outcome: { outcome: "cancelled" } });
        this.pendingPermission = undefined;
      }
      for (const pending of this.permissionQueue) {
        pending.client.respond(pending.request.id, { outcome: { outcome: "cancelled" } });
      }
      this.permissionQueue = [];
      if (this._diffPreviewPromise) await this._diffPreviewPromise;
      const cleaned = await this.rollbackDocDiffPreview();
      if (cleaned) this.disposeDocDiffUi();
      this.diffPreviewDocuments.clear();
      this._diffPreviewPromise = undefined;
      await Promise.all([...this.cliTurns.values()].map(turn => this.terminateProcess(turn.child)));
      this.cliTurns.clear();
      const clients = new Set([
        this.acp,
        this._startingAcp,
        ...[...this.activeTurns.values()].map(turn => turn.client)
      ].filter(Boolean));
      for (const client of clients) {
        client.intentionalStop = true;
        await client.killAndWait(1000);
      }
    })();
    return this._disposePromise;
  }

  workspaceCwd() {
    // When every editor tab is closed, the default cwd falls back to the user's
    // home directory. Without a workspace folder, new sessions and file
    // operations use ~ as the working root.
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (folder) return folder;
    return os.homedir();
  }

  async mockStream(prompt, userMessage, assistantMessage, sessionId) {
    const session = this.activeSession(sessionId);
    const contextNames = [
      ...(userMessage.attachments || []).map(item => item.name),
      userMessage.editorContext?.name
    ].filter(Boolean);
    const chunks = [
      "我已收到你的请求。",
      contextNames.length ? `\n\n已带入上下文：${contextNames.join("、")}。` : "\n\n当前没有额外附件上下文。",
      prompt ? `\n\n我会围绕「${prompt.slice(0, 48)}」继续处理。` : "\n\n这次请求主要基于附件或当前编辑器上下文。",
      "\n\n这里是本地预览回复。配置 hermesAgent.command 后，Hermes CLI 的 stdout 会流式显示在这里。"
    ];
    this.mockTurns.add(session.id);
    try {
      for (const chunk of chunks) {
        await delay(220);
        if (assistantMessage.status !== "running") return;
        assistantMessage.text += chunk;
        this.post({ type: "assistantChunk", sessionId: session.id, messageId: assistantMessage.id, chunk });
      }
      assistantMessage.status = "done";
      assistantMessage.finishedAt = Date.now();
      assistantMessage.thinking.push({ kind: "success", title: "Done", text: "Response completed." });
      await this.saveSessions();
      this.postState();
    } finally {
      this.mockTurns.delete(session.id);
    }
  }

  async runCli(command, args, prompt, userMessage, assistantMessage, sessionId) {
    const session = this.activeSession(sessionId);
    const composedPrompt = composeHermesPrompt(prompt, userMessage);
    const invocationArgs = buildInvocationArgs(args, composedPrompt);
    const usesPromptPlaceholder = invocationArgs.usedPlaceholder;
    await new Promise(resolve => {
      const child = spawn(command, invocationArgs.args, {
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        env: {
          ...process.env,
          HERMES_ACCEPT_HOOKS: "1"
        },
        shell: process.platform === "win32"
      });
      const cliTurn = { child, assistantMessage };
      this.cliTurns.set(session.id, cliTurn);
      // Parse `hermes chat -q ... -v` output: reasoning blocks become
      // thinking steps, `📞 Tool N` calls become tool steps, and the
      // final `╭─ Hermes ╮` block streams as the answer text.
      const pushThinking = () => {
        if (assistantMessage.status !== "running") return;
        this.post({ type: "thinkingUpdate", sessionId: session.id, messageId: assistantMessage.id, thinking: assistantMessage.thinking.map(step => ({ ...step })) });
      };
      const parser = createChatParser({
        onThinkingEnd: text => {
          if (assistantMessage.status !== "running") return;
          // Converge reasoning to a readable head; the frontend expands it.
          assistantMessage.thinking.push({ kind: "thinking", title: "Thinking", text: text.slice(0, 2000) });
          pushThinking();
        },
        onTool: tool => {
          if (assistantMessage.status !== "running") return;
          assistantMessage.thinking.push({ kind: "tool", title: tool.name, summary: tool.summary || tool.name, code: tool.code || "", result: tool.result || "", done: tool.done, status: tool.status || "pending" });
          pushThinking();
        },
        onToolUpdate: tool => {
          if (assistantMessage.status !== "running") return;
          const steps = assistantMessage.thinking;
          for (let index = steps.length - 1; index >= 0; index -= 1) {
            if (steps[index].kind === "tool" && steps[index].title === tool.name) {
              steps[index].result = tool.result || "";
              steps[index].done = tool.done;
              steps[index].status = tool.status || steps[index].status;
              break;
            }
          }
          pushThinking();
        },
        onAnswerLine: line => {
          if (assistantMessage.status !== "running") return;
          assistantMessage.text += `${line}\n`;
          this.post({ type: "assistantChunk", sessionId: session.id, messageId: assistantMessage.id, chunk: `${line}\n` });
        }
      });
      child.stdout.on("data", data => {
        if (assistantMessage.status === "running") parser.onChunk(data.toString());
      });
      child.stdout.on("end", () => {
        if (assistantMessage.status === "running") parser.flush();
      });
      child.stderr.on("data", data => {
        if (assistantMessage.status !== "running") return;
        const chunk = data.toString();
        // Only genuine failures reach the timeline (same policy as the ACP
        // path): INFO/WARNING chatter from hermes internals is noise.
        if (!/\[ERROR\]|\[CRITICAL\]|Traceback|^Error:|FATAL/i.test(chunk)) return;
        // Converge stderr into a single error step instead of one row per
        // line — a verbose CLI shouldn't flood the working timeline.
        const existing = [...assistantMessage.thinking].reverse().find(step => step.kind === "error" && step.title === "stderr");
        if (existing) {
          existing.text = `${existing.text}${existing.text ? "\n" : ""}${chunk.trim()}`.slice(-4000);
        } else {
          assistantMessage.thinking.push({ kind: "error", title: "stderr", text: chunk.trim().slice(0, 2000) });
        }
        pushThinking();
      });
      child.on("error", error => {
        if (assistantMessage.status === "stopped") return;
        assistantMessage.status = "failed";
        assistantMessage.finishedAt = Date.now();
        assistantMessage.text += `Hermes CLI failed to start: ${error.message}`;
        assistantMessage.thinking.push({ kind: "error", title: "Hermes CLI unavailable", text: error.message });
        if (this.cliTurns.get(session.id) === cliTurn) this.cliTurns.delete(session.id);
        this.saveSessions().then(() => this.postState()).then(resolve);
      });
      child.on("close", code => {
        if (assistantMessage.status === "failed") return;
        if (assistantMessage.status === "stopped") {
          if (this.cliTurns.get(session.id) === cliTurn) this.cliTurns.delete(session.id);
          resolve();
          return;
        }
        assistantMessage.status = code === 0 ? "done" : "failed";
        assistantMessage.finishedAt = Date.now();
        if (code !== 0) {
          // A clean exit needs no celebratory step — success is already
          // visible via the ✓ badges on each tool row.
          assistantMessage.thinking.push({ kind: "error", title: "Failed", text: `Process exited with code ${code}.` });
        }
        if (this.cliTurns.get(session.id) === cliTurn) this.cliTurns.delete(session.id);
        this.saveSessions().then(() => this.postState()).then(resolve);
      });
      child.stdin.end(usesPromptPlaceholder ? "" : composedPrompt);
    });
  }

  async stop(sessionId = this.activeSessionId) {
    const session = this.activeSession(sessionId);
    const last = [...session.messages].reverse().find(message => message.role === "assistant" && message.status === "running");
    const cliTurn = this.cliTurns.get(session.id);
    if (cliTurn) {
      const child = cliTurn.child;
      if (last) {
        last.status = "stopped";
        last.finishedAt = Date.now();
      }
      const stopping = this.terminateProcess(child);
      this._stoppingPromise = stopping;
      await this.saveSessions();
      this.postState();
      try {
        await stopping;
      } finally {
        if (this.cliTurns.get(session.id) === cliTurn) this.cliTurns.delete(session.id);
        if (this._stoppingPromise === stopping) this._stoppingPromise = null;
      }
      this.promptQueue.clear(session.id);
      this.postState();
      return true;
    }
    const acpTurn = this.activeTurns.get(session.id);
    if (acpTurn?.client && acpTurn.acpSessionId) {
      return this.isolateAcpTurnForStop(session.id);
    }
    if (this.acp || this._startingAcp || this.activeTurns.has(session.id)) {
      await this.acpStop(session.id);
      this.promptQueue.clear(session.id);
      this.postState();
      return true;
    }
    if (last) {
      last.status = "stopped";
      last.finishedAt = Date.now();
      await this.saveSessions();
      this.postState();
    }
    this.promptQueue.clear(session.id);
    this.postState();
    return true;
  }

  terminateProcess(child, graceMs = 1000) {
    return new Promise(resolve => {
      let finished = false;
      let forceTimer;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(forceTimer);
        resolve();
      };
      child.once("close", done);
      try { child.kill("SIGTERM"); } catch { done(); return; }
      forceTimer = setTimeout(() => {
        if (finished) return;
        try { child.kill("SIGKILL"); } catch { done(); }
      }, graceMs);
    });
  }

  refreshEditorContext() {
    this.post({ type: "editorContext", context: this.getEditorContext() });
  }

  postState() {
    this.updatePanelTitles();
    this.view?.webview.postMessage(this.stateMessage(this.activeSessionId));
    for (const panel of this.panels) {
      panel.webview.postMessage(this.stateMessage(panel.sessionId));
    }
  }

  stateMessage(sessionId) {
    const config = vscode.workspace.getConfiguration("hermesAgent");
    const command = config.get("command", "");
    const session = this.activeSession(sessionId);
    const sessionSettings = session.settings || {};
    // Merge configured skills with Hermes-installed skills from disk
    const configuredSkills = sessionSettings.skills && sessionSettings.skills.length
      ? sessionSettings.skills
      : config.get("skills", []);
    const installed = hermesSkills();
    const seen = new Set();
    const merged = [];
    for (const skill of [...configuredSkills, ...installed]) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        merged.push(skill);
      }
    }
    const commands = buildCommandCatalog({
      skills: merged,
      quickCommands: hermesConfig().quickCommands,
      availableCommands: this.availableCommandsForSession(session.id)
    });
    const modelState = this.modelStateForSession(session);
    const selectedModel = resolveSelectedModel(
      sessionSettings.model || lastModel(this.context, modelState.current),
      modelState.options,
      modelState.current
    );
    return {
      type: "state",
      activeSessionId: session.id,
      sessions: this.sessions,
      settings: {
        mode: sessionSettings.mode || config.get("defaultMode", "Auto"),
        model: selectedModel,
        skills: merged,
        commands
      },
      models: modelState.options,
      queue: this.promptQueue.snapshot(session.id),
      diagnostics: buildDiagnostics(command),
      editorContext: this.getEditorContext(),
      permission: this.permissionMessageForSession(session.id)
    };
  }

  getEditorContext() {
    // Use the last active document, not the focused one: the webview takes
    // focus while typing, and activeTextEditor goes undefined there.
    const editor = this.lastActiveEditor;
    if (!editor) return null;
    const doc = editor.document;
    // Guard against a document that was closed but whose editor reference
    // survived (e.g. reopened-then-closed tabs).
    if (doc.isClosed) {
      this.lastActiveEditor = undefined;
      return null;
    }
    const selection = editor.selection;
    if (!selection.isEmpty) {
      return {
        type: "selection",
        name: `Selected lines ${selection.start.line + 1}-${selection.end.line + 1}`,
        path: vscode.workspace.asRelativePath(doc.uri, false),
        uri: doc.uri.toString(),
        text: doc.getText(selection)
      };
    }
    return {
      type: "file",
      name: path.basename(doc.uri.fsPath || doc.fileName),
      path: vscode.workspace.asRelativePath(doc.uri, false),
      uri: doc.uri.toString()
    };
  }

  html(webview) {
    const nonce = id();
    const markdownUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "markdown.js"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "styles.css"));
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "resources", "nous-girl.png"));
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${styleUri}">
  <title>Hermes Agent</title>
</head>
<body data-icon="${iconUri}">
  <div id="app"></div>
  <script nonce="${nonce}" src="${markdownUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}


function toAttachment(uri, type) {
  const relative = vscode.workspace.asRelativePath(uri, false);
  return {
    type,
    name: type === "folder" ? path.basename(uri.fsPath || relative) : path.basename(uri.fsPath || relative),
    path: relative,
    uri: uri.toString()
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createSession(title) {
  const now = Date.now();
  return {
    id: id(),
    title,
    createdAt: now,
    updatedAt: now,
    settings: {},
    messages: []
  };
}

/** Remember the last-chosen mode so new sessions inherit it. */
const MODE_KEY = "hermesAgent.lastMode";
function lastMode(ctx) {
  try {
    return ctx.globalState.get(MODE_KEY, "Auto");
  } catch {
    return "Auto";
  }
}
function saveLastMode(ctx, mode) {
  try {
    ctx.globalState.update(MODE_KEY, mode === "Manual" ? "Manual" : "Auto");
  } catch { /* best-effort */ }
}

const MODEL_KEY = "hermesAgent.lastModel";
function lastModel(ctx, fallback = "") {
  try {
    return ctx.globalState.get(MODEL_KEY, fallback) || fallback;
  } catch {
    return fallback;
  }
}
function saveLastModel(ctx, model) {
  try {
    return ctx.globalState.update(MODEL_KEY, String(model || ""));
  } catch { /* best-effort */ }
}

function cloneMessage(message) {
  return { ...JSON.parse(JSON.stringify(message)), id: id() };
}

function buildDiagnostics(command) {
  const diagnostics = [];
  if (!command) {
    diagnostics.push({
      kind: "warning",
      title: "Agent backend not connected",
      message: "Hermes CLI is not configured. Responses are local previews until hermesAgent.command is set."
    });
  }
  return diagnostics;
}

function buildInvocationArgs(args, prompt) {
  const configured = Array.isArray(args) ? args : [];
  let usedPlaceholder = false;
  const resolved = configured.map(arg => {
    if (typeof arg !== "string") return String(arg);
    if (arg.includes("{{prompt}}")) {
      usedPlaceholder = true;
      return arg.replaceAll("{{prompt}}", prompt);
    }
    return arg;
  });
  if (!usedPlaceholder && resolved.length === 0) {
    return {
      args: ["--oneshot", prompt],
      usedPlaceholder: true
    };
  }
  return { args: resolved, usedPlaceholder };
}

function composeHermesPrompt(prompt, userMessage) {
  if (userMessage.command) {
    return `${userMessage.command}${prompt ? ` ${prompt}` : ""}`;
  }
  const parts = [];
  if (userMessage.skill) {
    parts.push(`Skill: ${userMessage.skill}`);
  }
  const contextLines = [];
  for (const attachment of userMessage.attachments || []) {
    contextLines.push(`- ${attachment.type || "file"}: ${attachment.path || attachment.name || attachment.uri}`);
  }
  if (userMessage.editorContext) {
    const context = userMessage.editorContext;
    contextLines.push(`- current ${context.type || "file"}: ${context.path || context.name || context.uri}`);
    if (context.text) {
      contextLines.push("");
      contextLines.push("Selected text:");
      contextLines.push(context.text);
    }
  }
  if (contextLines.length) {
    parts.push(`Context:\n${contextLines.join("\n")}`);
  }
  parts.push(`User request:\n${prompt || "(No text prompt. Use the provided context.)"}`);
  return parts.join("\n\n");
}

function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { activate, deactivate };
