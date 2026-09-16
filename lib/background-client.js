"use strict";

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const {
  FrameDecoder,
  PROTOCOL_VERSION,
  atomicWriteJson,
  encodeFrame,
  readJson,
  socketPathFor
} = require("./background-protocol");

class BackgroundClient {
  constructor({
    command,
    args = ["acp"],
    cwd,
    handlers = {},
    storageDir,
    extensionRoot,
    runtimeVersion = "1",
    runtime,
    resolveRuntime,
    spawnProcess = spawn
  }) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.handlers = handlers;
    this.storageDir = storageDir;
    this.extensionRoot = extensionRoot;
    this.runtimeVersion = runtimeVersion;
    this.runtime = runtime;
    this.resolveRuntime = resolveRuntime;
    this.spawnProcess = spawnProcess;
    this.socket = undefined;
    this.decoder = new FrameDecoder(error => this.handlers.onError?.(error));
    this.pending = new Map();
    this.nextId = 1;
    this.started = false;
    this.exited = false;
    this.authenticated = false;
    this.intentionalStop = false;
    this.clientId = crypto.randomUUID();
    this._startPromise = undefined;
    this.legacyHost = false;
    this._legacyMigrationPromise = undefined;
    this._legacyCompletionWaiters = [];
  }

  start() {
    if (this._startPromise) return this._startPromise;
    const starting = this._start();
    this._startPromise = starting;
    starting.catch(() => {
      if (this._startPromise === starting) this._startPromise = undefined;
    });
    return starting;
  }

  async _start() {
    if (!this.storageDir) {
      this.started = true;
      return;
    }
    await fs.promises.mkdir(this.storageDir, { recursive: true, mode: 0o700 });
    const endpointFile = path.join(this.storageDir, "endpoint.json");
    let endpoint = await readJson(endpointFile, null);
    if (endpoint) {
      try {
        if (await this._tryExistingEndpoint(endpoint, { retireIdleLegacy: false })) {
          this.started = true;
          return;
        }
      } catch (error) {
        this.disconnect();
        if (!isEndpointConnectionError(error)) throw error;
      }
    }

    const lockFile = path.join(this.storageDir, "start.lock");
    let lock;
    const lockId = crypto.randomUUID();
    let stopHeartbeat = () => {};
    try {
      lock = await fs.promises.open(lockFile, "wx", 0o600);
      await lock.writeFile(lockId, "utf8");
      await lock.sync();
      stopHeartbeat = this._startLockHeartbeat(lockFile, lockId);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (await this._waitForStarter(endpointFile, lockFile)) {
        this.started = true;
        return;
      }
      return this._start();
    }

    try {
      endpoint = await readJson(endpointFile, null);
      if (endpoint) {
        try {
          if (await this._tryExistingEndpoint(endpoint, { retireIdleLegacy: true })) {
            this.started = true;
            return;
          }
        } catch (error) {
          this.disconnect();
          if (!isEndpointConnectionError(error)) throw error;
        }
      }
      endpoint = await this._launch(endpointFile);
      try {
        await this._connectWithRetry(endpoint);
      } catch (error) {
        await this._retireLegacyEndpoint(endpoint);
        throw error;
      }
      this.started = true;
    } finally {
      stopHeartbeat();
      await this._releaseStartLock(lock, lockFile, lockId);
    }
  }

  async _waitForStarter(endpointFile, lockFile, staleLockMs = 45_000) {
    while (true) {
      const endpoint = await readJson(endpointFile, null);
      if (endpoint) {
        try {
          if (await this._tryExistingEndpoint(endpoint, { retireIdleLegacy: false })) return true;
        } catch (error) {
          this.disconnect();
          if (!isEndpointConnectionError(error)) throw error;
        }
      }
      const stat = await fs.promises.stat(lockFile).catch(() => null);
      if (!stat) return false;
      const remaining = staleLockMs - (Date.now() - stat.mtimeMs);
      if (remaining <= 0) {
        await fs.promises.unlink(lockFile).catch(() => {});
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(100, remaining)));
    }
  }

  async _releaseStartLock(lock, lockFile, lockId) {
    await lock.close();
    const currentOwner = await fs.promises.readFile(lockFile, "utf8").catch(() => "");
    if (currentOwner !== lockId) return;
    try { await fs.promises.unlink(lockFile); } catch { /* another starter cleaned it */ }
  }

  _startLockHeartbeat(lockFile, lockId, intervalMs = 5000) {
    let stopped = false;
    const touch = async () => {
      if (stopped) return;
      const currentOwner = await fs.promises.readFile(lockFile, "utf8").catch(() => "");
      if (currentOwner !== lockId) return;
      const now = new Date();
      await fs.promises.utimes(lockFile, now, now).catch(() => {});
    };
    const timer = setInterval(() => { void touch(); }, intervalMs);
    timer.unref?.();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  async _installRuntime() {
    if (!this.extensionRoot) throw new Error("Hermes background host runtime is unavailable");
    const runtimeDir = path.join(this.storageDir, "runtime", this.runtimeVersion);
    const files = [
      ["background/host.js", "background/host.js"],
      ["lib/acp-client.js", "lib/acp-client.js"],
      ["lib/acp-render.js", "lib/acp-render.js"],
      ["lib/acp-text.js", "lib/acp-text.js"],
      ["lib/background-protocol.js", "lib/background-protocol.js"],
      ["lib/diff-preview.js", "lib/diff-preview.js"]
    ];
    for (const [source, target] of files) {
      const destination = path.join(runtimeDir, target);
      await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await fs.promises.copyFile(path.join(this.extensionRoot, source), destination);
      if (process.platform !== "win32") await fs.promises.chmod(destination, 0o600);
    }
    return path.join(runtimeDir, "background", "host.js");
  }

  async _launch(endpointFile) {
    if (!this.runtime && this.resolveRuntime) this.runtime = await this.resolveRuntime();
    if (!this.runtime?.executablePath) {
      throw new Error("A validated standalone Node.js runtime is required for the Hermes background host");
    }
    const hostScript = await this._installRuntime();
    const instanceId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString("hex");
    const socketPath = socketPathFor(this.storageDir, instanceId);
    const endpoint = {
      socketPath,
      token,
      pid: 0,
      instanceId,
      protocolVersion: PROTOCOL_VERSION,
      runtimeVersion: this.runtimeVersion,
      hostRuntime: {
        kind: "standalone-node",
        executablePath: this.runtime.executablePath,
        realPath: this.runtime.realPath,
        nodeVersion: this.runtime.nodeVersion,
        source: this.runtime.source
      },
      startedAt: Date.now()
    };
    const env = {
      ...process.env,
      HERMES_BACKGROUND_STORAGE: this.storageDir,
      HERMES_BACKGROUND_TOKEN: token,
      HERMES_BACKGROUND_SOCKET: socketPath,
      HERMES_BACKGROUND_INSTANCE: instanceId
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = this.spawnProcess(this.runtime.executablePath, [hostScript], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env
    });
    if (typeof child.once === "function") {
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
    }
    endpoint.pid = child.pid || 0;
    await atomicWriteJson(endpointFile, endpoint);
    child.unref();
    this.legacyHost = false;
    return endpoint;
  }

  async _tryExistingEndpoint(endpoint, { retireIdleLegacy }) {
    await this._connect(endpoint);
    if (isStandaloneEndpoint(endpoint)) {
      this.legacyHost = false;
      return true;
    }
    const snapshot = await this._requestSnapshot();
    if (hasActiveRuns(snapshot)) {
      this.legacyHost = true;
      return true;
    }
    if (!retireIdleLegacy) {
      this._disconnectSocket({ suppressNotification: true });
      return false;
    }
    if (!await this._shutdownLegacyIfIdle(endpoint)) {
      this.legacyHost = true;
      return true;
    }
    return false;
  }

  async _shutdownLegacyIfIdle(endpoint) {
    let result;
    try {
      result = await this._requestHostShutdownIfIdle();
    } catch (error) {
      if (error.code !== "HOST_SHUTDOWN_UNSUPPORTED") throw error;
      const closed = await this._waitForCurrentSocketClose(32_000);
      if (!closed) {
        try {
          await this._requestSnapshot();
          const timeoutError = new Error("Legacy Hermes background host did not exit while idle");
          timeoutError.code = "LEGACY_SHUTDOWN_TIMEOUT";
          throw timeoutError;
        } catch (snapshotError) {
          if (snapshotError.code === "LEGACY_SHUTDOWN_TIMEOUT") throw snapshotError;
          if (this.authenticated) throw snapshotError;
          await this._retireLegacyEndpoint(endpoint);
          return true;
        }
      }
      await this._retireLegacyEndpoint(endpoint);
      return true;
    }
    if (result?.active || result?.shuttingDown !== true) return false;
    if (!await this._waitForCurrentSocketClose(2000)) {
      const error = new Error("Legacy Hermes background host accepted idle shutdown but did not exit");
      error.code = "LEGACY_SHUTDOWN_TIMEOUT";
      throw error;
    }
    await this._retireLegacyEndpoint(endpoint);
    return true;
  }

  async _retireLegacyEndpoint(endpoint) {
    const endpointFile = path.join(this.storageDir, "endpoint.json");
    const current = await readJson(endpointFile, null);
    if (!current || current.instanceId !== endpoint.instanceId) return;
    try {
      await fs.promises.unlink(endpointFile);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  async _connectWithRetry(endpoint, timeoutMs = 5000) {
    const started = Date.now();
    let lastError;
    while (Date.now() - started < timeoutMs) {
      try {
        await this._connect(endpoint);
        return;
      } catch (error) {
        lastError = error;
        this.disconnect();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    throw lastError || new Error("Hermes background host did not start");
  }

  async _connect(endpoint) {
    if (!endpoint || endpoint.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error("Hermes background host protocol is incompatible");
    }
    const socket = net.createConnection(endpoint.socketPath);
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    this._attachSocket(socket, endpoint);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Hermes background host handshake timed out")), 2000);
      this._resolveHello = () => { clearTimeout(timeout); resolve(); };
    });
  }

  _attachSocket(socket, endpoint) {
    this.socket = socket;
    this.decoder = new FrameDecoder(error => this.handlers.onError?.(error));
    this.exited = false;
    this.authenticated = false;
    socket.setEncoding?.("utf8");
    socket.on("data", chunk => {
      for (const message of this.decoder.push(chunk)) this._dispatch(message);
    });
    socket.on("error", error => this.handlers.onError?.(error));
    socket.on("close", () => {
      if (this.socket === socket) this.socket = undefined;
      this.exited = true;
      this.authenticated = false;
      const error = new Error("Hermes background host disconnected");
      error.code = "HERMES_BACKGROUND_DISCONNECTED";
      this._rejectAll(error);
      if (!socket._hermesSuppressDisconnect) this.handlers.onDisconnect?.();
    });
    socket.write(encodeFrame({
      type: "hello",
      token: endpoint.token,
      protocolVersion: PROTOCOL_VERSION,
      clientId: this.clientId
    }));
  }

  _dispatch(message) {
    if (message.type === "hello.ok") {
      this.authenticated = true;
      this._resolveHello?.();
      this._resolveHello = undefined;
      return;
    }
    if (message.type === "response" && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message.result);
      return;
    }
    if (message.type === "snapshot" && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      pending.resolve(message.snapshot);
      return;
    }
    if (message.type === "acp.update") {
      this.handlers.onSessionUpdate?.(message.update, message.sessionId, message.seq);
      return;
    }
    if (message.type === "acp.permission") {
      this.handlers.onPermissionRequest?.({ ...message.request, _backgroundRunId: message.runId });
      return;
    }
    if (message.type === "acp.final_answer") {
      this.handlers.onFinalAnswerOnly?.(message.runId, message.sessionId, message.afterSeq);
      return;
    }
    if (message.type === "acp.stderr") {
      this.handlers.onStderr?.(message.line);
      return;
    }
    if (message.type === "acp.error") {
      this.handlers.onError?.(new Error(message.message));
      return;
    }
    if (message.type === "acp.exit") {
      this.handlers.onExit?.(message.code);
      return;
    }
    if (message.type === "cli.event") {
      this.handlers.onCliEvent?.(message.runId, message.event);
      return;
    }
    if (message.type === "run.completed") {
      const deliver = () => {
        this.handlers.onBackgroundRun?.(message.run);
        const waiters = this._legacyCompletionWaiters.splice(0);
        for (const resolve of waiters) resolve();
      };
      if (!this.legacyHost) {
        deliver();
        return;
      }
      setImmediate(async () => {
        try {
          await this._migrateLegacyWhenIdle();
        } catch (error) {
          this.handlers.onError?.(error);
        } finally {
          deliver();
        }
      });
    }
  }

  async _migrateLegacyWhenIdle() {
    if (!this.legacyHost || this._legacyMigrationPromise) return this._legacyMigrationPromise;
    const migrating = (async () => {
      const snapshot = await this._requestSnapshot();
      if (hasActiveRuns(snapshot)) return "active";
      if (!this.runtime && this.resolveRuntime) this.runtime = await this.resolveRuntime();
      const endpointFile = path.join(this.storageDir, "endpoint.json");
      const lockFile = path.join(this.storageDir, "start.lock");
      let lock;
      const lockId = crypto.randomUUID();
      let stopHeartbeat = () => {};
      try {
        lock = await fs.promises.open(lockFile, "wx", 0o600);
        await lock.writeFile(lockId, "utf8");
        await lock.sync();
        stopHeartbeat = this._startLockHeartbeat(lockFile, lockId);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        this._disconnectSocket({ suppressNotification: true });
        if (!await this._waitForStarter(endpointFile, lockFile)) {
          throw new Error("Another window did not finish migrating the Hermes background host");
        }
        this.started = true;
        if (!this.legacyHost) await this.handlers.onHostMigrated?.();
        return this.legacyHost ? "active" : "migrated";
      }
      try {
        const endpoint = await readJson(endpointFile, null);
        if (endpoint && !isStandaloneEndpoint(endpoint)) {
          if (!await this._shutdownLegacyIfIdle(endpoint)) return "active";
        } else {
          this._disconnectSocket({ suppressNotification: true });
        }
        const nextEndpoint = endpoint && isStandaloneEndpoint(endpoint)
          ? endpoint
          : await this._launch(endpointFile);
        try {
          await this._connectWithRetry(nextEndpoint);
        } catch (error) {
          if (!isStandaloneEndpoint(endpoint)) await this._retireLegacyEndpoint(nextEndpoint);
          throw error;
        }
        this.started = true;
        this.legacyHost = false;
        await this.handlers.onHostMigrated?.();
        return "migrated";
      } finally {
        stopHeartbeat();
        await this._releaseStartLock(lock, lockFile, lockId);
      }
    })();
    this._legacyMigrationPromise = migrating;
    try {
      return await migrating;
    } catch (error) {
      this.started = false;
      this._startPromise = undefined;
      throw error;
    } finally {
      if (this._legacyMigrationPromise === migrating) this._legacyMigrationPromise = undefined;
    }
  }

  _requestHostShutdownIfIdle(timeoutMs = 750) {
    if (!this.authenticated) return Promise.reject(new Error("Hermes background host is not connected"));
    const id = `${this.clientId}:shutdown-if-idle:${this.nextId++}`;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const error = new Error("Legacy host does not support idle shutdown");
        error.code = "HOST_SHUTDOWN_UNSUPPORTED";
        reject(error);
      }, timeoutMs);
      this.pending.set(id, {
        resolve: value => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: error => {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
    this.socket.write(encodeFrame({
      type: "host.shutdownIfIdle",
      id
    }));
    return promise;
  }

  _waitForCurrentSocketClose(timeoutMs) {
    const socket = this.socket;
    if (!socket || socket.destroyed) return Promise.resolve(true);
    socket._hermesSuppressDisconnect = true;
    return new Promise(resolve => {
      let settled = false;
      const finish = closed => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.removeListener?.("close", onClose);
        resolve(closed);
      };
      const onClose = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      socket.once("close", onClose);
    });
  }

  async _ensureStandaloneForNewRun() {
    while (this.legacyHost) {
      const status = await this._migrateLegacyWhenIdle();
      if (status === "migrated") return;
      await new Promise(resolve => this._legacyCompletionWaiters.push(resolve));
    }
  }

  async prepareStandaloneForNewRun() {
    await this.start();
    if (this.legacyHost) await this._ensureStandaloneForNewRun();
  }

  async request(method, params) {
    await this.start();
    if (!this.authenticated) throw new Error("Hermes background host is not connected");
    const id = `${this.clientId}:${this.nextId++}`;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.write(encodeFrame({
      type: "acp.request",
      id,
      method,
      params,
      config: { command: this.command, args: this.args, cwd: this.cwd }
    }));
    return promise;
  }

  notify(method, params) {
    if (!this.authenticated) return;
    this.socket.write(encodeFrame({
      type: "acp.notify",
      method,
      params,
      config: { command: this.command, args: this.args, cwd: this.cwd }
    }));
  }

  respond(requestId, result) {
    if (!this.authenticated) return;
    this.socket.write(encodeFrame({ type: "acp.respond", requestId, result }));
  }

  async snapshot() {
    await this.start();
    return this._requestSnapshot();
  }

  _requestSnapshot() {
    if (!this.authenticated) return Promise.reject(new Error("Hermes background host is not connected"));
    const id = `${this.clientId}:snapshot:${this.nextId++}`;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.write(encodeFrame({ type: "snapshot.get", id }));
    return promise;
  }

  acknowledgeRun(runId) {
    if (this.authenticated) this.socket.write(encodeFrame({ type: "run.ack", runId }));
  }

  async runCli(input) {
    await this.start();
    if (this.legacyHost) await this._ensureStandaloneForNewRun();
    if (!this.authenticated) throw new Error("Hermes background host is not connected");
    const id = `${this.clientId}:cli:${this.nextId++}`;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.write(encodeFrame({ type: "cli.run", id, input }));
    return promise;
  }

  async cancelCli(runId) {
    await this.start();
    const id = `${this.clientId}:cli-cancel:${this.nextId++}`;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.write(encodeFrame({ type: "cli.cancel", id, runId }));
    const result = await promise;
    return result?.stopping === true;
  }

  disconnect() {
    this._disconnectSocket({ suppressNotification: false });
  }

  _disconnectSocket({ suppressNotification }) {
    const socket = this.socket;
    this.socket = undefined;
    this.authenticated = false;
    if (socket && !socket.destroyed) {
      socket._hermesSuppressDisconnect = suppressNotification;
      socket.destroy();
    }
  }

  async killAndWait() {
    if (!this.authenticated) return true;
    const id = `${this.clientId}:stop:${this.nextId++}`;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.write(encodeFrame({ type: "acp.stop", id }));
    try {
      const result = await promise;
      return result?.stopped === true;
    } catch {
      return false;
    }
  }

  kill() {
    void this.killAndWait();
  }

  _rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function isStandaloneEndpoint(endpoint) {
  return endpoint?.hostRuntime?.kind === "standalone-node";
}

function hasActiveRuns(snapshot) {
  return Array.isArray(snapshot?.runs)
    && snapshot.runs.some(run => run?.status === "running" || run?.status === "waiting_permission");
}

function isEndpointConnectionError(error) {
  return [
    "ECONNREFUSED",
    "ECONNRESET",
    "ENOENT",
    "EPIPE",
    "HERMES_BACKGROUND_DISCONNECTED"
  ].includes(error?.code)
    || /handshake timed out|protocol is incompatible/i.test(String(error?.message || ""));
}

module.exports = { BackgroundClient, hasActiveRuns, isStandaloneEndpoint };
