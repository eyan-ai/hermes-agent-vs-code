const vscode = require("vscode");
const path = require("path");
const { spawn } = require("child_process");

const VIEW_ID = "hermesAgent.sidebar";
const SESSION_KEY = "hermesAgent.sessions";

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
    vscode.window.onDidChangeActiveTextEditor(() => provider.refreshEditorContext()),
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
    const session = await this.newSession();
    const panel = vscode.window.createWebviewPanel(
      "hermesAgent.editorSession",
      session.title || "Hermes Agent",
      vscode.ViewColumn.Active,
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
    const folderItems = folders.map(folder => toAttachment(folder.uri, "folder"));
    this.post({ type: "workspaceItems", items: [...folderItems, ...items].slice(0, 80) });
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
    await vscode.window.showTextDocument(uri, { preview: true });
  }

  async openMemoryDoc(file) {
    const allowed = new Set(["SOUL.md", "USER.md", "MEMORY.md"]);
    const name = allowed.has(file) ? file : "MEMORY.md";
    const root = vscode.workspace.workspaceFolders?.[0]?.uri || this.context.globalStorageUri;
    const dir = vscode.Uri.joinPath(root, ".hermes");
    const uri = vscode.Uri.joinPath(dir, name);
    try {
      await vscode.workspace.fs.createDirectory(dir);
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        const title = name.replace(".md", "");
        const body = `# ${title}\n\nEdit this file to shape Hermes Agent behavior and memory.\n`;
        await vscode.workspace.fs.writeFile(uri, Buffer.from(body, "utf8"));
      }
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (error) {
      vscode.window.showErrorMessage(`Unable to open ${name}: ${error.message}`);
    }
  }

  async sendPrompt(message) {
    const session = this.activeSession();
    const prompt = String(message.prompt || "");
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
      thinking: [
        { kind: "thinking", title: "Thinking", text: "Preparing context and request." }
      ],
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
    const args = config.get("commandArgs", []);
    if (!command) {
      assistantMessage.thinking.push({ kind: "error", title: "Agent backend not connected", text: "hermesAgent.command is empty. Using local preview response." });
      await this.mockStream(prompt, userMessage, assistantMessage);
      return;
    }
    await this.runCli(command, args, prompt, userMessage, assistantMessage);
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
      child.stdout.on("data", data => {
        const chunk = data.toString();
        assistantMessage.text += chunk;
        this.post({ type: "assistantChunk", sessionId: session.id, messageId: assistantMessage.id, chunk });
      });
      child.stderr.on("data", data => {
        const chunk = data.toString();
        assistantMessage.text += `\n${chunk}`;
        assistantMessage.thinking.push({ kind: "error", title: "stderr", text: chunk.trim() });
        this.post({ type: "assistantChunk", sessionId: session.id, messageId: assistantMessage.id, chunk: `\n${chunk}` });
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
        assistantMessage.thinking.push({
          kind: code === 0 ? "success" : "error",
          title: code === 0 ? "Done" : "Failed",
          text: `Process exited with code ${code}.`
        });
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
    const session = this.activeSession();
    const last = [...session.messages].reverse().find(message => message.role === "assistant" && message.status === "running");
    if (last) {
      last.status = "stopped";
      last.finishedAt = Date.now();
      this.saveSessions().then(() => this.postState());
    }
  }

  refreshEditorContext() {
    this.post({ type: "editorContext", context: getEditorContext() });
  }

  postState() {
    const config = vscode.workspace.getConfiguration("hermesAgent");
    const command = config.get("command", "");
    const model = config.get("model", "5.5");
    this.post({
      type: "state",
      activeSessionId: this.activeSessionId,
      sessions: this.sessions,
      settings: {
        mode: config.get("defaultMode", "Auto"),
        model,
        effort: config.get("effort", "Medium"),
        skills: config.get("skills", [])
      },
      diagnostics: buildDiagnostics(command, model),
      editorContext: getEditorContext()
    });
  }

  html(webview) {
    const nonce = id();
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
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getEditorContext() {
  const editor = vscode.window.activeTextEditor;
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

function buildDiagnostics(command, model) {
  const diagnostics = [];
  if (!command) {
    diagnostics.push({
      kind: "warning",
      title: "Agent backend not connected",
      message: "Hermes CLI is not configured. Responses are local previews until hermesAgent.command is set."
    });
  }
  const supportedModels = new Set(["5.6 Sol", "5.6 Terra", "5.6 Luna", "5.5", "5.4", "5.4 Mini"]);
  if (model && !supportedModels.has(model)) {
    diagnostics.push({
      kind: "warning",
      title: "Model may be unavailable",
      message: `${model} is not in the installed model list. Pick another model or update Hermes Agent.`
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
