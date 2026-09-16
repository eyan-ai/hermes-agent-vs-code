"use strict";

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { AcpClient } = require("../lib/acp-client");
const { createAcpRenderer } = require("../lib/acp-render");
const {
  FrameDecoder,
  PROTOCOL_VERSION,
  atomicWriteJson,
  encodeFrame,
  socketPathFor
} = require("../lib/background-protocol");

const TERMINAL_STATUSES = new Set(["done", "failed", "interrupted"]);
const RUN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

class BackgroundHost {
  constructor({ storageDir, token, socketPath, instanceId, idleMs = 30_000, cliStopGraceMs = 1000, writeState = atomicWriteJson }) {
    this.storageDir = storageDir;
    this.token = token;
    this.instanceId = instanceId || crypto.randomUUID();
    this.socketPath = socketPath || socketPathFor(storageDir, this.instanceId);
    this.idleMs = idleMs;
    this.cliStopGraceMs = cliStopGraceMs;
    this.stateFile = path.join(storageDir, "runs.json");
    this.connections = new Set();
    this.runs = new Map();
    this.activeRunBySession = new Map();
    this.pendingPermissions = new Map();
    this.cliProcesses = new Map();
    this.acpRunRenderers = new Map();
    this.acp = undefined;
    this.acpConfigKey = "";
    this.server = undefined;
    this.idleTimer = undefined;
    this.inFlightOperations = 0;
    this.retiring = false;
    this.writeState = writeState;
    this.persistRequested = false;
    this.persistPromise = undefined;
    this._loadState();
  }

