"use strict";

const assert = require("assert");
const { buildPreviewEdit, buildInlineDiffDocument, buildInlineDiffPlan, changedLineIndices, changedOldRanges, locatePreviewForRemoval, sourceSnapshotMatches } = require("../lib/diff-preview");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function applyInlinePlan(source, plan) {
  let result = source;
  for (const item of [...plan.insertions].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, item.offset) + item.text + result.slice(item.offset);
  }
  return result;
}

function rangeTexts(text, ranges) {
  return ranges.map(range => text.slice(range.start, range.end));
}

test("builds a complete multiline preview below the replaced text", () => {
  const source = "Before\nOld paragraph.\nAfter";
  const preview = buildPreviewEdit(source, "Old paragraph.", "New line one.\nNew line two.", 0);

  assert.ok(preview);
  assert.strictEqual(preview.oldStart, source.indexOf("Old paragraph."));
  assert.strictEqual(preview.oldEnd, preview.oldStart + "Old paragraph.".length);
  assert.strictEqual(preview.insertOffset, source.indexOf("After"));
  assert.strictEqual(preview.insertText, "New line one.\nNew line two.\n");

  const withPreview = source.slice(0, preview.insertOffset)
    + preview.insertText
    + source.slice(preview.insertOffset);
  assert.strictEqual(withPreview, "Before\nOld paragraph.\nNew line one.\nNew line two.\nAfter");
});

test("does not add duplicate boundary newlines", () => {
  const source = "Before\nOld paragraph.\nAfter";
  const preview = buildPreviewEdit(source, "Old paragraph.\n", "New paragraph.\n", 0);

  assert.ok(preview);
  assert.strictEqual(preview.insertText, "New paragraph.\n");
});

test("localizes a whole-document rewrite to the changed lines", () => {
  const source = "# Notes\n\nKeep before.\n\nOld paragraph.\n\nKeep after.\n";
  const updated = "# Notes\n\nKeep before.\n\nNew paragraph line one.\nNew paragraph line two.\n\nKeep after.\n";
  const preview = buildPreviewEdit(source, source, updated, 0);

  assert.ok(preview);
  assert.strictEqual(preview.oldText, "Old paragraph.");
  assert.strictEqual(preview.newText, "New paragraph line one.\nNew paragraph line two.");
  assert.strictEqual(preview.oldStart, source.indexOf("Old paragraph."));
  assert.strictEqual(preview.insertOffset, source.indexOf("\nKeep after."));

  const withPreview = source.slice(0, preview.insertOffset)
    + preview.insertText
    + source.slice(preview.insertOffset);
  assert.strictEqual(
    withPreview,
    "# Notes\n\nKeep before.\n\nOld paragraph.\nNew paragraph line one.\nNew paragraph line two.\n\nKeep after.\n"
  );
  assert.strictEqual(withPreview.includes(`${source}${updated}`), false);
});

test("keeps all lines between separated changes in one safe preview block", () => {
  const source = "Header\nFirst old line.\nMiddle unchanged.\nSecond old line.\nFooter";
  const updated = "Header\nFirst new line.\nMiddle unchanged.\nSecond new line.\nFooter";
  const preview = buildPreviewEdit(source, source, updated, 0);

  assert.ok(preview);
  assert.strictEqual(preview.oldText, "First old line.\nMiddle unchanged.\nSecond old line.");
  assert.strictEqual(preview.newText, "First new line.\nMiddle unchanged.\nSecond new line.");
});

test("places a whole-line insertion at its actual document position", () => {
  const source = "Before\nAfter\n";
  const updated = "Before\nInserted one.\nInserted two.\nAfter\n";
  const preview = buildPreviewEdit(source, source, updated, 0);
  const withPreview = source.slice(0, preview.insertOffset) + preview.insertText + source.slice(preview.insertOffset);

  assert.strictEqual(preview.oldText, "");
  assert.strictEqual(preview.newText, "Inserted one.\nInserted two.");
  assert.strictEqual(withPreview, updated);
});

test("keeps a whole-line deletion as a deletion-only preview", () => {
  const source = "Before\nRemove one.\nRemove two.\nAfter\n";
  const updated = "Before\nAfter\n";
  const preview = buildPreviewEdit(source, source, updated, 0);

  assert.strictEqual(preview.oldText, "Remove one.\nRemove two.");
  assert.strictEqual(preview.newText, "");
  assert.strictEqual(preview.insertText, "");
});

test("supports deletion-only changes without inserting preview text", () => {
  const source = "Before\nRemove this.\nAfter";
  const preview = buildPreviewEdit(source, "Remove this.\n", "", 0);

  assert.ok(preview);
  assert.strictEqual(preview.oldStart, source.indexOf("Remove this."));
  assert.strictEqual(preview.insertText, "");
  assert.deepStrictEqual(locatePreviewForRemoval(source, preview), {
    start: preview.insertOffset,
    end: preview.insertOffset
  });
});

