"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_TIMEOUT_MS = 3000;
const APPLICATION_RUNTIME_PATTERN = /(?:code helper|visual studio code|electron)/i;

class NodeRuntimeError extends Error {
  constructor(message, { code = "NODE_RUNTIME_ERROR", failures = [] } = {}) {
    super(message);
    this.name = "NodeRuntimeError";
    this.code = code;
    this.failures = failures;
  }
}

function normalizedPath(value) {
  const resolved = path.resolve(String(value || ""));
  return process.platform === "win32" || process.platform === "darwin"
    ? resolved.toLowerCase()
    : resolved;
}

function samePath(left, right) {
  if (!left || !right) return false;
  return normalizedPath(left) === normalizedPath(right);
}

function validateProbeResult(runtime, currentExecPath = process.execPath) {
  if (!runtime || !/^\d+\.\d+(?:\.\d+)?/.test(String(runtime.nodeVersion || ""))) {
    throw new Error("Executable did not report a valid Node.js version");
  }
  if (runtime.electronVersion) {
    throw new Error("Electron runtimes cannot own the Hermes background host");
  }
  if (runtime.supportsBackgroundHost !== true) {
    throw new Error("This Node.js version does not provide the APIs required by the Hermes background host");
  }
  const executablePath = String(runtime.executablePath || "");
  const realPath = String(runtime.realPath || executablePath);
  if (APPLICATION_RUNTIME_PATTERN.test(executablePath) || APPLICATION_RUNTIME_PATTERN.test(realPath)) {
    throw new Error("VS Code or Electron executables cannot own the Hermes background host");
  }
  if (samePath(realPath, currentExecPath) || samePath(executablePath, currentExecPath)) {
    throw new Error("The extension host executable cannot own the Hermes background host");
  }
  return runtime;
}

function runCapture(command, args, { env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch { /* process already exited */ }
      const error = new Error(`Timed out after ${timeoutMs}ms`);
      error.code = "ETIMEDOUT";
      reject(error);
    }, timeoutMs);
    child.stdout.on("data", chunk => {
      if (stdout.length < 64 * 1024) stdout += String(chunk);
    });
    child.stderr.on("data", chunk => {
      if (stderr.length < 64 * 1024) stderr += String(chunk);
    });
    child.once("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const error = new Error(stderr.trim() || `Exited with code ${code}`);
        error.code = "NODE_PROBE_FAILED";
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function probeNodeRuntime(candidate, options = {}) {
  const executablePath = String(candidate.path || "");
  const realPath = candidate.realPath || await fs.promises.realpath(executablePath);
  const env = { ...(options.env || process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  const script = [
    "JSON.stringify({",
    "nodeVersion: process.versions.node || '',",
    "electronVersion: process.versions.electron || null,",
    "supportsBackgroundHost: typeof require('crypto').randomUUID === 'function',",
    "execPath: process.execPath",
    "})"
  ].join("");
  const output = await runCapture(executablePath, ["-p", script], {
    env,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS
  });
  let result;
  try {
    result = JSON.parse(output.trim());
  } catch {
    throw new Error("Executable returned an invalid Node.js probe response");
  }
  return {
    executablePath,
    realPath,
    nodeVersion: String(result.nodeVersion || ""),
    electronVersion: result.electronVersion || null,
    supportsBackgroundHost: result.supportsBackgroundHost === true,
    reportedExecPath: String(result.execPath || ""),
    source: candidate.source
  };
}

async function loginShellCandidates({ env, timeoutMs }) {
  if (process.platform === "win32") {
    try {
      const output = await runCapture("where.exe", ["node"], { env, timeoutMs });
      return output.split(/\r?\n/).map(value => value.trim()).filter(path.isAbsolute);
    } catch {
      return [];
    }
  }
  const shell = String(env.SHELL || "");
  if (!path.isAbsolute(shell)) return [];
  try {
    const output = await runCapture(shell, ["-l", "-c", "command -v node"], { env, timeoutMs });
    return output.split(/\r?\n/).map(value => value.trim()).filter(path.isAbsolute);
  } catch {
    return [];
  }
}

function pathCandidates(env, platform) {
  const names = platform === "win32" ? ["node.exe", "node"] : ["node"];
  const values = [];
  for (const directory of String(env.PATH || "").split(path.delimiter).filter(Boolean)) {
    for (const name of names) values.push(path.join(directory, name));
  }
  return values;
}

function commonCandidates({ platform, homeDir, env }) {
  if (platform === "win32") {
    return [
      env.ProgramFiles && path.join(env.ProgramFiles, "nodejs", "node.exe"),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "nodejs", "node.exe")
    ].filter(Boolean);
  }
  const values = [
    path.join(homeDir, ".local", "bin", "node"),
    "/usr/local/bin/node",
    "/usr/bin/node"
  ];
  if (platform === "darwin") values.splice(1, 0, "/opt/homebrew/bin/node");
  if (platform === "linux") values.push("/snap/bin/node");
  return values;
}

async function discoverNodeCandidates(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const candidates = pathCandidates(env, platform).map(value => ({ path: value, source: "path" }));
  const shellValues = await loginShellCandidates({ env, timeoutMs });
  candidates.push(...shellValues.map(value => ({ path: value, source: platform === "win32" ? "where" : "login-shell" })));
  candidates.push(...commonCandidates({ platform, homeDir, env }).map(value => ({ path: value, source: "common" })));
  return candidates;
}

async function resolveNodeRuntime(options = {}) {
  const configuredPath = String(options.configuredPath || "").trim();
  const currentExecPath = options.currentExecPath || process.execPath;
  const probe = options.probe || ((candidate) => probeNodeRuntime(candidate, options));
  const resolveRealPath = options.resolveRealPath || (candidatePath => fs.promises.realpath(candidatePath));
  let candidates;
  if (configuredPath) {
    if (!path.isAbsolute(configuredPath)) {
      throw new NodeRuntimeError(
        "hermesAgent.nodePath must be an absolute path to a standalone Node.js executable.",
        { code: "INVALID_CONFIGURED_NODE" }
      );
    }
    candidates = [{ path: configuredPath, source: "configured" }];
  } else {
    const discover = options.discoverCandidates || (() => discoverNodeCandidates(options));
    candidates = await discover();
  }

  const failures = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const candidatePath = String(candidate?.path || "").trim();
    if (!candidatePath) continue;
    try {
      const realPath = await resolveRealPath(candidatePath);
      const key = normalizedPath(realPath);
      if (seen.has(key)) continue;
      seen.add(key);
      const probed = await probe({ path: candidatePath, realPath, source: candidate.source });
      const runtime = validateProbeResult({ ...probed, realPath }, currentExecPath);
      return runtime;
    } catch (error) {
      failures.push({ path: candidatePath, source: candidate.source, message: error.message });
    }
  }

  if (configuredPath) {
    throw new NodeRuntimeError(
      `Configured hermesAgent.nodePath is not a standalone Node.js executable: ${configuredPath}`,
      { code: "INVALID_CONFIGURED_NODE", failures }
    );
  }
  throw new NodeRuntimeError(
    "No standalone Node.js executable was found. Install Node.js or configure hermesAgent.nodePath.",
    { code: "NODE_NOT_FOUND", failures }
  );
}

module.exports = {
  NodeRuntimeError,
  discoverNodeCandidates,
  probeNodeRuntime,
  resolveNodeRuntime,
  validateProbeResult
};
