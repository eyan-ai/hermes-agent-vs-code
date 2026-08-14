"use strict";

const assert = require("assert");
const { TurnLifecycle, TurnCancelledError, isTurnCancelled } = require("../lib/turn-lifecycle");

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

(async () => {
  await test("normal cancellation blocks late events without forcing transport reset", async () => {
    let notified = 0;
    let forced = 0;
    const turn = new TurnLifecycle({ timeoutMs: 100 });
    const stopping = turn.stop({
      notify: () => { notified += 1; },
      forceStop: () => { forced += 1; }
    });

    assert.strictEqual(turn.status, "stopping");
    assert.strictEqual(turn.acceptsEvents(), false);
    turn.settle();
    const result = await stopping;

    assert.deepStrictEqual(result, { forced: false });
    assert.strictEqual(turn.status, "stopped");
    assert.strictEqual(notified, 1);
    assert.strictEqual(forced, 0);
  });

  await test("cancellation timeout forces transport reset", async () => {
    let forced = 0;
    const turn = new TurnLifecycle({ timeoutMs: 5 });
    const result = await turn.stop({
      notify: () => {},
      forceStop: () => { forced += 1; }
    });

    assert.deepStrictEqual(result, { forced: true });
    assert.strictEqual(turn.status, "stopped");
    assert.strictEqual(forced, 1);
  });

  await test("failed transport termination still releases the turn lock", async () => {
    const turn = new TurnLifecycle({ timeoutMs: 5 });
    const result = await turn.stop({ notify: () => {}, forceStop: () => false });

    assert.deepStrictEqual(result, { forced: true, terminated: false });
    assert.strictEqual(turn.status, "stopped");
  });

  await test("repeated stop calls share one cancellation operation", async () => {
    let notified = 0;
    const turn = new TurnLifecycle({ timeoutMs: 100 });
    const first = turn.stop({ notify: () => { notified += 1; }, forceStop: () => {} });
    const second = turn.stop({ notify: () => { notified += 1; }, forceStop: () => {} });
    turn.settle();

    assert.strictEqual(first, second);
    await first;
    assert.strictEqual(notified, 1);
  });

  await test("user cancellation has a distinct non-fallback error", async () => {
    const error = new TurnCancelledError();
    assert.strictEqual(error.code, "HERMES_TURN_CANCELLED");
    assert.strictEqual(isTurnCancelled(error), true);
    assert.strictEqual(isTurnCancelled(new Error("transport failed")), false);
  });
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