test("returns no preview when the old text cannot be located", () => {
  assert.strictEqual(buildPreviewEdit("Alpha\nBeta", "Missing", "Replacement", 0), null);
});

test("refuses an ambiguous old paragraph", () => {
  assert.strictEqual(buildPreviewEdit("Same\nOther\nSame", "Same", "Changed", 0), null);
  assert.strictEqual(buildPreviewEdit("aaa", "aa", "Changed", 0), null);
});

test("places a partial-line replacement below the complete source line", () => {
  const source = "Prefix old phrase suffix\nAfter";
  const preview = buildPreviewEdit(source, "old phrase", "New paragraph", 0);
  const withPreview = source.slice(0, preview.insertOffset) + preview.insertText + source.slice(preview.insertOffset);

  assert.strictEqual(withPreview, "Prefix old phrase suffix\nNew paragraph\nAfter");
});

test("returns separate exact ranges for separated character changes", () => {
  assert.deepStrictEqual(changedOldRanges("abXcdYef", "ab1cd2ef"), [
    { start: 2, end: 3 },
    { start: 5, end: 6 }
  ]);
});

test("returns only actually changed lines for a multiline replacement", () => {
  assert.deepStrictEqual(
    changedLineIndices(
      "First old line.\nMiddle unchanged.\nSecond old line.",
      "First new line.\nMiddle unchanged.\nSecond new line."
    ),
    { old: [0, 2], new: [0, 2] }
  );
});

test("returns added and deleted lines without marking unchanged context", () => {
  assert.deepStrictEqual(
    changedLineIndices("Before\nAfter", "Before\nInserted one\nInserted two\nAfter"),
    { old: [], new: [1, 2] }
  );
  assert.deepStrictEqual(
    changedLineIndices("Before\nRemove one\nRemove two\nAfter", "Before\nAfter"),
    { old: [1, 2], new: [] }
  );
});

test("keeps positional context when a later duplicate line changes or is deleted", () => {
  assert.deepStrictEqual(changedLineIndices("same\nsame", "same\nchanged"), {
    old: [1],
    new: [1]
  });
  assert.deepStrictEqual(changedLineIndices("same\nsame", "same"), {
    old: [1],
    new: []
  });
});

test("locates the exact preview after unrelated edits before the paragraph", () => {
  const source = "Before\nOld paragraph.\nAfter";
  const preview = buildPreviewEdit(source, "Old paragraph.", "New paragraph.", 0);
  const withPreview = source.slice(0, preview.insertOffset)
    + preview.insertText
    + source.slice(preview.insertOffset);
  const shifted = `Intro\n${withPreview}`;
  const removal = locatePreviewForRemoval(shifted, preview);

  assert.deepStrictEqual(removal, {
    start: shifted.indexOf(preview.insertText, shifted.indexOf("Old paragraph.")),
    end: shifted.indexOf(preview.insertText, shifted.indexOf("Old paragraph.")) + preview.insertText.length
  });
});

test("refuses removal when the preview itself was edited", () => {
  const source = "Before\nOld paragraph.\nAfter";
  const preview = buildPreviewEdit(source, "Old paragraph.", "New paragraph.", 0);
  const withPreview = source.slice(0, preview.insertOffset)
    + preview.insertText.replace("New", "Edited")
    + source.slice(preview.insertOffset);

  assert.strictEqual(locatePreviewForRemoval(withPreview, preview), null);
});

test("tight preview insertions interleave replacement lines", () => {
  const source = "before\nold one\nold two\nafter\n";
  const preview = buildPreviewEdit(source, "old one\nold two", "new one\nnew two");
  const insertions = buildInlineDiffPlan(preview, source).insertions;
  let result = source;
  for (const item of [...insertions].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, item.offset) + item.text + result.slice(item.offset);
  }
  assert.strictEqual(result, "before\nold one\nnew one\nold two\nnew two\nafter\n");
});

test("tight preview preserves CRLF offsets", () => {
  const source = "before\r\nold one\r\nold two\r\nafter\r\n";
  const preview = buildPreviewEdit(source, "old one\r\nold two", "new one\r\nnew two");
  const insertions = buildInlineDiffPlan(preview, source).insertions;
  let result = source;
  for (const item of [...insertions].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, item.offset) + item.text + result.slice(item.offset);
  }
  assert.strictEqual(result, "before\r\nold one\r\nnew one\r\nold two\r\nnew two\r\nafter\r\n");
});

