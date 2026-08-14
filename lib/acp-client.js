/**
 * acp-client.js — Minimal ACP (Agent Client Protocol) client over stdio.
 *
 * Talks to `hermes acp` (Hermes' built-in ACP server) using JSON-RPC 2.0,
 * one JSON object per line on stdin/stdout. Delivers structured session
 * updates (thinking chunks, tool call start/progress, message chunks) to
 * the extension instead of parsing CLI box-drawing output.
 *
 * Wire format (from agent-client-protocol 0.9.0, serialized by_alias):
 *   request     → {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
 *   response    → {"jsonrpc":"2.0","id":1,"result":{...}}
 *   notification← {"jsonrpc":"2.0","method":"session/update",
 *                  "params":{"sessionId":"...","update":{...}}}
 * All parameter names on the wire are camelCase.
 */
"use strict";

const { spawn } = require("child_process");

const ACP_NOTIFICATION_METHOD = "session/update";

class AcpClient {
  /**
   * @param {object} options
   * @param {string} options.command      e.g. "hermes"
   * @param {string[]} options.args       e.g. ["acp"]
   * @param {string} [options.cwd]        workspace root
   * @param {object} options.handlers
   * @param {(update: object, sessionId: string) => void} options.handlers.onSessionUpdate
   * @param {(request: object) => void} [options.handlers.onPermissionRequest]
   *        Called with the full JSON-RPC request {id, method, params} for
   *        server→client `session/request_permission`. The client MUST
   *        respond via respondPermission(id, response); the server is
   *        blocked waiting for it.
   * @param {(code: number | null) => void} [options.handlers.onExit]
   * @param {(err: Error) => void} [options.handlers.onError]
   * @param {(line: string) => void} [options.handlers.onStderr]
   */
  constructor({ command, args, cwd, handlers = {} }) {
    this.command = command;
    this.args = args || ["acp"];
    this.cwd = cwd;
    this.handlers = handlers;
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.initialized = false;
    this.started = false;
    this.exited = false;
    this.intentionalStop = false;
    this._startPromise = null;
    this._exitPromise = new Promise(resolve => {
      this._resolveExit = resolve;
    });
  }

  /** Spawn the ACP process (idempotent; returns a promise that resolves once spawned). */
  start() {
    if (this._startPromise) return this._startPromise;
    this._startPromise = new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(this.command, this.args, {
          cwd: this.cwd,
          env: { ...process.env, HERMES_ACCEPT_HOOKS: "1" },
          shell: process.platform === "win32",
          stdio: ["pipe", "pipe", "pipe"]
        });
      } catch (err) {
        reject(err);
        return;
      }
      this.proc = child;
      this.exited = false;

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => this._onData(chunk));
      child.stdout.on("end", () => this._flush());

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", chunk => {
        if (this.handlers.onStderr) {
          for (const line of chunk.toString().split("\n")) {
            const trimmed = line.trim();
            if (trimmed) this.handlers.onStderr(trimmed);
          }
        }
      });

      child.on("error", err => {
        this.exited = true;
        if (this.handlers.onError) this.handlers.onError(err);
        reject(err);
      });
      child.on("close", code => {
        this.exited = true;
        this._rejectAll(new Error(`ACP process exited with code ${code}`));
        if (this.handlers.onExit) this.handlers.onExit(code);
        this._resolveExit(code);
      });
      child.on("spawn", () => resolve());
    });
    return this._startPromise;
  }

  /** JSON-RPC request. Returns a promise for the `result` (rejects on error). */
  async request(method, params) {
    await this.start();
    if (this.exited) throw new Error("ACP process is not running");
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this._write({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** JSON-RPC notification (no id, no response). Fire-and-forget. */
  notify(method, params) {
    if (!this.proc || this.exited) return;
    this._write({ jsonrpc: "2.0", method, params });
  }

  /**
   * Respond to a server→client request (e.g. session/request_permission).
   * @param {number} id  the request id from onPermissionRequest
   * @param {object} result  response result object
   */
  respond(id, result) {
    if (!this.proc || this.exited) return;
    this._write({ jsonrpc: "2.0", id, result });
  }

  /** Kill the underlying process. */
  kill(signal = "SIGTERM") {
    if (this.proc && !this.exited) {
      try {
        this.proc.kill(signal);
      } catch { /* already gone */ }
    }
  }

  async killAndWait(timeoutMs = 1000) {
    this.kill("SIGTERM");
    if (this.exited) return true;
    let exited = await Promise.race([
      this._exitPromise.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), timeoutMs))
    ]);
    if (exited) return true;
    this.kill("SIGKILL");
    exited = await Promise.race([
      this._exitPromise.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), timeoutMs))
    ]);
    if (exited) return true;

    this.exited = true;
    try { this.proc?.stdin?.destroy(); } catch { /* already closed */ }
    try { this.proc?.stdout?.destroy(); } catch { /* already closed */ }
    try { this.proc?.stderr?.destroy(); } catch { /* already closed */ }
    this._rejectAll(new Error("ACP process did not report exit after SIGKILL"));
    return false;
  }

  // ── internals ───────────────────────────────────────────────

  _write(obj) {
    this.proc.stdin.write(JSON.stringify(obj) + "\n");
  }

  _onData(chunk) {
    this.buffer += chunk;
    this._flush();
  }

  _flush() {
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // partial/odd line — skip
      }
      this._dispatch(msg);
    }
  }

  _dispatch(msg) {
    // Response to one of our requests.
    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      const entry = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) {
        entry.reject(new Error(`${entry.method} failed: ${JSON.stringify(msg.error)}`));
      } else {
        entry.resolve(msg.result);
      }
      return;
    }
    // Server → client notification.
    if (msg.method === ACP_NOTIFICATION_METHOD && this.handlers.onSessionUpdate) {
      const params = msg.params || {};
      this.handlers.onSessionUpdate(params.update || {}, params.sessionId || "");
      return;
    }
    // Server → client REQUEST: the server awaits our response (e.g.
    // session/request_permission for edit/command approval). Delegate the
    // full request so the host can show a confirmation or auto-approve;
    // it must call respond(id, result) to unblock the agent loop.
    if (msg.method === "session/request_permission" && this.handlers.onPermissionRequest) {
      this.handlers.onPermissionRequest(msg);
      return;
    }
    // Other notifications (e.g. session/request_permission) — ignore for now;
    // the server auto-approves edits per its own policy when hooks are on.
  }

  _rejectAll(err) {
    for (const [, entry] of this.pending) entry.reject(err);
    this.pending.clear();
  }
}

module.exports = { AcpClient };
