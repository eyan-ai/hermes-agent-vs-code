const vscode = require("vscode");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");
const { createChatParser } = require("./lib/chat-parser");
const { AcpClient } = require("./lib/acp-client");
const { createAcpRenderer } = require("./lib/acp-render");

const VIEW_ID = "hermesAgent.sidebar";
const SESSION_KEY = "hermesAgent.sessions";

const HERMES_HOME = path.join(os.homedir(), ".hermes");
const HERMES_DOC_PATHS = {
  "SOUL.md": path.join(HERMES_HOME, "SOUL.md"),
  "USER.md": path.join(HERMES_HOME, "memories", "USER.md"),
  "MEMORY.md": path.join(HERMES_HOME, "memories", "MEMORY.md")
};

let _hermesConfig = null;
function hermesConfig() {
  if (_hermesConfig) return _hermesConfig;
  const result = { model: "", provider: "" };
  try {
    const lines = fs.readFileSync(path.join(HERMES_HOME, "config.yaml"), "utf8").split("\n");
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

let _hermesModels = null;
function hermesModels() {
  if (_hermesModels) return _hermesModels;
  const ids = [];
  const seen = new Set();
  const config = hermesConfig();
  try {
    const catalog = JSON.parse(fs.readFileSync(path.join(HERMES_HOME, "cache", "model_catalog.json"), "utf8"));
    const providers = catalog.providers || {};
    const push = models => {
      for (const entry of models || []) {
        const id = typeof entry === "string" ? entry : entry && entry.id;
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    };
    // Current provider's models first, then the rest.
    if (config.provider && providers[config.provider]) push(providers[config.provider].models);
    for (const name of Object.keys(providers)) {
      if (name !== config.provider) push(providers[name].models);
    }
  } catch { /* catalog absent */ }
  if (config.model && !seen.has(config.model)) {
    seen.add(config.model);
    ids.unshift(config.model);
  }
  _hermesModels = ids;
  return ids;
}


function activate(context) {
  const provider = new HermesSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand("hermesAgent.open", () => {
      vscode.commands.executeCommand("workbench.view.extension.hermesAgent");
    }),
    vscode.commands.registerCommand("hermesAgent.openEditorSession", () => {
      provider.openEditorSession();
    }),
    vscode.commands.registerCommand("hermesAgent.newSession", () => {
      provider.newSession();
    }),
    vscode.commands.registerCommand("hermesAgent.focusInput", () => {
      provider.post({ type: "focusInput" });
    }),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      // Track the last active document across focus changes (the webview
      // steals focus when typing, so activeTextEditor goes undefined there).
      if (editor) provider.lastActiveEditor = editor;
      provider.refreshEditorContext();
    }),
    vscode.window.onDidChangeTextEditorSelection(() => provider.refreshEditorContext())
  );
}

function deactivate() {}

class HermesSidebarProvider {
  constructor(context) {
    this.context = context;
    this.view = undefined;
    this.panels = new Set();
    this.sessions = this.loadSessions();
    this.activeSessionId = this.sessions[0]?.id;
    this.runningProcess = undefined;
    this.lastActiveEditor = vscode.window.activeTextEditor;
    // ACP transport state (lazy): one shared `hermes acp` process for all
    // sessions; per-session mapping uiSession.id → acp session_id.
    this.acp = undefined;
    this.acpSessions = new Map();
    this.acpRenderers = new Map();
  }

  resolveWebviewView(view) {
    this.view = view;
    this.configureWebview(view.webview);
  }

  post(message) {
    this.view?.webview.postMessage(message);
    for (const panel of this.panels) {
      panel.webview.postMessage(message);
    }
  }