test("inline plan returns final red and green ranges after inserted lines shift source coordinates", () => {
  const source = "before\nold one\nold two\nafter\n";
  const preview = buildPreviewEdit(source, "old one\nold two", "new one\nnew two");
  const plan = buildInlineDiffPlan(preview, source);
  const result = applyInlinePlan(source, plan);

  assert.deepStrictEqual(rangeTexts(result, plan.deletedRanges), ["old one", "old two"]);
  assert.deepStrictEqual(rangeTexts(result, plan.addedRanges), ["new one", "new two"]);
});

test("inline plan keeps separated hunks independent", () => {
  const source = "start\nold one\nkeep\nold two\nend\n";
  const preview = buildPreviewEdit(source, source, "start\nnew one\nkeep\nnew two\nend\n");
  const plan = buildInlineDiffPlan(preview, source);
  const result = applyInlinePlan(source, plan);

  assert.strictEqual(result, "start\nold one\nnew one\nkeep\nold two\nnew two\nend\n");
  assert.deepStrictEqual(rangeTexts(result, plan.deletedRanges), ["old one", "old two"]);
  assert.deepStrictEqual(rangeTexts(result, plan.addedRanges), ["new one", "new two"]);
});

test("inline plan handles additions and deletions with unequal counts without placeholders", () => {
  const moreAddedSource = "top\nold\nbottom\n";
  const moreAddedPreview = buildPreviewEdit(moreAddedSource, "old", "new one\nnew two\nnew three");
  const moreAddedPlan = buildInlineDiffPlan(moreAddedPreview, moreAddedSource);
  const moreAddedResult = applyInlinePlan(moreAddedSource, moreAddedPlan);
  assert.strictEqual(moreAddedResult, "top\nold\nnew one\nnew two\nnew three\nbottom\n");
  assert.deepStrictEqual(rangeTexts(moreAddedResult, moreAddedPlan.deletedRanges), ["old"]);
  assert.deepStrictEqual(rangeTexts(moreAddedResult, moreAddedPlan.addedRanges), ["new one\nnew two\nnew three"]);

  const moreDeletedSource = "top\nold one\nold two\nold three\nbottom\n";
  const moreDeletedPreview = buildPreviewEdit(moreDeletedSource, "old one\nold two\nold three", "new");
  const moreDeletedPlan = buildInlineDiffPlan(moreDeletedPreview, moreDeletedSource);
  const moreDeletedResult = applyInlinePlan(moreDeletedSource, moreDeletedPlan);
  assert.strictEqual(moreDeletedResult, "top\nold one\nnew\nold two\nold three\nbottom\n");
  assert.deepStrictEqual(rangeTexts(moreDeletedResult, moreDeletedPlan.deletedRanges), ["old one", "old two", "old three"]);
  assert.deepStrictEqual(rangeTexts(moreDeletedResult, moreDeletedPlan.addedRanges), ["new"]);
});

test("inline plan distinguishes real blank-line changes from equal blank lines", () => {
  const source = "header\n\nold\n\nfooter\n";
  const preview = buildPreviewEdit(source, source, "header\n\nnew\nextra\n\nfooter\n");
  const plan = buildInlineDiffPlan(preview, source);
  const result = applyInlinePlan(source, plan);

  assert.strictEqual(result, "header\n\nold\nnew\nextra\n\nfooter\n");
  assert.deepStrictEqual(rangeTexts(result, plan.deletedRanges), ["old"]);
  assert.deepStrictEqual(rangeTexts(result, plan.addedRanges), ["new\nextra"]);
});

test("inline plan supports pure additions, pure deletions, and a missing final newline", () => {
  const additionSource = "first\nlast";
  const additionPreview = buildPreviewEdit(additionSource, additionSource, "first\nadded\nlast");
  const additionPlan = buildInlineDiffPlan(additionPreview, additionSource);
  const additionResult = applyInlinePlan(additionSource, additionPlan);
  assert.strictEqual(additionResult, "first\nadded\nlast");
  assert.deepStrictEqual(additionPlan.deletedRanges, []);
  assert.deepStrictEqual(rangeTexts(additionResult, additionPlan.addedRanges), ["added"]);

  const deletionSource = "first\nremove\nlast";
  const deletionPreview = buildPreviewEdit(deletionSource, deletionSource, "first\nlast");
  const deletionPlan = buildInlineDiffPlan(deletionPreview, deletionSource);
  const deletionResult = applyInlinePlan(deletionSource, deletionPlan);
  assert.strictEqual(deletionResult, deletionSource);
  assert.deepStrictEqual(rangeTexts(deletionResult, deletionPlan.deletedRanges), ["remove"]);
  assert.deepStrictEqual(deletionPlan.addedRanges, []);
});

