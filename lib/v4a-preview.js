"use strict";

function normalizePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/");
}

function splitPatchLines(patch) {
  return String(patch || "").split(/\r?\n/);
}

function parseSingleUpdate(patch) {
  const lines = splitPatchLines(patch);
  const nonempty = lines.map(line => line.trim()).filter(Boolean);
  if (nonempty[0] !== "*** Begin Patch" || nonempty[nonempty.length - 1] !== "*** End Patch") {
    return { kind: "invalid", reason: "incomplete V4A patch boundaries" };
  }

  const operations = [];
  for (const line of lines) {
    const match = line.match(/^\*\*\*\s*(Update|Add|Delete|Move)\s+File:\s*(.+)$/);
    if (match) operations.push({ type: match[1].toLowerCase(), path: match[2].trim() });
  }
  if (operations.length !== 1 || operations[0].type !== "update") {
    return { kind: "not-applicable" };
  }

  const headerIndex = lines.findIndex(line => /^\*\*\*\s*Update\s+File:/.test(line));
  const endIndex = lines.findIndex((line, index) => index > headerIndex && line.trim() === "*** End Patch");
  if (headerIndex < 0 || endIndex < 0) {
    return { kind: "invalid", reason: "missing V4A update body" };
  }

  const hunks = [];
  let current;
  const pushCurrent = () => {
    if (current && current.lines.length) hunks.push(current);
  };
  for (let index = headerIndex + 1; index < endIndex; index += 1) {
    const line = lines[index];
    if (line.startsWith("@@")) {
      pushCurrent();
      const hintMatch = line.match(/^@@\s*(.*?)\s*@@$/);
      const hint = hintMatch ? hintMatch[1].trim() : "";
      current = { hint, lines: [] };
      continue;
    }
    if (!line) continue;
    if (!current) current = { hint: "", lines: [] };
    const prefix = line[0];
    if (prefix === "+" || prefix === "-" || prefix === " ") {
      current.lines.push({ prefix, text: line.slice(1) });
      continue;
    }
    if (prefix === "\\") continue;
    return { kind: "invalid", reason: "unsupported V4A hunk line" };
  }
  pushCurrent();
  if (!hunks.length) return { kind: "invalid", reason: "V4A update has no hunks" };
  return { kind: "ready", path: operations[0].path, hunks };
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= text.length - needle.length) {
    const found = text.indexOf(needle, offset);
    if (found < 0) break;
    count += 1;
    offset = found + 1;
  }
  return count;
}

function sourceEol(source) {
  const hasCrlf = source.includes("\r\n");
  const hasBareLf = source.replace(/\r\n/g, "").includes("\n");
  if (hasCrlf && hasBareLf) return null;
  return hasCrlf ? "\r\n" : "\n";
}

function appendLines(source, lines, eol) {
  const content = lines.join(eol);
  const trimmed = source.endsWith(eol) ? source.slice(0, -eol.length) : source;
  return `${trimmed}${trimmed ? eol : ""}${content}${eol}`;
}

function applyUpdate(source, hunks) {
  const eol = sourceEol(source);
  if (!eol) return { kind: "invalid", reason: "mixed source line endings" };
  let candidate = source;
  let changed = false;

  for (const hunk of hunks) {
    const searchLines = [];
    const replacementLines = [];
    for (const line of hunk.lines) {
      if (line.prefix === " ") {
        searchLines.push(line.text);
        replacementLines.push(line.text);
      } else if (line.prefix === "-") {
        searchLines.push(line.text);
      } else if (line.prefix === "+") {
        replacementLines.push(line.text);
      }
    }

    if (searchLines.length) {
      if (searchLines.length === replacementLines.length
        && searchLines.every((line, index) => line === replacementLines[index])) continue;
      const search = searchLines.join(eol);
      if (countOccurrences(candidate, search) !== 1) {
        return { kind: "invalid", reason: "V4A hunk context is missing or ambiguous" };
      }
      candidate = candidate.replace(search, replacementLines.join(eol));
      changed = true;
      continue;
    }

    if (!replacementLines.length) continue;
    if (!hunk.hint) {
      candidate = appendLines(candidate, replacementLines, eol);
      changed = true;
      continue;
    }
    if (countOccurrences(candidate, hunk.hint) !== 1) {
      return { kind: "invalid", reason: "addition hunk hint is missing or ambiguous" };
    }
    const hintStart = candidate.indexOf(hunk.hint);
    const lineEnd = candidate.indexOf(eol, hintStart);
    if (lineEnd < 0) {
      candidate = `${candidate}${eol}${replacementLines.join(eol)}`;
    } else {
      const insertAt = lineEnd + eol.length;
      candidate = `${candidate.slice(0, insertAt)}${replacementLines.join(eol)}${eol}${candidate.slice(insertAt)}`;
    }
    changed = true;
  }

  return changed
    ? { kind: "ready", candidate }
    : { kind: "invalid", reason: "V4A update contains no changes" };
}

function projectV4aUpdatePreview(toolCall) {
  const rawInput = toolCall && toolCall.rawInput;
  const args = rawInput && rawInput.arguments;
  if (rawInput?.tool !== "patch" || args?.mode !== "patch" || typeof args.patch !== "string") {
    return { kind: "not-applicable" };
  }
  const diffs = Array.isArray(toolCall.content)
    ? toolCall.content.filter(block => block && block.type === "diff")
    : [];
  if (diffs.length !== 1) return { kind: "not-applicable" };
  const diff = diffs[0];
  const patch = args.patch;
  const projectedNewText = String(diff.newText ?? diff.new_text ?? "");
  if (projectedNewText !== patch) return { kind: "not-applicable" };

  const parsed = parseSingleUpdate(patch);
  if (parsed.kind !== "ready") return parsed;
  const diffPath = String(diff.path || diff.file || "");
  if (!diffPath || normalizePath(parsed.path) !== normalizePath(diffPath)) {
    return { kind: "invalid", reason: "V4A target path does not match Diff path" };
  }
  const oldText = String(diff.oldText ?? diff.old_text ?? "");
  const applied = applyUpdate(oldText, parsed.hunks);
  if (applied.kind !== "ready") return applied;
  return {
    kind: "ready",
    diff: { path: diffPath, oldText, newText: applied.candidate }
  };
}

module.exports = { projectV4aUpdatePreview };