  configureWebview(webview) {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
        vscode.Uri.joinPath(this.context.extensionUri, "resources")
      ]
    };
    webview.html = this.html(webview);
    webview.onDidReceiveMessage(message => this.onMessage(message));
  }

  loadSessions() {
    const saved = this.context.globalState.get(SESSION_KEY);
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return [createSession("Untitled")];
  }

  saveSessions() {
    return this.context.globalState.update(SESSION_KEY, this.sessions);
  }

  activeSession() {
    let session = this.sessions.find(item => item.id === this.activeSessionId);
    if (!session) {
      session = this.sessions[0] || createSession("Untitled");
      if (!this.sessions.length) this.sessions.push(session);
      this.activeSessionId = session.id;
    }
    return session;
  }

  async newSession() {
    const session = createSession("Untitled");
    this.sessions.unshift(session);
    this.activeSessionId = session.id;
    await this.saveSessions();
    this.postState();
    return session;
  }

  async openEditorSession() {
    // Reuse an existing agent column if there is one (ours or another
    // plugin's webview) — add a tab there. Otherwise open a new column
    // beside the current document.
    const session = await this.newSession();
    const targetColumn = this.findAgentColumn();
    const panel = vscode.window.createWebviewPanel(
      "hermesAgent.editorSession",
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
    this.panels.add(panel);
    this.configureWebview(panel.webview);
    panel.onDidDispose(() => {
      this.panels.delete(panel);
    });
    this.refreshEditorContext();
  }

  findAgentColumn() {
    // Our own panels first, then any group already hosting a webview
    // (Claude Code and other agent plugins live there too).
    for (const panel of this.panels) {
      if (panel.viewColumn !== undefined) return panel.viewColumn;
    }
    for (const group of vscode.window.tabGroups.all) {
      if (group.tabs.some(tab => tab.input instanceof vscode.TabInputWebview)) {
        return group.viewColumn;
      }
    }
    return vscode.ViewColumn.Beside;
  }

  async onMessage(message) {
    switch (message.type) {
      case "ready":
        this.postState();
        this.refreshEditorContext();
        break;
      case "newSession":
        await this.newSession();
        break;
      case "selectSession":
        this.activeSessionId = message.id;
        await this.saveSessions();
        this.postState();
        break;
      case "renameSession":
        await this.renameSession(message.id, message.title);
        break;
      case "deleteSession":
        await this.deleteSession(message.id);
        break;
      case "searchWorkspace":
        await this.searchWorkspace(message.query);
        break;
      case "pickLocal":
        await this.pickLocal();
        break;
      case "sendPrompt":
        await this.sendPrompt(message);
        break;
      case "copyAnswer":
        await vscode.env.clipboard.writeText(String(message.text || ""));
        break;
      case "openLink": {
        const url = String(message.url || "");
        if (/^https?:\/\//i.test(url)) await vscode.env.openExternal(vscode.Uri.parse(url));
        break;
      }
      case "stop":
        this.stop();
        break;
      case "openAttachment":
        await this.openAttachment(message.attachment);
        break;
      case "openMemoryDoc":
        await this.openMemoryDoc(message.file);
        break;
      case "settingsChanged":
        this.activeSession().settings = message.settings;
        await this.saveSessions();
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

  async deleteSession(id) {
    if (this.sessions.length <= 1) return;
    const index = this.sessions.findIndex(item => item.id === id);
    if (index < 0) return;
    // Drop the ACP session mapping (the server session stays alive until
    // its process exits; the renderer is gone with the UI session).
    const acpSessionId = this.acpSessions.get(id);
    if (acpSessionId) {
      this.acpRenderers.delete(acpSessionId);
      this.acpSessions.delete(id);
    }
    this.sessions.splice(index, 1);
    if (this.activeSessionId === id) {
      this.activeSessionId = this.sessions[Math.max(0, index - 1)]?.id || this.sessions[0]?.id;
    }
    await this.saveSessions();
    this.postState();
  }

  async searchWorkspace(query = "") {
    const folders = vscode.workspace.workspaceFolders || [];
    if (!folders.length) {
      this.post({ type: "workspaceItems", items: [] });
      return;
    }
    const lower = query.toLowerCase();
    const files = await vscode.workspace.findFiles("**/*", "{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}", 120);
    const items = files
      .map(uri => toAttachment(uri, "file"))
      .filter(item => !lower || item.name.toLowerCase().includes(lower) || item.path.toLowerCase().includes(lower));
    // Files inside the opened folder only — the folder itself is not listed.
    this.post({ type: "workspaceItems", items: items.slice(0, 80) });
  }

  async pickLocal() {
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
    });
  }

  async openAttachment(attachment) {
    if (!attachment?.uri) return;
    const uri = vscode.Uri.parse(attachment.uri);
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type & vscode.FileType.Directory) {
      await vscode.commands.executeCommand("revealFileInOS", uri);
      return;
    }
    await vscode.window.showTextDocument(uri, { preview: true, viewColumn: this.findDocumentColumn() });
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
      const doc = await vscode.workspace.openTextDocument(uri);
      // Open in the document column (a group holding text editors), never in
      // the agent/webview column.
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: this.findDocumentColumn() });
    } catch (error) {
      vscode.window.showErrorMessage(`Unable to open ${name}: ${error.message}`);
    }
  }

  findDocumentColumn() {
    for (const group of vscode.window.tabGroups.all) {
      if (group.tabs.some(tab => tab.input instanceof vscode.TabInputText)) {
        return group.viewColumn;
      }
    }
    return vscode.ViewColumn.One;
  }

  async sendPrompt(message) {
    const session = this.activeSession();
    const prompt = String(message.prompt || "");
    if (Number.isInteger(message.replaceFromIndex) && message.replaceFromIndex >= 0) {
      session.messages.splice(message.replaceFromIndex);
    }
    const userMessage = {
      id: id(),
      role: "user",
      text: prompt,
      skill: message.skill || "",
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
    session.title = session.title === "Untitled" && prompt ? prompt.slice(0, 64) : session.title;
    session.updatedAt = Date.now();
    await this.saveSessions();
    this.postState();
    await this.runAgent(prompt, userMessage, assistantMessage);
  }

  async runAgent(prompt, userMessage, assistantMessage) {
    const config = vscode.workspace.getConfiguration("hermesAgent");
    const command = config.get("command", "");
    if (!command) {
      assistantMessage.thinking.push({ kind: "error", title: "Agent backend not connected", text: "hermesAgent.command is empty. Using local preview response." });
      await this.mockStream(prompt, userMessage, assistantMessage);
      return;
    }
    const useAcp = config.get("useAcp", true);
    if (useAcp) {
      try {
        await this.runAcp(command, prompt, userMessage, assistantMessage);
        return;
      } catch (err) {
        // ACP failed (missing extra, protocol error, …) — surface once, then
        // fall back to the CLI parser path so the extension still works.
        assistantMessage.thinking.push({ kind: "error", title: "ACP unavailable", text: `${err.message || err}\nFalling back to CLI output parsing.` });
        this.postState();
      }
    }
    await this.runCli(command, config.get("commandArgs", []), prompt, userMessage, assistantMessage);
  }

  /**
   * Run one turn through the ACP transport (`hermes acp`).
   *
   * Streams structured session updates (thinking chunks, tool calls, message
   * deltas) into the SAME UI message protocol the CLI parser used, so the
   * webview is untouched.
   */
  async runAcp(command, prompt, userMessage, assistantMessage) {
    const session = this.activeSession();
    const client = await this.ensureAcp(command);
    let acpSessionId = this.acpSessions.get(session.id);
    if (!acpSessionId) {
      const created = await client.request("session/new", { cwd: this.workspaceCwd(), mcpServers: [] });
      acpSessionId = created.sessionId;
      this.acpSessions.set(session.id, acpSessionId);
    }

    // Per-session renderer: ACP updates → thinking steps / answer chunks.
    const renderer = createAcpRenderer({ assistantMessage, post: msg => this.post(msg), session });
    this.acpRenderers.set(acpSessionId, renderer);

    const composed = composeHermesPrompt(prompt, userMessage);
    const finishReason = await client.request("session/prompt", {
      sessionId: acpSessionId,
      prompt: [{ type: "text", text: composed }]
    });

    if (assistantMessage.status === "running") {
      renderer.finalize(finishReason && finishReason.stopReason === "refusal" ? "failed" : "done");
    }
    this.acpRenderers.delete(acpSessionId);
    await this.saveSessions();
    this.postState();
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
          const renderer = this.acpRenderers.get(acpSessionId);
          if (renderer) renderer.onSessionUpdate(update);
        },
        onError: err => {
          vscode.window.showWarningMessage(`Hermes ACP: ${err.message}`);
        },
        onExit: code => {
          // Process died — fail any in-flight renderers.
          for (const renderer of this.acpRenderers.values()) {
            renderer.finalize("failed");
          }
          this.acpRenderers.clear();
          this.acp = undefined;
          this.acpSessions.clear();
          if (code) vscode.window.showWarningMessage(`Hermes ACP exited (code ${code}).`);
        },
        onStderr: line => {
          // Only genuine failures reach the UI. Hermes logs INFO/WARNING
          // chatter (auxiliary client health, payment fallbacks, registry
          // scans) to stderr — surfacing those would leak internal noise
          // like "marking openrouter unhealthy (payment / credit error)"
          // into the working timeline. Require an explicit error marker.
          if (/\[ERROR\]|\[CRITICAL\]|Traceback|^Error:|FATAL/i.test(line)) {
            const session = this.activeSession();
            const last = [...session.messages].reverse().find(message => message.role === "assistant" && message.status === "running");
            if (last && !last._acpStderrNoted) {
              last._acpStderrNoted = true;
              last.thinking.push({ kind: "error", title: "stderr", text: line.slice(0, 1000) });
              this.post({ type: "thinkingUpdate", sessionId: session.id, messageId: last.id, thinking: last.thinking.map(step => ({ ...step })) });
            }
          }
        }
      }
    });
    try {
      await client.start();
      await client.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "hermes-agent-vscode", version: "0.2.8" }
      });
    } catch (err) {
      client.kill();
      throw err;
    }
    this.acp = client;
    return client;
  }

  /** Cancel the ACP turn for the active session (keeps the process alive). */
  async acpStop() {
    const session = this.activeSession();
    const acpSessionId = this.acpSessions.get(session.id);
    if (this.acp && acpSessionId) {
      // session/cancel is a JSON-RPC notification (no response) per ACP spec.
      this.acp.notify("session/cancel", { sessionId: acpSessionId });
    }
    const renderer = this.acpRenderers.get(acpSessionId);
    if (renderer) renderer.finalize("stopped");
    this.acpRenderers.delete(acpSessionId);
  }

  workspaceCwd() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
  }

  async mockStream(prompt, userMessage, assistantMessage) {
    const session = this.activeSession();
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
    for (const chunk of chunks) {
      await delay(220);
      assistantMessage.text += chunk;
      this.post({ type: "assistantChunk", sessionId: session.id, messageId: assistantMessage.id, chunk });
    }
    assistantMessage.status = "done";
    assistantMessage.finishedAt = Date.now();
    assistantMessage.thinking.push({ kind: "success", title: "Done", text: "Response completed." });
    await this.saveSessions();
    this.postState();
  }

  async runCli(command, args, prompt, userMessage, assistantMessage) {
    const session = this.activeSession();
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
      this.runningProcess = child;
      // Parse `hermes chat -q ... -v` output: reasoning blocks become
      // thinking steps, `📞 Tool N` calls become tool steps, and the
      // final `╭─ Hermes ╮` block streams as the answer text.
      const pushThinking = () => {
        this.post({ type: "thinkingUpdate", sessionId: session.id, messageId: assistantMessage.id, thinking: assistantMessage.thinking.map(step => ({ ...step })) });
      };
      const parser = createChatParser({
        onThinkingEnd: text => {
          // Converge reasoning to a readable head; the frontend expands it.
          assistantMessage.thinking.push({ kind: "thinking", title: "Thinking", text: text.slice(0, 2000) });
          pushThinking();
        },
        onTool: tool => {
          assistantMessage.thinking.push({ kind: "tool", title: tool.name, summary: tool.summary || tool.name, code: tool.code || "", result: tool.result || "", done: tool.done, status: tool.status || "pending" });
          pushThinking();
        },
        onToolUpdate: tool => {
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
          assistantMessage.text += `${line}\n`;
          this.post({ type: "assistantChunk", sessionId: session.id, messageId: assistantMessage.id, chunk: `${line}\n` });
        }
      });
      child.stdout.on("data", data => parser.onChunk(data.toString()));
      child.stdout.on("end", () => parser.flush());
      child.stderr.on("data", data => {
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
        assistantMessage.status = "failed";
        assistantMessage.finishedAt = Date.now();
        assistantMessage.text += `Hermes CLI failed to start: ${error.message}`;
        assistantMessage.thinking.push({ kind: "error", title: "Hermes CLI unavailable", text: error.message });
        this.runningProcess = undefined;
        this.saveSessions().then(() => this.postState()).then(resolve);
      });
      child.on("close", code => {
        if (assistantMessage.status === "failed") return;
        assistantMessage.status = code === 0 ? "done" : "failed";
        assistantMessage.finishedAt = Date.now();
        if (code !== 0) {
          // A clean exit needs no celebratory step — success is already
          // visible via the ✓ badges on each tool row.
          assistantMessage.thinking.push({ kind: "error", title: "Failed", text: `Process exited with code ${code}.` });
        }
        this.runningProcess = undefined;
        this.saveSessions().then(() => this.postState()).then(resolve);
      });
      child.stdin.end(usesPromptPlaceholder ? "" : composedPrompt);
    });
  }

  stop() {
    if (this.runningProcess) {
      this.runningProcess.kill();
      this.runningProcess = undefined;
    }
    if (this.acp) {
      this.acpStop();
      return;
    }
    const session = this.activeSession();
    const last = [...session.messages].reverse().find(message => message.role === "assistant" && message.status === "running");
    if (last) {
      last.status = "stopped";
      last.finishedAt = Date.now();
      this.saveSessions().then(() => this.postState());
    }
  }

  refreshEditorContext() {
    this.post({ type: "editorContext", context: this.getEditorContext() });
  }

  postState() {
    const config = vscode.workspace.getConfiguration("hermesAgent");
    const command = config.get("command", "");
    const models = hermesModels();
    // Echo what the user actually picked in the session first; fall back to
    // VS Code settings / hermes config / first catalog model.
    const sessionSettings = this.activeSession().settings || {};
    const model = sessionSettings.model || config.get("model", "") || hermesConfig().model || models[0] || "";
    this.post({
      type: "state",
      activeSessionId: this.activeSessionId,
      sessions: this.sessions,
      settings: {
        mode: sessionSettings.mode || config.get("defaultMode", "Auto"),
        model,
        effort: sessionSettings.effort || config.get("effort", "Medium"),
        skills: sessionSettings.skills && sessionSettings.skills.length ? sessionSettings.skills : config.get("skills", [])
      },
      models,
      diagnostics: buildDiagnostics(command, model, models),
      editorContext: this.getEditorContext()
    });
  }

  getEditorContext() {
    // Use the last active document, not the focused one: the webview takes
    // focus while typing, and activeTextEditor goes undefined there.
    const editor = this.lastActiveEditor;
    if (!editor) return null;
    const doc = editor.document;
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

function cloneMessage(message) {
  return { ...JSON.parse(JSON.stringify(message)), id: id() };
}

function buildDiagnostics(command, model, models = hermesModels()) {
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
