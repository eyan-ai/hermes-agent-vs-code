"use strict";

const ANCHOR_LENGTH = 80;

function uniqueOccurrence(text, needle) {
  if (!needle) return -1;
  const first = text.indexOf(needle);
  if (first < 0) return -1;
  return text.indexOf(needle, first + 1) < 0 ? first : -1;
}

function commonPrefixLength(left, right) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left, right, prefixLength) {
  const limit = Math.min(left.length, right.length) - prefixLength;
  let length = 0;
  while (length < limit && left[left.length - 1 - length] === right[right.length - 1 - length]) {
    length += 1;
  }
  return length;
}

function lineStart(text, offset) {
  const cursor = Math.max(0, Math.min(text.length, offset));
  return cursor > 0 ? text.lastIndexOf("\n", cursor - 1) + 1 : 0;
}

function lineEnd(text, start, end) {
  const cursor = Math.max(0, Math.min(text.length, end > start ? end - 1 : end));
  const newline = text.indexOf("\n", cursor);
  return newline < 0 ? text.length : newline;
}

function startsAtLineBoundary(text, offset) {
  return offset === 0 || text[offset - 1] === "\n";
}

function localizeWholeDocumentChange(source, updated) {
  if (source === updated) return null;
  const prefix = commonPrefixLength(source, updated);
  const suffix = commonSuffixLength(source, updated, prefix);
  const oldChangeEnd = source.length - suffix;
  const newChangeEnd = updated.length - suffix;
  const oldChanged = source.slice(prefix, oldChangeEnd);
  const newChanged = updated.slice(prefix, newChangeEnd);
  const wholeLineDeletion = !newChanged
    && startsAtLineBoundary(source, prefix)
    && oldChanged.endsWith("\n");
  const wholeLineInsertion = !oldChanged
    && startsAtLineBoundary(updated, prefix)
    && newChanged.endsWith("\n");

  const oldStart = wholeLineInsertion ? prefix : lineStart(source, prefix);
  const oldEnd = wholeLineInsertion ? prefix : lineEnd(source, prefix, oldChangeEnd);
  const newStart = wholeLineDeletion ? prefix : lineStart(updated, prefix);
  const newEnd = wholeLineDeletion ? prefix : lineEnd(updated, prefix, newChangeEnd);
  return {
    oldStart,
    oldText: source.slice(oldStart, oldEnd),
    newText: updated.slice(newStart, newEnd)
  };
}

function buildPreviewEdit(fullText, oldText, newText, fallbackOffset = 0) {
  const source = String(fullText || "");
  let oldValue = String(oldText || "");
  let newValue = String(newText || "");
  if (!oldValue && !newValue) return null;

  const localized = oldValue === source ? localizeWholeDocumentChange(source, newValue) : null;
  if (oldValue === source && !localized) return null;
  if (localized) {
    oldValue = localized.oldText;
    newValue = localized.newText;
  }
  const oldStart = localized
    ? localized.oldStart
    : oldValue
      ? uniqueOccurrence(source, oldValue)
      : Math.max(0, Math.min(source.length, fallbackOffset));
  if (oldStart < 0) return null;

  const oldEnd = oldStart + oldValue.length;
  const nextLineBreak = source.indexOf("\n", oldEnd);
  const insertOffset = oldEnd > 0 && source[oldEnd - 1] === "\n"
    ? oldEnd
    : (nextLineBreak >= 0 ? nextLineBreak + 1 : source.length);
  const needsLeadingNewline = Boolean(newValue) && insertOffset > 0 && source[insertOffset - 1] !== "\n";
  const needsTrailingNewline = Boolean(newValue) && insertOffset < source.length
    && !newValue.endsWith("\n");
  const insertText = `${needsLeadingNewline ? "\n" : ""}${newValue}${needsTrailingNewline ? "\n" : ""}`;
  const beforeAnchor = source.slice(Math.max(0, insertOffset - ANCHOR_LENGTH), insertOffset);
  const afterAnchor = source.slice(insertOffset, insertOffset + ANCHOR_LENGTH);
  const leadingLength = needsLeadingNewline ? 1 : 0;

  return {
    oldText: oldValue,
    newText: newValue,
    oldStart,
    oldEnd,
    insertOffset,
    insertText,
    contentStart: insertOffset + leadingLength,
    contentEnd: insertOffset + leadingLength + newValue.length,
    beforeAnchor,
    afterAnchor
  };
}

