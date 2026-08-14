"use strict";

const assert = require("assert");
const { createAcpRenderer, naturalTitle, normalizeHermesEvent } = require("../lib/acp-render");
const fixtures = require("./fixtures/hermes-stream-events.json");

function createHarness() {
  const assistantMessage = {
    id: "message-1",
    role: "assistant",
    text: "",
    status: "running",
    thinking: [],
    startedAt: 1
  };
  const posted = [];
  const renderer = createAcpRenderer({
    assistantMessage,
    post: message => posted.push(message),
    session: { id: "session-1" }
  });
  return { assistantMessage, posted, renderer };
}

function textUpdate(text) {
  return { sessionUpdate: "agent_message_chunk", content: { type: "text", text } };
}

function thoughtUpdate(text) {
  return { sessionUpdate: "agent_thought_chunk", content: { type: "text", text } };
}

function toolStarted(id, title = "read: /workspace/example.txt") {
  return { sessionUpdate: "tool_call", toolCallId: id, title, content: [] };
}

function toolCompleted(id, status = "completed") {
  return { sessionUpdate: "tool_call_update", toolCallId: id, status, content: [] };
}

function planUpdate(entries) {
  return { sessionUpdate: "plan", entries };
}

function workingText(message) {
  return message.thinking.map(step => step.text || step.summary || "").join("\n");
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test("simple greeting becomes answer only when the turn completes", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(textUpdate("Hello!"));
  renderer.finalize("done");
  assert.strictEqual(assistantMessage.text, "Hello!");
  assert.ok(!workingText(assistantMessage).includes("Hello!"));
});

test("real ACP update shapes normalize into stable UI events", () => {
  const cases = [
    [fixtures.thinking.params.update, "thinking.delta"],
    [fixtures.toolStarted.params.update, "action.started"],
    [fixtures.toolCompleted.params.update, "action.completed"],
    [fixtures.assistantText.params.update, "assistant_text.delta"]
  ];
  for (const [raw, expected] of cases) {
    const event = normalizeHermesEvent(raw, "turn-1");
    assert.strictEqual(event.type, expected);
    assert.strictEqual(event.turnId, "turn-1");
  }
});

test("execution titles never expose source code in the Working title", () => {
  assert.deepStrictEqual(naturalTitle("python: import requests"), { action: "Run command", description: "" });
  assert.deepStrictEqual(naturalTitle("terminal: python script.py --all"), { action: "Run command", description: "" });
  assert.deepStrictEqual(naturalTitle("execute: npm test"), { action: "Run command", description: "" });
  assert.deepStrictEqual(naturalTitle("shell"), { action: "Run command", description: "" });
  assert.deepStrictEqual(naturalTitle("patch (replace): /workspace/My Project/file.md"), { action: "Edit", description: "/workspace/My Project/file.md" });
});

test("Search titles keep only a useful target summary", () => {
  assert.deepStrictEqual(naturalTitle("search: /workspace/docs/guide.md"), { action: "Search", description: "/workspace/docs/guide.md" });
  assert.deepStrictEqual(naturalTitle("web_search: https://example.com/reference"), { action: "Search", description: "https://example.com/reference" });
  assert.deepStrictEqual(naturalTitle("search: find the current model setting"), { action: "Search", description: "find the current model setting" });
  assert.deepStrictEqual(naturalTitle("search: ^#{2,4}\\s[0-9]+"), { action: "Search", description: "matching content" });
});

test("Python source is retained only as expandable action detail", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate({
    sessionUpdate: "tool_call",
    toolCallId: "python-1",
    title: "python: import requests",
    content: [{ type: "text", text: "Running Python helper script:\n\n```python\nimport requests\nprint('ok')\n```" }]
  });
  const step = assistantMessage.thinking.find(item => item.toolCallId === "python-1");
  assert.strictEqual(step.action, "Run command");
  assert.strictEqual(step.description, "");
  assert.strictEqual(step.code, "import requests\nprint('ok')");
});

