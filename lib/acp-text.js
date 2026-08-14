/**
 * acp-text.js — Content-block helpers for ACP payloads.
 *
 * ACP content blocks are arrays of typed blocks:
 *   {type: "text", text: "..."}
 *   {type: "diff", path: "...", oldText: "...", newText: "..."}
 *   {type: "image", ...}
 * Extract plain text for display, tolerating both camelCase and snake_case
 * (the wire uses camelCase; be defensive).
 */
"use strict";

/** Extract a displayable text string from an ACP content block / array / string. */
function textOf(content) {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(block => textOf(block))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object") {
    const block = content;
    if (typeof block.text === "string") return block.text;
    if (typeof block.content === "string") return block.content;
    // Nested content block: {type:"content", content:{type:"text", text:"…"}}
    if (block.content !== null && typeof block.content === "object") {
      const inner = textOf(block.content);
      if (inner) return inner;
    }
    if (typeof block.path === "string") {
      const oldText = typeof block.oldText === "string" ? block.oldText : "";
      const newText = typeof block.newText === "string" ? block.newText : "";
      if (oldText || newText) return `diff ${block.path}\n${oldText}→${newText}`;
      return block.path;
    }
    try {
      return JSON.stringify(content);
    } catch {
      return "";
    }
  }
  return String(content);
}

/** Extract the primary location (file path) from ACP locations, if any. */
function pathOf(locations) {
  if (!Array.isArray(locations)) return "";
  for (const loc of locations) {
    if (loc && typeof loc.path === "string") return loc.path;
  }
  return "";
}

module.exports = { textOf, pathOf };
