"use strict";

const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");

const PROTOCOL_VERSION = 1;

function encodeFrame(value) {
  return `${JSON.stringify(value)}\n`;
}

class FrameDecoder {
  constructor(onError = () => {}) {
    this.buffer = "";
    this.onError = onError;
  }

  push(chunk) {
    this.buffer += String(chunk || "");
    const values = [];
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      try {
        values.push(JSON.parse(line));
      } catch (error) {
        this.onError(error);
      }
    }
    return values;
  }
}

async function atomicWriteJson(file, value) {
  const dir = path.dirname(file);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = await fs.promises.open(temp, "w", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.promises.rename(temp, file);
  if (process.platform !== "win32") await fs.promises.chmod(file, 0o600);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.promises.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && arguments.length > 1) return fallback;
    throw error;
  }
}

function socketPathFor(storageDir, instanceId) {
  if (process.platform === "win32") return `\\\\.\\pipe\\hermes-agent-${instanceId}`;
  const key = crypto.createHash("sha256").update(`${storageDir}:${instanceId}`).digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), `hermes-agent-${key}.sock`);
}

module.exports = {
  FrameDecoder,
  PROTOCOL_VERSION,
  atomicWriteJson,
  encodeFrame,
  readJson,
  socketPathFor
};
