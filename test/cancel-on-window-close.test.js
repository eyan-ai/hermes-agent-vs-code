const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { BackgroundHost } = require("../background/host");

async function createHost(t) {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-window-"));
  const host = new BackgroundHost({ storageDir });
  t.after(async () => {
    clearTimeout(host.idleTimer);
    await fs.rm(storageDir, { recursive: true, force: true });
  });
  return host;
}

test("closing one window cancels only its opted-in ACP prompt", async t => {
  const host = await createHost(t);
  const pending = new Map();
  const cancelled = [];
  host._ensureAcp = async () => ({
    request(method, { sessionId }) {
      assert.equal(method, "session/prompt");
      return new Promise(resolve => pending.set(sessionId, resolve));
    },
    notify(method, { sessionId }) {
      assert.equal(method, "session/cancel");
      cancelled.push(sessionId);
      pending.get(sessionId)({ stopReason: "cancelled" });
    }
  });
  function submit(socket, id, cancelOnClose) {
    return host._handleAuthenticated({ socket }, {
      type: "acp.request", method: "session/prompt", cancelOnClose,
      params: { sessionId: id, prompt: [] }
    });
  }
  const first = new net.Socket();
  const second = new net.Socket();
  const tasks = [submit(first, "first", true), submit(second, "second", true),
    submit(first, "background", false)];
  await new Promise(resolve => setImmediate(resolve));
  const closed = once(first, "close");
  first.destroy();
  await closed;
  assert.deepEqual(cancelled, ["first"]);
  pending.get("background")({ stopReason: "end_turn" });
  pending.get("second")({ stopReason: "end_turn" });
  await Promise.all(tasks);
  assert.equal(second.listenerCount("close"), 0);
  second.destroy();
});

test("an opted-in CLI child terminates on disconnect", { timeout: 5000 }, async t => {
  const host = await createHost(t);
  const socket = new net.Socket();
  await host._runCli({ socket }, {
    cancelOnClose: true,
    input: { command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], metadata: { runId: "cli" } }
  });
  const child = host.cliProcesses.get("cli").child;
  t.after(() => { if (child.exitCode === null && !child.signalCode) child.kill(); });
  const closed = once(child, "close");
  socket.destroy();
  await closed;
  await host._persist();
  assert.equal(host.runs.get("cli").status, "interrupted");
  assert.equal(host.cliProcesses.size, 0);
});
