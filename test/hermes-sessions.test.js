"use strict";

const assert = require("assert");
const {
  buildHermesPromptBlocks,
  canApplyHermesSnapshotMessages,
  hermesMessageVersion,
  isUnsupportedHermesSessionMethod,
  mergeHermesSessions,
  projectHermesSnapshot
} = require("../lib/hermes-sessions");

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("Hermes list owns persisted session titles while local drafts survive", () => {
  const local = [
    { id: "ui-1", acpSessionId: "hermes-1", title: "Stale local title", messages: [{ role: "user", text: "old" }], settings: { mode: "Manual" } },
    { id: "draft-1", title: "Untitled", messages: [], settings: {} },
    { id: "legacy-1", acpSessionId: "missing", title: "Legacy cache", messages: [{ role: "user", text: "keep me" }], settings: {} }
  ];
  const merged = mergeHermesSessions(local, [
    { sessionId: "hermes-1", title: "Authoritative title", updatedAt: "2026-08-20T01:00:00Z" },
    { sessionId: "hermes-2", title: "Desktop-created session", updatedAt: "2026-08-20T02:00:00Z" }
  ], { createId: value => `ui-${value}` });

  assert.strictEqual(merged.find(item => item.acpSessionId === "hermes-1").title, "Authoritative title");
  assert.strictEqual(merged.find(item => item.acpSessionId === "hermes-1").settings.mode, "Manual");
  assert.ok(merged.find(item => item.acpSessionId === "hermes-2"));
  assert.ok(merged.find(item => item.id === "draft-1"));
  assert.ok(merged.find(item => item.id === "legacy-1"));
});

test("old-Hermes local title overrides and delete tombstones survive refresh", () => {
  const merged = mergeHermesSessions([
    { id: "ui-1", acpSessionId: "hermes-1", title: "Local rename", titleOrigin: "manual", messages: [] }
  ], [
    { sessionId: "hermes-1", title: "Old remote title" },
    { sessionId: "hermes-2", title: "Locally deleted" }
  ], { excludedHermesIds: new Set(["hermes-2"]) });

  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].title, "Local rename");
  assert.strictEqual(merged[0].titleOrigin, "manual");
  assert.strictEqual(merged[0].titleOrigin, "manual");
});

test("Hermes snapshot restores user assistant reasoning and tool history", () => {
  const snapshot = projectHermesSnapshot({
    title: "Shared history",
    messages: [
      { role: "user", content: "Inspect the project" },
      { role: "assistant", content: "I will inspect it.", reasoning_content: "Checking files", tool_calls: [{ id: "call-1", function: { name: "read_file", arguments: '{"path":"a.md"}' } }] },
      { role: "tool", tool_call_id: "call-1", content: "hello" },
      { role: "assistant", content: "The file says hello." }
    ]
  }, { createId: (() => { let value = 0; return () => `m-${++value}`; })() });

  assert.strictEqual(snapshot.title, "Shared history");
  assert.strictEqual(snapshot.messages[0].role, "user");
  assert.strictEqual(snapshot.messages[0].text, "Inspect the project");
  assert.strictEqual(snapshot.messages[1].thinking[0].text, "Checking files");
  assert.strictEqual(snapshot.messages[1].thinking[1].title, "read_file");
  assert.strictEqual(snapshot.messages[1].thinking[1].result, "hello");
  assert.strictEqual(snapshot.messages[2].text, "The file says hello.");
});

test("Hermes snapshot hides persisted attachment bodies from the user bubble", () => {
  const snapshot = projectHermesSnapshot({
    messages: [{
      role: "user",
      content: "Review this file\n[Attached file: notes.md]\nURI: file:///tmp/notes.md\n\nsecret body"
    }]
  }, { createId: () => "message-1" });
  assert.strictEqual(snapshot.messages[0].text, "Review this file");
});

test("ACP prompt keeps user text separate from attachment resources", () => {
  const blocks = buildHermesPromptBlocks("Fix the title", {
    skill: "review",
    attachments: [{ name: "notes.md", path: "/tmp/notes.md", type: "file" }],
    editorContext: { name: "Selected lines", path: "/tmp/app.js", uri: "file:///tmp/app.js", text: "const value = 1;" }
  });

  assert.strictEqual(blocks[0].type, "text");
  assert.match(blocks[0].text, /^Fix the title/);
  assert.doesNotMatch(blocks[0].text, /Context:|notes\.md|const value/);
  assert.ok(blocks.some(block => block.type === "resource_link" && block.name === "notes.md"));
  assert.ok(blocks.some(block => block.type === "resource" && block.resource.text.includes("const value")));
});

test("attachment-only prompts contain no synthetic title text", () => {
  const blocks = buildHermesPromptBlocks("", {
    attachments: [{ name: "notes.md", uri: "file:///tmp/notes.md", type: "file" }]
  });
  assert.ok(blocks.length > 0);
  assert.ok(blocks.every(block => block.type !== "text"));
});

test("only method capability errors enable the old-Hermes local fallback", () => {
  assert.strictEqual(isUnsupportedHermesSessionMethod(new Error('RPC failed: {"code":-32601,"message":"Method not found"}')), true);
  assert.strictEqual(isUnsupportedHermesSessionMethod(new Error("unknown method")), true);
  assert.strictEqual(isUnsupportedHermesSessionMethod(new Error("database is locked")), false);
  assert.strictEqual(isUnsupportedHermesSessionMethod(new Error("ACP process exited with code 1")), false);
});

test("a delayed snapshot cannot overwrite a newly-started turn", () => {
  const session = { messages: [{ id: "old", role: "assistant", text: "old" }] };
  const version = hermesMessageVersion(session);
  assert.strictEqual(canApplyHermesSnapshotMessages(session, version, false), true);

  session.messages.push({ id: "new-user", role: "user", text: "continue" });
  assert.strictEqual(canApplyHermesSnapshotMessages(session, version, false), false);
  assert.strictEqual(canApplyHermesSnapshotMessages({ messages: [{ id: "old" }] }, version, true), false);
});

test("a snapshot cannot overwrite an in-place streaming completion", () => {
  const session = {
    messages: [{ id: "assistant-1", role: "assistant", text: "", status: "running", thinking: [] }]
  };
  const version = hermesMessageVersion(session);
  session.messages[0].text = "Finished answer";
  session.messages[0].status = "done";
  session.messages[0].thinking.push({ kind: "tool", title: "Read", status: "done" });

  assert.strictEqual(canApplyHermesSnapshotMessages(session, version, false), false);
  assert.strictEqual(canApplyHermesSnapshotMessages(session, hermesMessageVersion(session), true), false);
});