test("Working Diff keeps only the whole lines that actually changed", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("edit-1", "patch: /workspace/example.md"));
  renderer.onSessionUpdate({
    sessionUpdate: "tool_call_update",
    toolCallId: "edit-1",
    status: "completed",
    content: [{
      type: "diff",
      path: "/workspace/example.md",
      oldText: "same\nremove\nkeep\n",
      newText: "same\nadd\nkeep\n"
    }]
  });
  const step = assistantMessage.thinking.find(item => item.toolCallId === "edit-1");
  assert.deepStrictEqual(step.diff.oldLines, ["remove"]);
  assert.deepStrictEqual(step.diff.newLines, ["add"]);
});

test("denied and cancelled tool updates finish the action as failures", () => {
  for (const status of ["denied", "rejected", "cancelled"]) {
    const event = normalizeHermesEvent(toolCompleted("tool-1", status), "turn-1");
    assert.strictEqual(event.type, "action.failed");
  }
});

test("completed tool updates carrying an approval denial still fail the action", () => {
  const event = normalizeHermesEvent({
    sessionUpdate: "tool_call_update",
    toolCallId: "tool-1",
    status: "completed",
    content: [{ type: "content", content: { type: "text", text: '{"error":"Edit approval denied by ACP client; file was not modified."}' } }]
  }, "turn-1");
  assert.strictEqual(event.type, "action.failed");
  assert.strictEqual(event.approvalDenied, true);
});

test("native ACP plan entries replace Todo state without duplicating a Thinking plan", () => {
  const { assistantMessage, posted, renderer } = createHarness();
  renderer.onSessionUpdate(planUpdate([
    { content: "Inspect the renderer", status: "completed", priority: "medium" },
    { content: "Keep the composer stable", status: "in_progress", priority: "medium" }
  ]));
  assert.deepStrictEqual(assistantMessage.plan, [
    { content: "Inspect the renderer", status: "completed" },
    { content: "Keep the composer stable", status: "in_progress" }
  ]);
  assert.ok(!assistantMessage.thinking.some(step => step.kind === "plan"));
  assert.deepStrictEqual(posted.find(message => message.type === "planUpdate")?.plan, assistantMessage.plan);

  renderer.onSessionUpdate(planUpdate([
    { content: "Ship the fix", status: "pending", priority: "medium" }
  ]));
  assert.deepStrictEqual(assistantMessage.plan, [
    { content: "Ship the fix", status: "pending" }
  ]);

  renderer.onSessionUpdate(planUpdate([]));
  assert.deepStrictEqual(assistantMessage.plan, []);
});

test("ordinary answer chunks stay together without keyword classification", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(textUpdate("Let me explain. "));
  renderer.onSessionUpdate(textUpdate("First, this is the answer."));
  renderer.finalize("done");
  assert.strictEqual(assistantMessage.text, "Let me explain. First, this is the answer.");
  assert.strictEqual(assistantMessage.thinking.length, 0);
});

test("text followed by an action moves to Working", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(textUpdate("I will inspect the file."));
  renderer.onSessionUpdate(toolStarted("tool-1"));
  assert.ok(workingText(assistantMessage).includes("I will inspect the file."));
  assert.strictEqual(assistantMessage.text, "");
});

test("text between completed and subsequent actions stays in Working", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("tool-1"));
  renderer.onSessionUpdate(toolCompleted("tool-1"));
  renderer.onSessionUpdate(textUpdate("Now I will inspect the second file."));
  renderer.onSessionUpdate(toolStarted("tool-2"));
  assert.ok(workingText(assistantMessage).includes("Now I will inspect the second file."));
  assert.strictEqual(assistantMessage.text, "");
});

test("plain text after the last action becomes the final answer on completion", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("tool-1"));
  renderer.onSessionUpdate(toolCompleted("tool-1"));
  renderer.onSessionUpdate(textUpdate("The file contains hello."));
  renderer.finalize("done");
  assert.strictEqual(assistantMessage.text, "The file contains hello.");
  assert.ok(!workingText(assistantMessage).includes("The file contains hello."));
});

test("pending text followed by thinking moves to Working", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(textUpdate("I need to verify one detail."));
  renderer.onSessionUpdate(thoughtUpdate("Checking the constraints."));
  assert.ok(workingText(assistantMessage).includes("I need to verify one detail."));
  assert.ok(workingText(assistantMessage).includes("Checking the constraints."));
  assert.strictEqual(assistantMessage.text, "");
});

