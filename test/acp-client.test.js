"use strict";

const assert = require("assert");
const { AcpClient } = require("../lib/acp-client");

async function test(name, run) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

(async () => {
  await test("escalates ACP termination and confirms process exit", async () => {
  const signals = [];
  const client = Object.create(AcpClient.prototype);
  client.exited = false;
  client._exitPromise = new Promise(resolve => {
    client._resolveExit = resolve;
  });
  client.proc = {
    kill(signal) {
      signals.push(signal);
      if (signal === "SIGKILL") {
        client.exited = true;
        client._resolveExit(137);
      }
    }
  };

  const terminated = await client.killAndWait(5);
  assert.strictEqual(terminated, true);
  assert.deepStrictEqual(signals, ["SIGTERM", "SIGKILL"]);
  });

  await test("returns after a bounded wait when the process never reports exit", async () => {
    const signals = [];
    const client = Object.create(AcpClient.prototype);
    client.exited = false;
    client.pending = new Map();
    client._exitPromise = new Promise(() => {});
    client.proc = {
      stdin: { destroy() {} },
      stdout: { destroy() {} },
      stderr: { destroy() {} },
      kill(signal) { signals.push(signal); }
    };

    const terminated = await client.killAndWait(5);
    assert.strictEqual(terminated, false);
    assert.strictEqual(client.exited, true);
    assert.deepStrictEqual(signals, ["SIGTERM", "SIGKILL"]);
  });
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