test("inline plan keeps CRLF ranges aligned", () => {
  const source = "before\r\nold one\r\nold two\r\nafter\r\n";
  const preview = buildPreviewEdit(source, "old one\r\nold two", "new one\r\nnew two");
  const plan = buildInlineDiffPlan(preview, source);
  const result = applyInlinePlan(source, plan);

  assert.deepStrictEqual(rangeTexts(result, plan.deletedRanges), ["old one", "old two"]);
  assert.deepStrictEqual(rangeTexts(result, plan.addedRanges), ["new one", "new two"]);
});

test("virtual Diff document preserves tight replacement ordering without mutating inputs", () => {
  const source = "before\nold one\nold two\nafter\n";
  const preview = buildPreviewEdit(source, "old one\nold two", "new one\nnew two");
  const snapshot = JSON.parse(JSON.stringify(preview));
  const projected = buildInlineDiffDocument(preview, source);

  assert.strictEqual(projected.text, "before\nold one\nnew one\nold two\nnew two\nafter\n");
  assert.deepStrictEqual(rangeTexts(projected.text, projected.deletedRanges), ["old one", "old two"]);
  assert.deepStrictEqual(rangeTexts(projected.text, projected.addedRanges), ["new one", "new two"]);
  assert.strictEqual(source, "before\nold one\nold two\nafter\n");
  assert.deepStrictEqual(preview, snapshot);
});

test("virtual Diff document preserves separated hunks, CRLF, and a missing final newline", () => {
  const source = "start\r\nold one\r\nkeep\r\nold two";
  const preview = buildPreviewEdit(source, source, "start\r\nnew one\r\nkeep\r\nnew two");
  const projected = buildInlineDiffDocument(preview, source);

  assert.strictEqual(projected.text, "start\r\nold one\r\nnew one\r\nkeep\r\nold two\r\nnew two");
  assert.deepStrictEqual(rangeTexts(projected.text, projected.deletedRanges), ["old one", "old two"]);
  assert.deepStrictEqual(rangeTexts(projected.text, projected.addedRanges), ["new one", "new two"]);
});

test("virtual Diff document supports additions, deletions, blank lines, and new files", () => {
  const additionSource = "first\nlast";
  const addition = buildInlineDiffDocument(
    buildPreviewEdit(additionSource, additionSource, "first\nadded\nlast"),
    additionSource
  );
  assert.strictEqual(addition.text, "first\nadded\nlast");
  assert.deepStrictEqual(addition.deletedRanges, []);
  assert.deepStrictEqual(rangeTexts(addition.text, addition.addedRanges), ["added"]);

  const deletionSource = "first\nremove\nlast";
  const deletion = buildInlineDiffDocument(
    buildPreviewEdit(deletionSource, deletionSource, "first\nlast"),
    deletionSource
  );
  assert.strictEqual(deletion.text, deletionSource);
  assert.deepStrictEqual(rangeTexts(deletion.text, deletion.deletedRanges), ["remove"]);
  assert.deepStrictEqual(deletion.addedRanges, []);

  const newFilePreview = { oldText: "", newText: "new one\n\nnew two\n", oldStart: 0, oldEnd: 0 };
  const newFile = buildInlineDiffDocument(newFilePreview, "");
  assert.strictEqual(newFile.text, "new one\n\nnew two\n");
  assert.deepStrictEqual(newFile.deletedRanges, []);
  assert.deepStrictEqual(rangeTexts(newFile.text, newFile.addedRanges), ["new one\n\nnew two"]);
});

test("source snapshot matching covers saved, dirty, deleted, and newly-created targets", () => {
  const existing = { sourceKind: "document", sourceText: "original" };
  assert.strictEqual(sourceSnapshotMatches(existing, {
    documentPresent: true,
    documentText: "original",
    filePresent: true,
    fileText: "original"
  }), true);
  assert.strictEqual(sourceSnapshotMatches(existing, {
    documentPresent: true,
    documentText: "user edit",
    filePresent: true,
    fileText: "original"
  }), false);
  assert.strictEqual(sourceSnapshotMatches(existing, {
    documentPresent: true,
    documentText: "original",
    filePresent: true,
    fileText: "external edit"
  }), false);
  assert.strictEqual(sourceSnapshotMatches(existing, {
    documentPresent: false,
    filePresent: false
  }), false);

  const missing = { sourceKind: "missing", sourceText: "" };
  assert.strictEqual(sourceSnapshotMatches(missing, {
    documentPresent: false,
    filePresent: false
  }), true);
  assert.strictEqual(sourceSnapshotMatches(missing, {
    documentPresent: false,
    filePresent: true,
    fileText: "created elsewhere"
  }), false);
});