test("steer continuation retargets future output without completing the turn", () => {
  const { assistantMessage, posted, renderer } = createHarness();
  renderer.onSessionUpdate(thoughtUpdate("Inspecting the first approach."));
  const nextMessage = {
    id: "message-2",
    role: "assistant",
    text: "",
    status: "running",
    thinking: [],
    startedAt: 2
  };
  renderer.continueWith(nextMessage);
  renderer.ignoreNextAssistantText(/^Steer queued/);
  renderer.onSessionUpdate(textUpdate("Steer queued for the active turn"));
  renderer.onSessionUpdate(thoughtUpdate("Following the new guidance."));
  renderer.onSessionUpdate(textUpdate("Updated result."));
  renderer.finalize("done");

  assert.strictEqual(assistantMessage.status, "continued");
  assert.ok(workingText(assistantMessage).includes("Inspecting the first approach."));
  assert.strictEqual(nextMessage.status, "done");
  assert.strictEqual(nextMessage.text, "Updated result.");
  assert.ok(workingText(nextMessage).includes("Following the new guidance."));
  assert.ok(!nextMessage.text.includes("Steer queued"));
  assert.ok(posted.some(message => message.messageId === "message-2"));
});

test("tool completion after steer still updates the tool in the earlier segment", () => {
  const { assistantMessage, posted, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("tool-before-steer"));
  const nextMessage = {
    id: "message-2",
    role: "assistant",
    text: "",
    status: "running",
    thinking: [],
    startedAt: 2
  };
  renderer.continueWith(nextMessage);
  renderer.onSessionUpdate(toolCompleted("tool-before-steer"));
  assert.strictEqual(assistantMessage.thinking[0].done, true);
  assert.strictEqual(assistantMessage.thinking[0].status, "completed");
  assert.strictEqual(posted[posted.length - 1].messageId, assistantMessage.id);
});

test("successful turn completion reconciles an orphan Read action", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("read-orphan"));
  renderer.onSessionUpdate(textUpdate("The file was read successfully."));
  renderer.finalize("done");
  const step = assistantMessage.thinking.find(item => item.toolCallId === "read-orphan");
  assert.strictEqual(step.status, "completed");
  assert.strictEqual(step.done, true);
  assert.strictEqual(step.error, false);
  assert.strictEqual(step.inferredTerminal, true);
});

test("a later Action completes an earlier orphan Read before turn completion", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("read-1", "read: /workspace/first.md"));
  renderer.onSessionUpdate(thoughtUpdate("Preparing the next operation."));
  renderer.onSessionUpdate(toolStarted("edit-1", "patch: /workspace/first.md"));

  const read = assistantMessage.thinking.find(item => item.toolCallId === "read-1");
  const edit = assistantMessage.thinking.find(item => item.toolCallId === "edit-1");
  assert.strictEqual(read.status, "completed");
  assert.strictEqual(read.done, true);
  assert.strictEqual(read.error, false);
  assert.strictEqual(read.inferredTerminal, true);
  assert.strictEqual(edit.status, "running");
  assert.strictEqual(assistantMessage.status, "running");
});

test("a following Thinking phase completes the preceding Action", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("read-before-thinking", "read: /workspace/first.md"));
  renderer.onSessionUpdate(thoughtUpdate("Reasoning after the read."));

  const read = assistantMessage.thinking.find(item => item.toolCallId === "read-before-thinking");
  assert.strictEqual(read.status, "completed");
  assert.strictEqual(read.done, true);
  assert.strictEqual(read.error, false);
  assert.strictEqual(read.inferredTerminal, true);
  assert.strictEqual(assistantMessage.thinking.at(-1).kind, "thinking");
});

test("a following Thinking phase does not turn an explicit Action failure green", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("failed-before-thinking", "read: /workspace/first.md"));
  renderer.onSessionUpdate(toolCompleted("failed-before-thinking", "failed"));
  renderer.onSessionUpdate(thoughtUpdate("Reasoning after the failure."));

  const read = assistantMessage.thinking.find(item => item.toolCallId === "failed-before-thinking");
  assert.strictEqual(read.status, "failed");
  assert.strictEqual(read.done, true);
  assert.strictEqual(read.error, true);
});

