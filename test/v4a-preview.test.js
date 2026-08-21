"use strict";

const assert = require("assert");
const { projectV4aUpdatePreview } = require("../lib/v4a-preview");

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function toolCall(source, patch, path = "article.md") {
  return {
    toolCallId: "tool-1",
    name: "Update File",
    content: [{ type: "diff", path, oldText: source, newText: patch }],
    rawInput: { tool: "patch", arguments: { mode: "patch", patch } }
  };
}

test("projects a single-file multi-hunk V4A update without mutating the request", () => {
  const source = "# 标题\n\n第一句旧内容。\n\n保留。\n\n第二句旧内容。\n";
  const patch = [
    "*** Begin Patch",
    "*** Update File: article.md",
    "@@ 第一处 @@",
    "-第一句旧内容。",
    "+第一句新内容。",
    "@@ 第二处 @@",
    "-第二句旧内容。",
    "+第二句新内容。",
    "*** End Patch"
  ].join("\n");
  const input = toolCall(source, patch);
  const before = JSON.stringify(input);

  assert.deepStrictEqual(projectV4aUpdatePreview(input), {
    kind: "ready",
    diff: {
      path: "article.md",
      oldText: source,
      newText: "# 标题\n\n第一句新内容。\n\n保留。\n\n第二句新内容。\n"
    }
  });
  assert.strictEqual(JSON.stringify(input), before);
});

test("preserves CRLF and a missing final newline", () => {
  const source = "one\r\ntwo\r\nthree";
  const patch = [
    "*** Begin Patch",
    "*** Update File: notes.txt",
    "@@",
    " two",
    "-three",
    "+THREE",
    "*** End Patch"
  ].join("\n");
  const result = projectV4aUpdatePreview(toolCall(source, patch, "notes.txt"));

  assert.strictEqual(result.kind, "ready");
  assert.strictEqual(result.diff.newText, "one\r\ntwo\r\nTHREE");
});

test("supports addition-only and deletion-only hunks", () => {
  const source = "alpha\nbeta\ngamma\n";
  const patch = [
    "*** Begin Patch",
    "*** Update File: article.md",
    "@@ alpha @@",
    "+inserted",
    "@@",
    "-gamma",
    "*** End Patch"
  ].join("\n");
  const result = projectV4aUpdatePreview(toolCall(source, patch));

  assert.strictEqual(result.kind, "ready");
  assert.strictEqual(result.diff.newText, "alpha\ninserted\nbeta\n\n");
});

test("fails closed when an update hunk is ambiguous or missing", () => {
  const ambiguous = [
    "*** Begin Patch",
    "*** Update File: article.md",
    "@@",
    "-same",
    "+changed",
    "*** End Patch"
  ].join("\n");
  assert.strictEqual(
    projectV4aUpdatePreview(toolCall("same\nkeep\nsame\n", ambiguous)).kind,
    "invalid"
  );
  assert.strictEqual(
    projectV4aUpdatePreview(toolCall("different\n", ambiguous)).kind,
    "invalid"
  );
});

test("does not claim normal or out-of-scope payloads", () => {
  const source = "old\n";
  const update = "*** Begin Patch\n*** Update File: article.md\n@@\n-old\n+new\n*** End Patch";
  const normal = toolCall(source, update);
  normal.rawInput.arguments.mode = "replace";
  assert.deepStrictEqual(projectV4aUpdatePreview(normal), { kind: "not-applicable" });

  const candidate = toolCall(source, update);
  candidate.content[0].newText = "new\n";
  assert.deepStrictEqual(projectV4aUpdatePreview(candidate), { kind: "not-applicable" });

  const add = "*** Begin Patch\n*** Add File: article.md\n+new\n*** End Patch";
  assert.deepStrictEqual(projectV4aUpdatePreview(toolCall("", add)), { kind: "not-applicable" });

  const multiple = toolCall(source, update);
  multiple.content.push({ type: "diff", path: "other.md", oldText: "a", newText: "b" });
  assert.deepStrictEqual(projectV4aUpdatePreview(multiple), { kind: "not-applicable" });
});

test("rejects a target-path mismatch without exposing a candidate", () => {
  const patch = "*** Begin Patch\n*** Update File: other.md\n@@\n-old\n+new\n*** End Patch";
  const result = projectV4aUpdatePreview(toolCall("old\n", patch, "article.md"));

  assert.strictEqual(result.kind, "invalid");
  assert.strictEqual(Object.hasOwn(result, "diff"), false);
});