function lcsLengths(left, right) {
  let previous = new Uint32Array(right.length + 1);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = new Uint32Array(right.length + 1);
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current[rightIndex + 1] = left[leftIndex] === right[rightIndex]
        ? previous[rightIndex] + 1
        : Math.max(previous[rightIndex + 1], current[rightIndex]);
    }
    previous = current;
  }
  return previous;
}

function reverseSequence(value) {
  return typeof value === "string" ? value.split("").reverse().join("") : [...value].reverse();
}

function collectLcsMatches(oldText, newText, oldOffset, newOffset, matches) {
  if (!oldText.length || !newText.length) return;
  if (oldText.length === 1) {
    const index = newText.indexOf(oldText[0]);
    if (index >= 0) matches.push({ oldIndex: oldOffset, newIndex: newOffset + index });
    return;
  }

  const oldMiddle = Math.floor(oldText.length / 2);
  const leftScores = lcsLengths(oldText.slice(0, oldMiddle), newText);
  const rightScores = lcsLengths(reverseSequence(oldText.slice(oldMiddle)), reverseSequence(newText));
  let newMiddle = 0;
  let best = -1;
  for (let index = 0; index <= newText.length; index += 1) {
    const score = leftScores[index] + rightScores[newText.length - index];
    if (score > best) {
      best = score;
      newMiddle = index;
    }
  }

  collectLcsMatches(oldText.slice(0, oldMiddle), newText.slice(0, newMiddle), oldOffset, newOffset, matches);
  collectLcsMatches(oldText.slice(oldMiddle), newText.slice(newMiddle), oldOffset + oldMiddle, newOffset + newMiddle, matches);
}

function changedOldRanges(oldText, newText) {
  const oldValue = String(oldText || "");
  const newValue = String(newText || "");
  if (!oldValue) return [];
  const matches = [];
  collectLcsMatches(oldValue, newValue, 0, 0, matches);
  const ranges = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.oldIndex > cursor) ranges.push({ start: cursor, end: match.oldIndex });
    cursor = match.oldIndex + 1;
  }
  if (cursor < oldValue.length) ranges.push({ start: cursor, end: oldValue.length });
  return ranges;
}