test("cancelling a rejected Edit does not turn earlier inferred Read Actions red", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("read-1", "read: /workspace/first.md"));
  renderer.onSessionUpdate(toolStarted("edit-1", "patch: /workspace/first.md"));
  const read = assistantMessage.thinking.find(item => item.toolCallId === "read-1");
  const edit = assistantMessage.thinking.find(item => item.toolCallId === "edit-1");

  // The permission outcome recorder terminalizes only the rejected operation.
  edit.status = "failed";
  edit.done = true;
  edit.error = true;
  renderer.finalize("stopped");

  assert.strictEqual(read.status, "completed");
  assert.strictEqual(read.error, false);
  assert.strictEqual(edit.status, "failed");
  assert.strictEqual(edit.error, true);
});

test("a late explicit update overrides an inferred Action result without duplication", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("read-1", "read: /workspace/first.md"));
  renderer.onSessionUpdate(toolStarted("edit-1", "patch: /workspace/first.md"));
  renderer.onSessionUpdate(toolCompleted("read-1", "failed"));

  const reads = assistantMessage.thinking.filter(item => item.toolCallId === "read-1");
  assert.strictEqual(reads.length, 1);
  assert.strictEqual(reads[0].status, "failed");
  assert.strictEqual(reads[0].error, true);
});

test("failed and cancelled turns reconcile orphan actions without marking them successful", () => {
  for (const [turnStatus, expectedStatus] of [["failed", "failed"], ["stopped", "cancelled"]]) {
    const { assistantMessage, renderer } = createHarness();
    renderer.onSessionUpdate(toolStarted(`orphan-${turnStatus}`));
    renderer.finalize(turnStatus);
    const step = assistantMessage.thinking[0];
    assert.strictEqual(step.status, expectedStatus);
    assert.strictEqual(step.done, true);
    assert.strictEqual(step.error, true);
  }
});

test("explicit failed tool state is not overwritten when the turn later completes", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(toolStarted("explicit-failure"));
  renderer.onSessionUpdate(toolCompleted("explicit-failure", "failed"));
  renderer.onSessionUpdate(textUpdate("The requested edit was not applied."));
  renderer.finalize("done");
  const step = assistantMessage.thinking[0];
  assert.strictEqual(step.status, "failed");
  assert.strictEqual(step.error, true);
  assert.strictEqual(step.inferredTerminal, undefined);
});

test("thinking remains in Working while the following final text becomes answer", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(thoughtUpdate("Consider the request."));
  renderer.onSessionUpdate(textUpdate("The answer is 42."));
  renderer.finalize("done");
  assert.ok(workingText(assistantMessage).includes("Consider the request."));
  assert.strictEqual(assistantMessage.text, "The answer is 42.");
});

test("markdown syntax does not classify process text as an answer", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(textUpdate("## Inspect files\n- Read configuration"));
  renderer.onSessionUpdate(toolStarted("tool-1"));
  assert.ok(workingText(assistantMessage).includes("Inspect files"));
  assert.strictEqual(assistantMessage.text, "");
});

test("an empty completed turn requests one final-answer completion", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(thoughtUpdate("Only process output."));
  const first = renderer.finalize("done");
  assert.deepStrictEqual(first, { needsFinalAnswer: true });
  assert.strictEqual(assistantMessage.status, "running");
  const second = renderer.finalize("done");
  assert.deepStrictEqual(second, { needsFinalAnswer: false });
  assert.strictEqual(assistantMessage.text, "Hermes completed the work but did not return a final response.");
  assert.strictEqual(assistantMessage.status, "done");
});

test("Hermes silence markers do not count as a user-facing answer", () => {
  for (const marker of ["[SILENT]", "SILENT", "NO_REPLY", "NO REPLY"]) {
    const { assistantMessage, renderer } = createHarness();
    renderer.onSessionUpdate(textUpdate(marker));
    assert.deepStrictEqual(renderer.finalize("done"), { needsFinalAnswer: true });
    assert.strictEqual(assistantMessage.status, "running");
    assert.strictEqual(assistantMessage.text, "");
  }
});

