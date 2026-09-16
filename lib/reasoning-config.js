"use strict";

const { spawn } = require("child_process");

const EFFORT_VALUES = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);

function compactEffortLabel(label) {
  const value = String(label || "");
  if (value === "Medium") return "Med";
  if (value === "Extra High") return "XHigh";
  return value;
}

function mergeReasoningOverrides(raw, model, effort) {
  let current;
  try {
    current = JSON.parse(String(raw || "{}").trim() || "{}");
  } catch {
    throw new Error("Hermes returned an unreadable reasoning_overrides value");
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    throw new Error("Hermes reasoning_overrides is not a model map");
  }
  const modelId = String(model || "").trim();
  const effortValue = String(effort || "").trim().toLowerCase();
  if (!modelId || !EFFORT_VALUES.has(effortValue)) throw new Error("Invalid model reasoning effort");
  return { ...current, [modelId]: effortValue };
}

function reasoningConfigCommands(model, effort, current = {}) {
  const merged = mergeReasoningOverrides(JSON.stringify(current || {}), model, effort);
  return {
    get: ["config", "get", "agent.reasoning_overrides", "--json"],
    set: ["config", "set", "agent.reasoning_overrides", JSON.stringify(merged)]
  };
}

function run(command, args, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      env: process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", chunk => { stdout += String(chunk); });
    child.stderr?.on("data", chunk => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Hermes config exited with code ${code}`));
    });
  });
}

async function persistModelReasoningEffort({ command, model, effort, spawnImpl = spawn }) {
  const executable = String(command || "").trim();
  if (!executable) throw new Error("Hermes CLI is not configured");
  const getArgs = ["config", "get", "agent.reasoning_overrides", "--json"];
  const raw = await run(executable, getArgs, spawnImpl);
  const merged = mergeReasoningOverrides(raw, model, effort);
  const setArgs = ["config", "set", "agent.reasoning_overrides", JSON.stringify(merged)];
  await run(executable, setArgs, spawnImpl);
  return merged;
}

module.exports = {
  compactEffortLabel,
  mergeReasoningOverrides,
  persistModelReasoningEffort,
  reasoningConfigCommands
};
