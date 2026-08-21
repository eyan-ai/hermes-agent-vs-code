"use strict";

const path = require("path");
const { pathToFileURL } = require("url");

function textContent(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map(item => {
    if (typeof item === "string") return item;
    if (item && typeof item.text === "string") return item.text;
    if (item?.type === "text" && typeof item.content === "string") return item.content;
    return "";
  }).filter(Boolean).join("\n");
}

function userMessageText(value) {
  if (typeof value === "string") {
    const marker = value.search(/(?:^|\n)\[Attached file:/i);
    return (marker >= 0 ? value.slice(0, marker) : value).trim();
  }
  if (!Array.isArray(value)) return "";
  const parts = value.map(item => {
    if (typeof item === "string") return item;
    if (item && typeof item.text === "string") return item.text;
    if (item?.type === "text" && typeof item.content === "string") return item.content;
    return "";
  }).filter(text => text && !/^\[Attached file:/i.test(text.trim()));
  return parts[0] || "";
}

function remoteSessionId(session) {
  return String(session?.sessionId || session?.session_id || session?.id || "").trim();
}

function remoteUpdatedAt(session) {
  const value = session?.updatedAt || session?.updated_at || session?.startedAt || session?.started_at;
  const parsed = typeof value === "number" ? value * (value < 1e12 ? 1000 : 1) : Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function isUnsupportedHermesSessionMethod(error) {
  const message = String(error?.message || error || "");
  return /(?:-32601|method not found|unknown method|not implemented)/i.test(message);
}

function hermesMessageVersion(session) {
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  return {
    count: messages.length,
    lastMessageId: messages[messages.length - 1]?.id,
    signature: JSON.stringify(messages.map(message => ({
      id: message?.id,
      role: message?.role,
      text: message?.text,
      status: message?.status,
      finishedAt: message?.finishedAt,
      thinking: message?.thinking
    })))
  };
}

function canApplyHermesSnapshotMessages(session, version, turnActive = false) {
  if (turnActive) return false;
  const current = hermesMessageVersion(session);
  return current.count === version?.count
    && current.lastMessageId === version?.lastMessageId
    && current.signature === version?.signature;
}

function mergeHermesSessions(localSessions, remoteSessions, { createId, excludedHermesIds } = {}) {
  const locals = Array.isArray(localSessions) ? localSessions : [];
  const remotes = Array.isArray(remoteSessions) ? remoteSessions : [];
  const excluded = excludedHermesIds instanceof Set
    ? excludedHermesIds
    : new Set(Array.isArray(excludedHermesIds) ? excludedHermesIds : []);
  const byHermesId = new Map();
  for (const session of locals) {
    const hermesId = String(session?.acpSessionId || "").trim();
    if (hermesId) byHermesId.set(hermesId, session);
  }

  const merged = [];
  const seenLocalIds = new Set();
  for (const remote of remotes) {
    const hermesId = remoteSessionId(remote);
    if (!hermesId || excluded.has(hermesId)) continue;
    const existing = byHermesId.get(hermesId);
    const remoteTitle = String(remote.title || "").trim() || "Untitled";
    const preserveLocalTitle = existing?.titleOrigin === "manual" || existing?.localTitleOverride;
    const title = preserveLocalTitle
      ? String(existing.title || "").trim() || remoteTitle
      : remoteTitle;
    const session = existing ? { ...existing } : {
      id: createId ? createId(hermesId) : hermesId,
      createdAt: remoteUpdatedAt(remote),
      messages: [],
      settings: {}
    };
    session.acpSessionId = hermesId;
    session.title = title;
    session.titleOrigin = preserveLocalTitle ? "manual" : "automatic";
    session.hermesBacked = true;
    session.updatedAt = remoteUpdatedAt(remote);
    merged.push(session);
    if (existing) seenLocalIds.add(existing.id);
  }

  for (const local of locals) {
    if (!seenLocalIds.has(local.id)) merged.push({ ...local, hermesBacked: false });
  }
  return merged.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

function toolNameAndArgs(toolCall) {
  const fn = toolCall?.function && typeof toolCall.function === "object" ? toolCall.function : {};
  let args = fn.arguments || toolCall?.arguments || toolCall?.args || {};
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch { args = { raw: args }; }
  }
  return {
    id: String(toolCall?.id || toolCall?.call_id || toolCall?.tool_call_id || ""),
    name: String(fn.name || toolCall?.name || "Tool"),
    args: args && typeof args === "object" ? args : {}
  };
}

function projectHermesSnapshot(snapshot, { createId } = {}) {
  const makeId = createId || (() => `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const projected = [];
  const tools = new Map();
  let lastAssistant;
  for (const message of Array.isArray(snapshot?.messages) ? snapshot.messages : []) {
    const role = String(message?.role || "");
    if (role === "user") {
      projected.push({ id: makeId(), role: "user", text: userMessageText(message.content), createdAt: Date.now() });
      lastAssistant = undefined;
      continue;
    }
    if (role === "assistant") {
      const assistant = {
        id: makeId(),
        role: "assistant",
        text: textContent(message.content),
        status: "done",
        thinking: [],
        startedAt: Date.now(),
        finishedAt: Date.now()
      };
      const reasoning = textContent(message.reasoning_content || message.reasoning);
      if (reasoning) assistant.thinking.push({ kind: "thinking", title: "Thinking", text: reasoning, status: "done", done: true });
      for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
        const tool = toolNameAndArgs(call);
        const step = { kind: "tool", title: tool.name, summary: tool.name, code: JSON.stringify(tool.args, null, 2), result: "", status: "done", done: true };
        assistant.thinking.push(step);
        if (tool.id) tools.set(tool.id, step);
      }
      projected.push(assistant);
      lastAssistant = assistant;
      continue;
    }
    if (role === "tool") {
      const toolId = String(message.tool_call_id || message.toolCallId || "");
      const step = tools.get(toolId);
      if (step) step.result = textContent(message.content);
      else if (lastAssistant) lastAssistant.thinking.push({ kind: "tool", title: String(message.tool_name || "Tool"), result: textContent(message.content), status: "done", done: true });
    }
  }
  return {
    title: String(snapshot?.title || "").trim() || "Untitled",
    messages: projected
  };
}

function resourceUri(item) {
  const explicit = String(item?.uri || "").trim();
  if (explicit) return explicit;
  const filePath = String(item?.path || "").trim();
  return filePath ? pathToFileURL(path.resolve(filePath)).toString() : "";
}

function embeddedTextResource(uri, text) {
  return {
    type: "resource",
    resource: { uri, mimeType: "text/plain", text: String(text || "") }
  };
}

function buildHermesPromptBlocks(prompt, userMessage = {}) {
  const blocks = [];
  const userText = String(prompt || "").trim();
  if (userText) blocks.push({ type: "text", text: userText });

  if (userMessage.skill) {
    blocks.push(embeddedTextResource("hermes-context://skill", `Requested skill: ${userMessage.skill}`));
  }
  for (const attachment of userMessage.attachments || []) {
    const uri = resourceUri(attachment);
    if (!uri) continue;
    blocks.push({
      type: "resource_link",
      name: String(attachment.name || path.basename(String(attachment.path || uri)) || "attachment"),
      uri,
      mimeType: attachment.mimeType || undefined,
      description: attachment.type ? `Hermes ${attachment.type} context` : undefined
    });
  }
  if (userMessage.editorContext) {
    const context = userMessage.editorContext;
    const uri = resourceUri(context) || "hermes-context://editor";
    if (context.text) blocks.push(embeddedTextResource(uri, context.text));
    else if (uri && uri !== "hermes-context://editor") {
      blocks.push({ type: "resource_link", name: String(context.name || path.basename(context.path || uri)), uri });
    }
  }
  return blocks;
}

module.exports = {
  buildHermesPromptBlocks,
  canApplyHermesSnapshotMessages,
  hermesMessageVersion,
  isUnsupportedHermesSessionMethod,
  mergeHermesSessions,
  projectHermesSnapshot,
  remoteSessionId
};