test("explicit final events and following assistant text stream into answer", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.handleEvent({ type: "final_answer.delta", turnId: "session-1", streamId: "final", content: "Final " });
  renderer.onSessionUpdate(textUpdate("answer."));
  renderer.finalize("done");
  assert.strictEqual(assistantMessage.text, "Final answer.");
  assert.strictEqual(assistantMessage.thinking.length, 0);
});

test("final-answer completion writes only to the existing answer body", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(thoughtUpdate("Original process output."));
  assert.deepStrictEqual(renderer.finalize("done"), { needsFinalAnswer: true });
  const workingCount = assistantMessage.thinking.length;
  renderer.beginFinalAnswerOnly();
  renderer.onSessionUpdate(thoughtUpdate("Do not add this thought."));
  renderer.onSessionUpdate(toolStarted("unexpected-tool"));
  renderer.onSessionUpdate(textUpdate("A concise final response."));
  assert.deepStrictEqual(renderer.finalize("done"), { needsFinalAnswer: false });
  assert.strictEqual(assistantMessage.text, "A concise final response.");
  assert.strictEqual(assistantMessage.thinking.length, workingCount);
  assert.ok(!workingText(assistantMessage).includes("Do not add this thought."));
});

test("final-answer completion still honors failure and cancellation", () => {
  for (const status of ["failed", "stopped"]) {
    const { assistantMessage, renderer } = createHarness();
    assert.deepStrictEqual(renderer.finalize("done"), { needsFinalAnswer: true });
    renderer.beginFinalAnswerOnly();
    assert.deepStrictEqual(renderer.finalize(status), { needsFinalAnswer: false });
    assert.strictEqual(assistantMessage.status, status);
  }
});

test("failed and cancelled turns do not promote pending process text", () => {
  for (const status of ["failed", "stopped"]) {
    const { assistantMessage, renderer } = createHarness();
    renderer.onSessionUpdate(textUpdate("Unfinished process narration."));
    renderer.finalize(status);
    assert.ok(!assistantMessage.text.includes("Unfinished process narration."));
    assert.ok(!workingText(assistantMessage).includes("Unfinished process narration."));
    assert.strictEqual(assistantMessage.status, status);
    if (status === "failed") assert.strictEqual(assistantMessage.text, "Hermes could not complete the request.");
    else assert.strictEqual(assistantMessage.text, "");
  }
});

test("stopped turns ignore late answer, thinking, and action events", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(thoughtUpdate("Work before cancellation."));
  renderer.finalize("stopped");
  const snapshot = JSON.stringify(assistantMessage);

  renderer.onSessionUpdate(textUpdate("Late answer."));
  renderer.onSessionUpdate(thoughtUpdate("Late thought."));
  renderer.onSessionUpdate(toolStarted("late-tool"));

  assert.strictEqual(JSON.stringify(assistantMessage), snapshot);
  assert.strictEqual(assistantMessage.status, "stopped");
});

test("action labels use verb base forms while Thinking is unchanged", () => {
  const cases = [
    ["read: /workspace/a", "Read"],
    ["search: needle", "Search"],
    ["write: /workspace/a", "Write"],
    ["terminal: npm test", "Run command"]
  ];
  for (const [title, expected] of cases) {
    const { assistantMessage, renderer } = createHarness();
    renderer.onSessionUpdate(toolStarted("tool-1", title));
    assert.strictEqual(assistantMessage.thinking[0].action, expected);
    assert.ok(!assistantMessage.thinking[0].action.endsWith("ing"));
  }
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(thoughtUpdate("Reasoning"));
  assert.strictEqual(assistantMessage.thinking[0].title, "Thinking");
});

test("the same text never exists in both Working and answer", () => {
  const { assistantMessage, renderer } = createHarness();
  renderer.onSessionUpdate(textUpdate("Final unique text."));
  renderer.finalize("done");
  assert.strictEqual(assistantMessage.text, "Final unique text.");
  assert.ok(!workingText(assistantMessage).includes("Final unique text."));
});

let failed = 0;
for (const { name, run } of tests) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error);
  }
}

if (failed) process.exitCode = 1;
else console.log(`PASS ${tests.length} ACP stream routing tests`);