function splitDiffLines(value) {
  const text = String(value || "");
  if (!text) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

function changedLineIndices(oldText, newText) {
  const oldLines = splitDiffLines(oldText);
  const newLines = splitDiffLines(newText);
  let prefixLength = 0;
  while (prefixLength < oldLines.length && prefixLength < newLines.length
    && oldLines[prefixLength] === newLines[prefixLength]) {
    prefixLength += 1;
  }
  let suffixLength = 0;
  while (suffixLength < oldLines.length - prefixLength
    && suffixLength < newLines.length - prefixLength
    && oldLines[oldLines.length - 1 - suffixLength] === newLines[newLines.length - 1 - suffixLength]) {
    suffixLength += 1;
  }
  const matches = [];
  collectLcsMatches(
    oldLines.slice(prefixLength, oldLines.length - suffixLength),
    newLines.slice(prefixLength, newLines.length - suffixLength),
    prefixLength,
    prefixLength,
    matches
  );
  const unchangedOld = new Set(matches.map(match => match.oldIndex));
  const unchangedNew = new Set(matches.map(match => match.newIndex));
  for (let index = 0; index < prefixLength; index += 1) {
    unchangedOld.add(index);
    unchangedNew.add(index);
  }
  for (let index = 0; index < suffixLength; index += 1) {
    unchangedOld.add(oldLines.length - 1 - index);
    unchangedNew.add(newLines.length - 1 - index);
  }
  return {
    old: oldLines.map((_, index) => index).filter(index => !unchangedOld.has(index)),
    new: newLines.map((_, index) => index).filter(index => !unchangedNew.has(index))
  };
}

function diffLineOperations(oldText, newText) {
  const oldLines = splitDiffLines(oldText);
  const newLines = splitDiffLines(newText);
  const matches = [];
  collectLcsMatches(oldLines, newLines, 0, 0, matches);
  const operations = [];
  let oldCursor = 0;
  let newCursor = 0;
  for (const match of matches) {
    while (oldCursor < match.oldIndex) {
      operations.push({ type: "delete", text: oldLines[oldCursor], oldLine: oldCursor + 1 });
      oldCursor += 1;
    }
    while (newCursor < match.newIndex) {
      operations.push({ type: "add", text: newLines[newCursor], newLine: newCursor + 1 });
      newCursor += 1;
    }
    operations.push({
      type: "equal",
      text: oldLines[match.oldIndex],
      oldLine: match.oldIndex + 1,
      newLine: match.newIndex + 1
    });
    oldCursor = match.oldIndex + 1;
    newCursor = match.newIndex + 1;
  }
  while (oldCursor < oldLines.length) {
    operations.push({ type: "delete", text: oldLines[oldCursor], oldLine: oldCursor + 1 });
    oldCursor += 1;
  }
  while (newCursor < newLines.length) {
    operations.push({ type: "add", text: newLines[newCursor], newLine: newCursor + 1 });
    newCursor += 1;
  }
  return operations;
}

function locatePreviewForRemoval(currentText, previewRecord) {
  if (!previewRecord) return null;
  if (!previewRecord.insertText) {
    return { start: previewRecord.insertOffset, end: previewRecord.insertOffset };
  }
  const source = String(currentText || "");
  const before = String(previewRecord.beforeAnchor || "");
  const after = String(previewRecord.afterAnchor || "");
  const needle = `${before}${previewRecord.insertText}${after}`;
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + 1) >= 0) return null;
  const start = first + before.length;
  return { start, end: start + previewRecord.insertText.length };
}

