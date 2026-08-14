"use strict";

const { buildPreviewEdit, changedLineIndices, diffLineOperations } = require("./diff-preview");

const DEFAULT_CHANGED_LINE_THRESHOLD = 18;
const DEFAULT_CHANGED_CHARACTER_THRESHOLD = 1600;

function splitLines(value) {
  const text = String(value || "");
  if (!text) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

function prepareDocumentReview({
  sourceKind,
  sourceText,
  oldText,
  newText,
  fallbackOffset = 0,
  changedLineThreshold = DEFAULT_CHANGED_LINE_THRESHOLD,
  changedCharacterThreshold = DEFAULT_CHANGED_CHARACTER_THRESHOLD
}) {
  const source = String(sourceText || "");
  const oldValue = String(oldText || "");
  const newValue = String(newText || "");
  if (sourceKind === "missing") {
    return {
      kind: "new-file",
      candidateText: newValue,
      wholeDocument: true,
      changedLineCount: splitLines(newValue).length,
      changedCharacterCount: newValue.length,
      operations: [],
      edit: {
        oldText: "",
        newText: newValue,
        oldStart: 0,
        oldEnd: 0
      }
    };
  }

  const edit = buildPreviewEdit(source, oldValue, newValue, fallbackOffset);
  if (!edit) return null;
  const candidateText = `${source.slice(0, edit.oldStart)}${edit.newText}${source.slice(edit.oldEnd)}`;
  const changed = changedLineIndices(edit.oldText, edit.newText);
  const oldLines = splitLines(edit.oldText);
  const newLines = splitLines(edit.newText);
  const changedCharacterCount = changed.old.reduce((sum, index) => sum + (oldLines[index]?.length || 0), 0)
    + changed.new.reduce((sum, index) => sum + (newLines[index]?.length || 0), 0);
  const changedLineCount = Math.max(changed.old.length, changed.new.length);
  const wholeDocument = oldValue === source;
  const kind = changedLineCount >= changedLineThreshold
    || changedCharacterCount >= changedCharacterThreshold
    ? "full-review"
    : "local-diff";

  return {
    kind,
    candidateText,
    wholeDocument,
    changedLineCount,
    changedCharacterCount,
    operations: kind === "full-review" ? diffLineOperations(source, candidateText) : [],
    edit
  };
}

function uniqueOccurrence(source, value) {
  const first = source.indexOf(value);
  if (first < 0) return null;
  return source.indexOf(value, first + Math.max(1, value.length)) < 0 ? first : null;
}

function prepareDocumentReviewBatch({
  sourceKind,
  sourceText,
  diffs,
  fallbackOffset = 0,
  changedLineThreshold = DEFAULT_CHANGED_LINE_THRESHOLD,
  changedCharacterThreshold = DEFAULT_CHANGED_CHARACTER_THRESHOLD
}) {
  const edits = Array.isArray(diffs) ? diffs : [];
  if (!edits.length) return null;
  if (edits.length === 1) {
    return prepareDocumentReview({
      sourceKind,
      sourceText,
      oldText: edits[0]?.oldText,
      newText: edits[0]?.newText,
      fallbackOffset,
      changedLineThreshold,
      changedCharacterThreshold
    });
  }
  if (sourceKind === "missing") return null;

  const source = String(sourceText || "");
  const located = [];
  for (const diff of edits) {
    const oldText = String(diff?.oldText || "");
    const newText = String(diff?.newText || "");
    if (!oldText) return null;
    const start = uniqueOccurrence(source, oldText);
    if (start === null) return null;
    located.push({ start, end: start + oldText.length, newText });
  }
  located.sort((left, right) => left.start - right.start);
  for (let index = 1; index < located.length; index += 1) {
    if (located[index].start < located[index - 1].end) return null;
  }

  let candidateText = source;
  for (const edit of [...located].sort((left, right) => right.start - left.start)) {
    candidateText = `${candidateText.slice(0, edit.start)}${edit.newText}${candidateText.slice(edit.end)}`;
  }
  return prepareDocumentReview({
    sourceKind,
    sourceText: source,
    oldText: source,
    newText: candidateText,
    fallbackOffset,
    changedLineThreshold,
    changedCharacterThreshold
  });
}

module.exports = {
  DEFAULT_CHANGED_CHARACTER_THRESHOLD,
  DEFAULT_CHANGED_LINE_THRESHOLD,
  prepareDocumentReview,
  prepareDocumentReviewBatch
};
