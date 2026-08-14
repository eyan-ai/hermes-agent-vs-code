"use strict";

const assert = require("assert");
const { buildPreviewEdit, changedLineIndices, changedOldRanges, locatePreviewForRemoval } = require("../lib/diff-preview");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
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