  _loadState() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
      for (const raw of saved.runs || []) {
        const run = { ...raw };
        if (!TERMINAL_STATUSES.has(run.status)) {
          run.status = "interrupted";
          run.completedAt = Date.now();
        }
        if (TERMINAL_STATUSES.has(run.status) && Date.now() - Number(run.completedAt || 0) > RUN_RETENTION_MS) continue;
        this.runs.set(run.runId, run);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  async listen() {
    await fs.promises.mkdir(this.storageDir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      try { await fs.promises.unlink(this.socketPath); } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    this.server = net.createServer(socket => this._accept(socket));
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.socketPath, () => {
        this.server.removeListener("error", reject);
        resolve();
      });
    });
    if (process.platform !== "win32") await fs.promises.chmod(this.socketPath, 0o600);
    this._scheduleIdleExit();
    return this;
  }

  snapshot() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      instanceId: this.instanceId,
      runs: [...this.runs.values()].map(run => JSON.parse(JSON.stringify(run)))
    };
  }

  _persist() {
    this.persistRequested = true;
    if (!this.persistPromise) {
      const active = (async () => {
        while (this.persistRequested) {
          this.persistRequested = false;
          await this.writeState(this.stateFile, this.snapshot());
        }
      })();
      this.persistPromise = active;
      active.finally(() => {
        if (this.persistPromise === active) this.persistPromise = undefined;
      }).catch(() => {});
    }
    return this.persistPromise;
  }

  _accept(socket) {
    socket.setEncoding("utf8");
    const connection = { socket, authenticated: false, clientId: "", decoder: undefined };
    connection.decoder = new FrameDecoder(() => socket.destroy());
    socket.on("data", chunk => {
      for (const message of connection.decoder.push(chunk)) {
        this._handle(connection, message).catch(error => {
          this._send(connection, { type: "error", message: error.message });
        });
      }
    });
    socket.on("error", () => {
      // A migrating client may disconnect immediately after requesting idle shutdown.
    });
    socket.on("close", () => {
      this.connections.delete(connection);
      this._scheduleIdleExit();
    });
  }

  async _handle(connection, message) {
    if (!connection.authenticated) {
      if (message.type !== "hello"
        || message.token !== this.token
        || message.protocolVersion !== PROTOCOL_VERSION) {
        connection.socket.destroy();
        return;
      }
      connection.authenticated = true;
      connection.clientId = String(message.clientId || "");
      this.connections.add(connection);
      this._send(connection, {
        type: "hello.ok",
        protocolVersion: PROTOCOL_VERSION,
        instanceId: this.instanceId
      });
      for (const pending of this.pendingPermissions.values()) {
        this._send(connection, { type: "acp.permission", runId: pending.runId, request: pending.request });
      }
      return;
    }

    clearTimeout(this.idleTimer);
    this.inFlightOperations += 1;
    try {
      return await this._handleAuthenticated(connection, message);
    } finally {
      this.inFlightOperations = Math.max(0, this.inFlightOperations - 1);
      this._scheduleIdleExit();
    }
  }

  async _handleAuthenticated(connection, message) {
    if (this.retiring && message.type !== "host.shutdownIfIdle") {
      if (message.id) this._send(connection, { type: "response", id: message.id, error: "Hermes background host is retiring" });
      return;
    }
    if (message.type === "host.shutdownIfIdle") {
      if (this.retiring) {
        this._send(connection, {
          type: "response",
          id: message.id,
          result: { shuttingDown: true, active: false }
        });
        return;
      }
      const active = this.inFlightOperations > 1
        || [...this.runs.values()].some(run => !TERMINAL_STATUSES.has(run.status));
      if (!active) this.retiring = true;
      this._send(connection, {
        type: "response",
        id: message.id,
        result: { shuttingDown: !active, active }
      });
      if (!active) {
        setImmediate(() => this.close({ terminateAcp: true }).then(() => {
          if (require.main === module) process.exit(0);
        }));
      }
      return;
    }
    if (message.type === "snapshot.get") {
      this._send(connection, { type: "snapshot", id: message.id, snapshot: this.snapshot() });
      return;
    }
    if (message.type === "run.ack") {
      const run = this.runs.get(message.runId);
      if (run && TERMINAL_STATUSES.has(run.status)) {
        this.runs.delete(message.runId);
        await this._persist();
      }
      return;
    }
    if (message.type === "acp.respond") {
      const pending = this.pendingPermissions.get(message.requestId);
      if (!pending) return;
      this.pendingPermissions.delete(message.requestId);
      const run = this.runs.get(pending.runId);
      if (run) {
        run.status = "running";
        delete run.pendingPermission;
      }
      this.acp?.respond(message.requestId, message.result);
      await this._persist();
      return;
    }
    if (message.type === "cli.cancel") {
      const entry = this.cliProcesses.get(message.runId);
      const stopping = entry ? await this._terminateCliChild(entry.child) : false;
      this._send(connection, { type: "response", id: message.id, result: { stopping } });
      return;
    }
    if (message.type === "cli.run") {
      await this._runCli(connection, message);
      return;
    }
    if (message.type === "acp.stop") {
      let stopped = true;
      if (this.acp) {
        this.acp.intentionalStop = true;
        stopped = await this.acp.killAndWait(1000);
        if (stopped) {
          this.acp = undefined;
          this.acpConfigKey = "";
        }
      }
      this._send(connection, { type: "response", id: message.id, result: { stopped } });
      return;
    }
    if (message.type === "acp.notify") {
      const client = await this._ensureAcp(message.config);
      client.notify(message.method, message.params);
      return;
    }
    if (message.type === "acp.request") {
      const client = await this._ensureAcp(message.config);
      const params = { ...(message.params || {}) };
      const metadata = params._background;
      delete params._background;
      if (message.method === "initialize" && this.initializeResult) {
        this._send(connection, { type: "response", id: message.id, result: this.initializeResult });
        return;
      }
      let run;
      if (message.method === "session/prompt" && metadata?.runId) {
        const existing = this.runs.get(metadata.runId);
        run = {
          ...(existing || {}),
          ...metadata,
          transport: "acp",
          acpSessionId: params.sessionId,
          status: "running",
          seq: existing?.seq || 0,
          events: existing?.events || [],
          startedAt: existing?.startedAt || Date.now()
        };
        this.runs.set(run.runId, run);
        this.activeRunBySession.set(params.sessionId, run.runId);
        this.acpRunRenderers.set(run.runId, createAcpRenderer({
          assistantMessage: { text: "", thinking: [], status: "running" },
          post() {},
          session: { id: metadata.uiSessionId || params.sessionId }
        }));
        await this._persist();
      }
      try {
        let result = await client.request(message.method, params);
        if (message.method === "initialize") this.initializeResult = result;
        if (run) {
          const status = result?.stopReason === "refusal" ? "failed" : "done";
          const renderer = this.acpRunRenderers.get(run.runId);
          const finalization = renderer?.finalize(status);
          if (status === "done" && finalization?.needsFinalAnswer && metadata.finalAnswerPrompt) {
            run.finalAnswerSeq = run.seq;
            await this._persist();
            this._broadcast({
              type: "acp.final_answer",
              runId: run.runId,
              sessionId: run.acpSessionId,
              afterSeq: run.finalAnswerSeq
            });
            renderer.beginFinalAnswerOnly();
            try {
              const finalResult = await client.request("session/prompt", {
                sessionId: run.acpSessionId,
                prompt: [{ type: "text", text: metadata.finalAnswerPrompt }]
              });
              if (finalResult?.usage) result = { ...result, usage: finalResult.usage };
            } catch (error) {
              run.finalAnswerError = error.message;
            }
            renderer.finalize("done");
          }
          result = { ...(result || {}), _backgroundFinalAnswerHandled: true };
          run.status = status;
          run.result = result;
          run.completedAt = Date.now();
          this.activeRunBySession.delete(run.acpSessionId);
          this.acpRunRenderers.delete(run.runId);
          await this._persist();
          this._broadcast({ type: "run.completed", run: { ...run } });
        }
        this._send(connection, { type: "response", id: message.id, result });
      } catch (error) {
        if (run) {
          run.status = "failed";
          run.error = error.message;
          run.completedAt = Date.now();
          this.activeRunBySession.delete(run.acpSessionId);
          this.acpRunRenderers.delete(run.runId);
          await this._persist();
          this._broadcast({ type: "run.completed", run: { ...run } });
        }
        this._send(connection, { type: "response", id: message.id, error: error.message });
      } finally {
        this._scheduleIdleExit();
      }
      return;
    }
  }

  async _ensureAcp(config = {}) {
    const command = String(config.command || "");
    const args = Array.isArray(config.args) ? config.args.map(String) : ["acp"];
    const cwd = String(config.cwd || os.homedir());
    if (!command) throw new Error("Hermes command is required");
    const key = JSON.stringify({ command, args, cwd });
    if (this.acp && !this.acp.exited) {
      if (key !== this.acpConfigKey) throw new Error("Hermes background host is already using a different command");
      return this.acp;
    }
    let client;
    client = new AcpClient({
      command,
      args,
      cwd,
      handlers: {
        onSessionUpdate: (update, sessionId) => this._onSessionUpdate(update, sessionId),
        onPermissionRequest: request => this._onPermissionRequest(client, request),
        onStderr: line => this._broadcast({ type: "acp.stderr", line }),
        onError: error => this._broadcast({ type: "acp.error", message: error.message }),
        onExit: code => {
          this._broadcast({ type: "acp.exit", code });
          if (this.acp === client) this.acp = undefined;
        }
      }
    });
    await client.start();
    this.acp = client;
    this.acpConfigKey = key;
    return client;
  }

  _onSessionUpdate(update, sessionId) {
    const runId = this.activeRunBySession.get(sessionId);
    const run = runId && this.runs.get(runId);
    if (run) {
      run.seq += 1;
      run.events.push({ seq: run.seq, sessionId, update });
      this.acpRunRenderers.get(run.runId)?.onSessionUpdate(update);
      this._persist().catch(() => {});
    }
    this._broadcast({ type: "acp.update", runId, sessionId, update, seq: run?.seq });
  }

  async _runCli(connection, message) {
    const input = message.input || {};
    const metadata = input.metadata || {};
    if (!metadata.runId) throw new Error("CLI run metadata is required");
    const run = {
      ...metadata,
      transport: "cli",
      status: "running",
      seq: 0,
      events: [],
      startedAt: Date.now()
    };
    this.runs.set(run.runId, run);
    await this._persist();
    const child = require("child_process").spawn(input.command, input.args || [], {
      cwd: input.cwd,
      env: { ...process.env, ...(input.env || {}) },
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.cliProcesses.set(run.runId, { child, run });
    const append = (kind, chunk) => {
      run.seq += 1;
      const event = { seq: run.seq, kind, chunk: String(chunk) };
      run.events.push(event);
      this._persist().catch(() => {});
      this._broadcast({ type: "cli.event", runId: run.runId, event });
    };
    child.stdout.on("data", chunk => append("stdout", chunk));
    child.stderr.on("data", chunk => append("stderr", chunk));
    child.on("error", error => append("error", error.message));
    child.on("close", async (code, signal) => {
      this.cliProcesses.delete(run.runId);
      run.status = signal ? "interrupted" : code === 0 ? "done" : "failed";
      run.exitCode = code;
      run.signal = signal;
      run.completedAt = Date.now();
      await this._persist();
      this._broadcast({ type: "run.completed", run: { ...run } });
      this._send(connection, { type: "response", id: message.id, result: { code, signal, status: run.status } });
      this._scheduleIdleExit();
    });
    child.stdin.end(String(input.stdin || ""));
  }

  _onPermissionRequest(client, request) {
    const sessionId = request.params?.sessionId || "";
    const runId = this.activeRunBySession.get(sessionId);
    const run = runId && this.runs.get(runId);
    const options = Array.isArray(request.params?.options) ? request.params.options : [];
    const allow = options.find(option => ["allow_once", "allow", "allow_session", "allow_always"].includes(option.optionId));
    if (run?.mode === "Auto" && allow) {
      client.respond(request.id, { outcome: { outcome: "selected", optionId: allow.optionId } });
      return;
    }
    const pending = { runId, request };
    this.pendingPermissions.set(request.id, pending);
    if (run) {
      run.transport = "acp";
      run.status = "waiting_permission";
      run.pendingPermission = request;
      this._persist().catch(() => {});
    }
    this._broadcast({ type: "acp.permission", runId, request });
  }

  _terminateCliChild(child) {
    if (!child) return Promise.resolve(false);
    if (child.exitCode !== null && child.exitCode !== undefined) return Promise.resolve(true);
    return new Promise(resolve => {
      let finished = false;
      let forceTimer;
      let timeoutTimer;
      const done = stopped => {
        if (finished) return;
        finished = true;
        clearTimeout(forceTimer);
        clearTimeout(timeoutTimer);
        child.removeListener?.("close", onClose);
        resolve(stopped);
      };
      const onClose = () => done(true);
      child.once("close", onClose);
      try {
        child.kill("SIGTERM");
      } catch {
        done(true);
        return;
      }
      forceTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          done(false);
          return;
        }
        timeoutTimer = setTimeout(() => done(false), this.cliStopGraceMs);
      }, this.cliStopGraceMs);
    });
  }

  _send(connection, message) {
    if (!connection?.authenticated || connection.socket.destroyed) return false;
    try {
      connection.socket.write(encodeFrame(message));
      return true;
    } catch {
      return false;
    }
  }

  _broadcast(message) {
    for (const connection of this.connections) this._send(connection, message);
  }

  _hasActiveWork() {
    return this.inFlightOperations > 0
      || [...this.runs.values()].some(run => !TERMINAL_STATUSES.has(run.status));
  }

  _scheduleIdleExit() {
    clearTimeout(this.idleTimer);
    if (this._hasActiveWork()) return;
    this.idleTimer = setTimeout(() => {
      if (!this._hasActiveWork()) this.close({ terminateAcp: true }).then(() => {
        if (require.main === module) process.exit(0);
      });
    }, this.idleMs);
    this.idleTimer.unref?.();
  }

  async close({ terminateAcp = false } = {}) {
    clearTimeout(this.idleTimer);
    for (const connection of this.connections) connection.socket.destroy();
    this.connections.clear();
    if (terminateAcp) {
      for (const { child } of this.cliProcesses.values()) {
        try { child.kill("SIGTERM"); } catch { /* already gone */ }
      }
      this.cliProcesses.clear();
    }
    if (terminateAcp && this.acp) {
      this.acp.intentionalStop = true;
      await this.acp.killAndWait(1000);
      this.acp = undefined;
    }
    if (this.server) {
      await new Promise(resolve => this.server.close(() => resolve()));
      this.server = undefined;
    }
    if (process.platform !== "win32") {
      try { await fs.promises.unlink(this.socketPath); } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
}

async function main() {
  const storageDir = process.env.HERMES_BACKGROUND_STORAGE;
  const token = process.env.HERMES_BACKGROUND_TOKEN;
  const socketPath = process.env.HERMES_BACKGROUND_SOCKET;
  const instanceId = process.env.HERMES_BACKGROUND_INSTANCE;
  if (!storageDir || !token || !socketPath || !instanceId) throw new Error("Missing background host environment");
  const host = new BackgroundHost({ storageDir, token, socketPath, instanceId });
  await host.listen();
  process.on("SIGTERM", () => host.close({ terminateAcp: true }).finally(() => process.exit(0)));
  process.on("SIGINT", () => host.close({ terminateAcp: true }).finally(() => process.exit(0)));
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exit(1);
  });
}

module.exports = { BackgroundHost };
