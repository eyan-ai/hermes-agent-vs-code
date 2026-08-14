"use strict";

const assert = require("assert");
const { forkAcpSession, installAcpSessionReplacement } = require("../lib/acp-session-handoff");

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
  await test("cancellation forks before stopping and routes the next prompt away from the busy session", async () => {
    const oldSessionId = "old-busy-session";
    const replacementSessionId = "replacement-idle-session";
    const uiSessionId = "ui-session";
    const mappings = new Map([[uiSessionId, oldSessionId]]);
    const session = { id: uiSessionId, acpSessionId: oldSessionId };
    const prompts = [];
    const events = [];

    const client = {
      async request(method, params) {
        if (method === "session/fork") {
          assert.deepStrictEqual(events, []);
          assert.strictEqual(params.sessionId, oldSessionId);
          events.push("fork");
          return { sessionId: replacementSessionId, models: { availableModels: [] } };
        }
        if (method === "session/prompt") {
          prompts.push(params.sessionId);
          return params.sessionId === oldSessionId
            ? { text: "Queued for the next turn. (1 queued)" }
            : { text: "started" };
        }
        throw new Error(`Unexpected method: ${method}`);
      },
      notify(method, params) {
        assert.strictEqual(method, "session/cancel");
        assert.strictEqual(params.sessionId, oldSessionId);
        events.push("cancel-old");
      }
    };

    const forked = await forkAcpSession(client, { sessionId: oldSessionId, cwd: "/workspace" });
    installAcpSessionReplacement({
      mappings,
      uiSessionId,
      oldSessionId,
      replacementSessionId: forked.sessionId,
      session
    });
    client.notify("session/cancel", { sessionId: oldSessionId });

    const result = await client.request("session/prompt", { sessionId: mappings.get(uiSessionId), prompt: [] });
    assert.deepStrictEqual(events, ["fork", "cancel-old"]);
    assert.deepStrictEqual(prompts, [replacementSessionId]);
    assert.strictEqual(session.acpSessionId, replacementSessionId);
    assert.strictEqual(result.text, "started");
    assert.ok(!result.text.includes("Queued for the next turn"));
  });

  await test("fork rejects an empty or reused replacement session", async () => {
    await assert.rejects(
      forkAcpSession({ request: async () => ({ sessionId: "old" }) }, { sessionId: "old", cwd: "/workspace" }),
      /reused/
    );
    await assert.rejects(
      forkAcpSession({ request: async () => ({}) }, { sessionId: "old", cwd: "/workspace" }),
      /did not return/
    );
  });
})().catch(() => {
  process.exitCode = 1;
});
