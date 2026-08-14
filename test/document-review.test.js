"use strict";

const assert = require("assert");
const { prepareDocumentReview, prepareDocumentReviewBatch } = require("../lib/document-review");

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("new files use a full-content preview without Diff", () => {
  const review = prepareDocumentReview({
    sourceKind: "missing",
    sourceText: "",
    oldText: "",
    newText: "# New document\n\nComplete content.\n"
  });
  assert.strictEqual(review.kind, "new-file");
  assert.strictEqual(review.candidateText, "# New document\n\nComplete content.\n");
  assert.deepStrictEqual(review.operations, []);
});

test("whole-document payloads with a small actual change stay local", () => {
  const source = "# Title\n\nKeep this.\nOld sentence.\n\nEnd.\n";
  const candidate = source.replace("Old sentence.", "New sentence.");
  const review = prepareDocumentReview({
    sourceKind: "file",
    sourceText: source,
    oldText: source,
    newText: candidate
  });
  assert.strictEqual(review.kind, "local-diff");
  assert.strictEqual(review.wholeDocument, true);
  assert.strictEqual(review.candidateText, candidate);
  assert.strictEqual(review.changedLineCount, 1);
  assert.deepStrictEqual(review.operations, []);
});

test("whole-document payloads use full Review when the actual change is large", () => {
  const source = Array.from({ length: 24 }, (_, index) => `Old line ${index + 1}.`).join("\n");
  const candidate = Array.from({ length: 24 }, (_, index) => `New line ${index + 1}.`).join("\n");
  const review = prepareDocumentReview({
    sourceKind: "file",
    sourceText: source,
    oldText: source,
    newText: candidate
  });
  assert.strictEqual(review.kind, "full-review");
  assert.strictEqual(review.wholeDocument, true);
  assert.ok(review.changedLineCount >= 18);
  assert.ok(review.operations.some(item => item.type === "delete"));
  assert.ok(review.operations.some(item => item.type === "add"));
});

test("small localized edits stay in the ordinary Diff flow", () => {
  const review = prepareDocumentReview({
    sourceKind: "file",
    sourceText: "before\nold line\nafter\n",
    oldText: "old line",
    newText: "new line"
  });
  assert.strictEqual(review.kind, "local-diff");
  assert.strictEqual(review.candidateText, "before\nnew line\nafter\n");
});

test("large localized edits upgrade only the review UI", () => {
  const oldLines = Array.from({ length: 18 }, (_, index) => `old ${index + 1}`).join("\n");
  const newLines = Array.from({ length: 18 }, (_, index) => `new ${index + 1}`).join("\n");
  const review = prepareDocumentReview({
    sourceKind: "file",
    sourceText: `header\n${oldLines}\nfooter\n`,
    oldText: oldLines,
    newText: newLines
  });
  assert.strictEqual(review.kind, "full-review");
  assert.strictEqual(review.wholeDocument, false);
  assert.ok(review.changedLineCount >= 18);
});

test("multiple edits for one document become one atomic candidate review", () => {
  const source = "Title\n\nOld first.\n\nKeep.\n\nOld second.\n";
  const review = prepareDocumentReviewBatch({
    sourceKind: "file",
    sourceText: source,
    diffs: [
      { oldText: "Old first.", newText: "New first." },
      { oldText: "Old second.", newText: "New second." }
    ]
  });
  assert.ok(review);
  assert.strictEqual(review.candidateText, "Title\n\nNew first.\n\nKeep.\n\nNew second.\n");
  assert.strictEqual(review.edit.oldStart, source.indexOf("Old first."));
  assert.strictEqual(review.edit.oldEnd, source.indexOf("Old second.") + "Old second.".length);
});

test("ambiguous or overlapping edit batches fail safely", () => {
  assert.strictEqual(prepareDocumentReviewBatch({
    sourceKind: "file",
    sourceText: "same\nsame\n",
    diffs: [{ oldText: "same", newText: "changed" }]
  }), null);
  assert.strictEqual(prepareDocumentReviewBatch({
    sourceKind: "file",
    sourceText: "abcdef",
    diffs: [
      { oldText: "abcd", newText: "one" },
      { oldText: "cdef", newText: "two" }
    ]
  }), null);
});