// Build reversible insertions that interleave replacement lines with the
// original lines: old 1, new 1, old 2, new 2. Offsets are in the source text.
function buildInlineDiffPlan(previewRecord, sourceText) {
  const oldLines = splitDiffLines(previewRecord?.oldText).map(line => line.replace(/\r$/, ""));
  const source = String(sourceText || "");
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const newText = String(previewRecord?.newText || "");
  if (!oldLines.length) {
    if (!newText || !previewRecord?.insertText) {
      return { insertions: [], deletedRanges: [], addedRanges: [] };
    }
    const trailingLength = newText.endsWith(eol) ? eol.length : 0;
    const contentLength = Math.max(0, newText.length - trailingLength);
    const contentOffset = Math.max(0, previewRecord.contentStart - previewRecord.insertOffset);
    return {
      insertions: [{ offset: previewRecord.insertOffset, text: previewRecord.insertText }],
      deletedRanges: [],
      addedRanges: contentLength
        ? [{ start: previewRecord.insertOffset + contentOffset, end: previewRecord.insertOffset + contentOffset + contentLength }]
        : []
    };
  }
  const pendingInsertions = [];
  const deletedLineIndices = [];
  const lineStarts = [];
  const lineEnds = [];
  let sourceCursor = previewRecord.oldStart;
  for (const line of oldLines) {
    lineStarts.push(sourceCursor);
    lineEnds.push(sourceCursor + line.length);
    sourceCursor += line.length + eol.length;
  }
  const operations = diffLineOperations(previewRecord.oldText, previewRecord.newText);
  let oldIndex = 0;
  for (let cursor = 0; cursor < operations.length;) {
    if (operations[cursor].type === "equal") {
      oldIndex += 1;
      cursor += 1;
      continue;
    }
    const deleted = [];
    const added = [];
    while (cursor < operations.length && operations[cursor].type !== "equal") {
      const operation = operations[cursor];
      if (operation.type === "delete") {
        deleted.push(oldIndex);
        deletedLineIndices.push(oldIndex);
        oldIndex += 1;
      } else if (operation.type === "add") {
        added.push(operation.text.replace(/\r$/, ""));
      }
      cursor += 1;
    }
    if (!added.length) continue;
    if (!deleted.length) {
      const offset = oldIndex < lineEnds.length
        ? lineStarts[oldIndex]
        : previewRecord.oldStart + String(previewRecord.oldText || "").length;
      const atLineStart = offset === 0 || source.slice(0, offset).endsWith(eol);
      const text = atLineStart ? `${added.join(eol)}${eol}` : `${eol}${added.join(eol)}`;
      pendingInsertions.push({
        offset,
        text,
        addedStart: atLineStart ? 0 : eol.length,
        addedEnd: atLineStart ? text.length - eol.length : text.length
      });
      continue;
    }
    const paired = Math.min(deleted.length, added.length);
    for (let index = 0; index < paired; index += 1) {
      const text = `${eol}${added[index]}`;
      pendingInsertions.push({ offset: lineEnds[deleted[index]], text, addedStart: eol.length, addedEnd: text.length });
    }
    if (added.length > paired) {
      const offset = lineEnds[deleted[deleted.length - 1]];
      const text = `${eol}${added.slice(paired).join(eol)}`;
      pendingInsertions.push({ offset, text, addedStart: eol.length, addedEnd: text.length });
    }
  }
  const merged = [];
  for (const item of pendingInsertions) {
    const prior = merged.find(entry => entry.offset === item.offset);
    if (prior) {
      const priorLength = prior.text.length;
      prior.text += item.text;
      prior.addedStart = Math.min(prior.addedStart, priorLength + item.addedStart);
      prior.addedEnd = priorLength + item.addedEnd;
    } else {
      merged.push({ ...item });
    }
  }
  merged.sort((left, right) => left.offset - right.offset);
  const shiftBefore = offset => merged.reduce((shift, item) => (
    item.offset < offset ? shift + item.text.length : shift
  ), 0);
  const deletedRanges = deletedLineIndices.map(index => ({
    start: lineStarts[index] + shiftBefore(lineStarts[index]),
    end: lineEnds[index] + shiftBefore(lineEnds[index])
  }));
  const addedRanges = merged.map(item => {
    const insertionStart = item.offset + shiftBefore(item.offset);
    return { start: insertionStart + item.addedStart, end: insertionStart + item.addedEnd };
  });
  return {
    insertions: merged.map(({ offset, text }) => ({ offset, text })),
    deletedRanges,
    addedRanges
  };
}

function buildInlineDiffDocument(previewRecord, sourceText) {
  const source = String(sourceText || "");
  const record = !source && !String(previewRecord?.oldText || "") && previewRecord?.insertText === undefined
    ? {
        ...previewRecord,
        oldStart: 0,
        oldEnd: 0,
        insertOffset: 0,
        insertText: String(previewRecord?.newText || ""),
        contentStart: 0,
        contentEnd: String(previewRecord?.newText || "").length
      }
    : previewRecord;
  const plan = buildInlineDiffPlan(record, source);
  let text = source;
  for (const insertion of [...plan.insertions].sort((left, right) => right.offset - left.offset)) {
    text = `${text.slice(0, insertion.offset)}${insertion.text}${text.slice(insertion.offset)}`;
  }
  return { text, ...plan };
}

function sourceSnapshotMatches(preview, current) {
  const documentPresent = Boolean(current?.documentPresent);
  const filePresent = Boolean(current?.filePresent);
  if (preview?.sourceKind === "missing") return !documentPresent && !filePresent;
  const sourceText = String(preview?.sourceText || "");
  if (documentPresent && String(current?.documentText || "") !== sourceText) return false;
  return filePresent && String(current?.fileText || "") === sourceText;
}

module.exports = { buildPreviewEdit, buildInlineDiffDocument, buildInlineDiffPlan, changedLineIndices, changedOldRanges, diffLineOperations, locatePreviewForRemoval, sourceSnapshotMatches };
