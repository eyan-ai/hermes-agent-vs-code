"use strict";

const assert = require("assert");
const { SessionCancellationBarrier } = require("../lib/session-cancellation-barrier");
const { PromptQueue, resolveSubmission } = require("../lib/prompt-queue");

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
  await test("a post-denial prompt waits outside the visible queue until release", async () => {
    const barriers = new SessionCancellationBarrier();
    const promptQueue = new PromptQueue(() => "queued-item");
    const events = [];
    let oldTurnRunning = true;
    let releaseOldTurn;
    const oldTurnReleased = new Promise(resolve => { releaseOldTurn = resolve; });
    const stopping = barriers.run("session-1", async () => {
      events.push("stop-started");
      await oldTurnReleased;
      oldTurnRunning = false;
      events.push("old-turn-released");
    });

    let started = 0;
    const submission = (async () => {
      await barriers.wait("session-1");
      const resolution = resolveSubmission({ prompt: "fresh question" }, oldTurnRunning);
      if (resolution.action === "queue") promptQueue.enqueue("session-1", { prompt: resolution.prompt });
      else if (resolution.action === "run") started += 1;
    })();
    await Promise.resolve();
    assert.strictEqual(started, 0);
    assert.deepStrictEqual(promptQueue.snapshot("session-1"), []);

    releaseOldTurn();
    await Promise.all([stopping, submission]);
    assert.strictEqual(started, 1);
    assert.deepStrictEqual(promptQueue.snapshot("session-1"), []);
    assert.deepStrictEqual(events, ["stop-started", "old-turn-released"]);
    assert.strictEqual(barriers.has("session-1"), false);
  });

  await test("barriers are isolated by UI session", async () => {
    const barriers = new SessionCancellationBarrier();
    let release;
    barriers.run("session-a", () => new Promise(resolve => { release = resolve; }));
    await barriers.wait("session-b");
    assert.strictEqual(barriers.has("session-a"), true);
    release();
    await barriers.wait("session-a");
  });
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
