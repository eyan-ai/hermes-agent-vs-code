"use strict";

const assert = require("assert");
const { PromptQueue, resolveSubmission } = require("../lib/prompt-queue");

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test("queue edits preserve the original item position", () => {
  let sequence = 0;
  const queue = new PromptQueue(() => `q-${++sequence}`);
  const first = queue.enqueue("session-1", { prompt: "first" });
  const second = queue.enqueue("session-1", { prompt: "second" });
  const third = queue.enqueue("session-1", { prompt: "third" });
  assert.ok(queue.edit("session-1", second.id, { prompt: "second revised" }));
  assert.deepStrictEqual(queue.snapshot("session-1").map(item => item.prompt), [
    "first",
    "second revised",
    "third"
  ]);
  assert.strictEqual(queue.snapshot("session-1")[1].id, second.id);
  assert.strictEqual(queue.shift("session-1").id, first.id);
  assert.strictEqual(queue.remove("session-1", third.id).id, third.id);
});

test("clearing a session queue returns the number of discarded prompts", () => {
  const queue = new PromptQueue();
  queue.enqueue("session-1", { prompt: "first" });
  queue.enqueue("session-1", { prompt: "second" });
  assert.strictEqual(queue.clear("session-1"), 2);
  assert.deepStrictEqual(queue.snapshot("session-1"), []);
  assert.strictEqual(queue.clear("session-1"), 0);
});

test("active submissions queue while idle submissions run immediately", () => {
  assert.deepStrictEqual(resolveSubmission({ prompt: "next task" }, true), {
    action: "queue",
    prompt: "next task",
    command: "",
    skill: ""
  });
  assert.deepStrictEqual(resolveSubmission({ prompt: "next task" }, false), {
    action: "run",
    prompt: "next task",
    command: "",
    skill: ""
  });
});

test("steer is conditional on an active task and empty steer never submits", () => {
  assert.deepStrictEqual(resolveSubmission({ prompt: "focus on errors", command: "/steer" }, true), {
    action: "steer",
    prompt: "focus on errors",
    command: "/steer",
    skill: ""
  });
  assert.deepStrictEqual(resolveSubmission({ prompt: "focus on errors", command: "/steer" }, false), {
    action: "run",
    prompt: "focus on errors",
    command: "",
    skill: ""
  });
  assert.deepStrictEqual(resolveSubmission({ prompt: "", command: "/steer" }, true), {
    action: "ignore",
    prompt: "",
    command: "/steer",
    skill: ""
  });
});

for (const { name, run } of tests) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
