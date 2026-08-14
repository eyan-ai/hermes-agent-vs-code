/**
 * Normalize Hermes ACP updates, then route them into independent Working and
 * answer stores. Ambiguous assistant text stays pending until a later event
 * proves whether it is process narration or the user-facing answer.
 */
"use strict";

const { textOf } = require("./acp-text");
const { changedLineIndices } = require("./diff-preview");

const EMPTY_ANSWER_FALLBACK = "Hermes completed the work but did not return a final response.";
const FAILED_ANSWER_FALLBACK = "Hermes could not complete the request.";
const SILENT_ANSWERS = new Set(["[SILENT]", "SILENT", "NO_REPLY", "NO REPLY"]);

function changedDiffLines(oldText, newText) {
  const splitLines = value => {
    const text = String(value || "");
    if (!text) return [];
    const lines = text.split("\n");
    if (text.endsWith("\n")) lines.pop();
    return lines;
  };
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const changed = changedLineIndices(oldText, newText);
  return {
    oldLines: changed.old.map(index => oldLines[index]),
    newLines: changed.new.map(index => newLines[index])
  };
}

const ACTION_LABELS = {
  terminal: "Run command",
  bash: "Run command",
  shell: "Run command",
  python: "Run command",
  running: "Run command",
  read: "Read",
  read_file: "Read",
  reading: "Read",
  search: "Search",
  search_files: "Search",
  web_search: "Search",
  searching: "Search",
  edit: "Edit",
  patch: "Edit",
  editing: "Edit",
  write: "Write",
  write_file: "Write",
  writing: "Write",
  execute: "Run command",
  execute_code: "Run command",
  executing: "Run command",
  open: "Open",
  browser_navigate: "Open",
  opening: "Open",
  create: "Create",
  creating: "Create",
  update: "Update",
  memory: "Update",
  todo: "Update",
  updating: "Update",
  delete: "Delete",
  deleting: "Delete",
  fetch: "Fetch",
  fetching: "Fetch",
  browser: "Browse",
  browsing: "Browse",
  install: "Install",
  installing: "Install",
  build: "Build",
  building: "Build",
  test: "Test",
  testing: "Test",
  analyze: "Analyze",
  analyzing: "Analyze",
  skill_view: "Load"
};

function normalizeActionLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Tool";
  const mapped = ACTION_LABELS[raw.toLowerCase()];
  if (mapped) return mapped;
  const normalized = raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function searchDescription(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || /(?:^|[\\/])[^\\/]+\.[a-z0-9]{1,12}(?::\d+(?::\d+)?)?$/i.test(raw)) return raw;
  if (/^[\p{L}\p{N}\s.,'"!?():_-]+$/u.test(raw) && !/[\\^$*+?{}[\]|]/.test(raw)) return raw;
  return "matching content";
}

function isApprovalDenial(value) {
  return /(?:edit\s+)?approval\s+(?:was\s+)?denied|denied\s+by\s+(?:the\s+)?ACP\s+client|file\s+was\s+not\s+modified/i.test(String(value || ""));
}

function naturalTitle(title) {
  if (!title) return { action: "Tool", description: "" };
  const raw = String(title).trim();
  const patch = raw.match(/^patch(?:\s*\([^)]*\))?:\s*(.*)$/i);
  if (patch) return { action: "Edit", description: patch[1] || "" };
  if (/^(?:python|execute_code|execute|terminal|bash|shell|running)(?::|\s|$)/i.test(raw)) {
    return { action: "Run command", description: "" };
  }
  const match = raw.match(/^([a-z_]+(?:\s+[a-z_]+)?):\s*(.*)$/i);
  if (!match) return { action: normalizeActionLabel(title), description: "" };
  const verb = match[1].toLowerCase().replace(/\s+/g, "_");
  const rest = match[2] || "";
  const descriptions = {
    search: searchDescription(rest),
    search_files: searchDescription(rest),
    web_search: searchDescription(rest),
    execute_code: "",
    memory: "memory",
    todo: "plan"
  };
  return {
    action: normalizeActionLabel(verb),
    description: Object.prototype.hasOwnProperty.call(descriptions, verb) ? descriptions[verb] : rest
  };
}

function isExecutionAction(title) {
  return /^(?:python|execute_code|execute|terminal|bash|shell|running)(?::|\s|$)/i.test(String(title || "").trim());
}

function executionDetail(title, content) {
  const value = String(content || "").trim();
  if (!value) return "";
  if (/^(?:python|execute_code)(?::|\s|$)/i.test(String(title || "").trim())) {
    const fenced = value.match(/```(?:python)?\s*\n([\s\S]*?)\n```/i);
    return (fenced ? fenced[1] : value.replace(/^Running Python helper script:\s*/i, "")).trim();
  }
  return value.replace(/^\$\s?/, "").trim();
}

function normalizeHermesEvent(rawEvent, turnId = "") {
  if (!rawEvent || typeof rawEvent !== "object") return null;
  if (rawEvent.type && rawEvent.type.startsWith("turn.")) return rawEvent;

  const rawType = rawEvent.sessionUpdate;
  switch (rawType) {
    case "agent_thought_chunk":
      return {
        type: "thinking.delta",
        turnId,
        streamId: rawEvent.streamId || "thinking",
        content: textOf(rawEvent.content)
      };
    case "tool_call": {
      const actionId = rawEvent.toolCallId || rawEvent.tool_call_id;
      if (actionId === undefined) return null;
      return {
        type: "action.started",
        turnId,
        actionId,
        actionType: rawEvent.title || String(actionId),
        content: textOf(rawEvent.content),
        raw: rawEvent
      };
    }
    case "tool_call_update": {
      const actionId = rawEvent.toolCallId || rawEvent.tool_call_id;
      if (actionId === undefined) return null;
      const status = rawEvent.status || "completed";
      const content = textOf(rawEvent.content);
      const approvalDenied = isApprovalDenial(content);
      const failed = approvalDenied || ["failed", "cancelled", "denied", "rejected"].includes(String(status).toLowerCase());
      return {
        type: failed ? "action.failed" : status === "completed" ? "action.completed" : "action.progress",
        turnId,
        actionId,
        status,
        content,
        approvalDenied,
        raw: rawEvent
      };
    }
    case "agent_message_chunk":
      return {
        type: "assistant_text.delta",
        turnId,
        streamId: rawEvent.streamId || "assistant",
        content: textOf(rawEvent.content)
      };
    case "plan":
    case "agent_plan_update":
      return { type: "plan.updated", turnId, raw: rawEvent };
    default:
      return null;
  }
}

function isValidAnswer(text) {
  const value = String(text || "").trim();
  return Boolean(value) && !SILENT_ANSWERS.has(value.toUpperCase());
}

function streamDebug(rawEvent, event, target, extra = "") {
  if (process.env.HERMES_AGENT_DEBUG_STREAMS !== "1") return;
  const rawType = rawEvent && (rawEvent.sessionUpdate || rawEvent.type) || "unknown";
  const content = event && event.content ? String(event.content).replace(/\s+/g, " ").slice(0, 80) : "";
  const eventId = event && (event.streamId || event.actionId) || "";
  console.debug(`[Hermes stream] raw=${rawType} normalized=${event ? event.type : "ignored"} target=${target} turnId=${event && event.turnId || ""} id=${eventId} preview=${JSON.stringify(content)}${extra ? ` ${extra}` : ""}`);
}

function createAcpRenderer({ assistantMessage, post, session }) {
  const toolIndex = new Map();
  const openActionIds = new Set();
  const state = {
    workingItems: assistantMessage.thinking,
    answerBlocks: assistantMessage.text ? [{ type: "markdown", streamId: "existing", content: assistantMessage.text }] : [],
    pendingText: "",
    pendingTextStreamId: undefined,
    phase: "idle",
    hasToolActivity: false,
    hasExplicitFinalEvent: false,
    finalizationAttempted: false,
    finalAnswerOnly: false,
    ignoredAssistantText: undefined
  };

  function pushThinking(message = assistantMessage) {
    post({
      type: "thinkingUpdate",
      sessionId: session.id,
      messageId: message.id,
      thinking: (message.thinking || []).map(step => ({ ...step }))
    });
  }

  function pushPlan(message = assistantMessage) {
    post({
      type: "planUpdate",
      sessionId: session.id,
      messageId: message.id,
      plan: (message.plan || []).map(item => ({ ...item }))
    });
  }

  function pushAnswer(chunk) {
    post({ type: "assistantChunk", sessionId: session.id, messageId: assistantMessage.id, chunk });
  }

  function clearPendingText() {
    state.pendingText = "";
    state.pendingTextStreamId = undefined;
  }

  function appendPendingText(event) {
    if (state.pendingText && state.pendingTextStreamId !== event.streamId) flushPendingTextToWorking();
    state.pendingTextStreamId = event.streamId;
    state.pendingText += event.content;
  }

  function flushPendingTextToWorking() {
    const content = state.pendingText.trim();
    const streamId = state.pendingTextStreamId;
    clearPendingText();
    if (!content) return false;
    const clean = content.replace(/^#{1,3}\s/gm, "");
    const last = state.workingItems[state.workingItems.length - 1];
    if (last && last.kind === "note" && last.streamId === streamId) last.text += clean;
    else state.workingItems.push({ kind: "note", title: "Working", text: clean, streamId, finalized: true });
    return true;
  }

  function appendAnswer(content, streamId) {
    if (!content) return;
    const last = state.answerBlocks[state.answerBlocks.length - 1];
    if (last && last.streamId === streamId) last.content += content;
    else state.answerBlocks.push({ type: "markdown", streamId, content });
    assistantMessage.text += content;
    pushAnswer(content);
  }

  function flushPendingTextToAnswer() {
    const content = state.pendingText;
    const streamId = state.pendingTextStreamId || "assistant";
    clearPendingText();
    if (!content.trim()) return false;
    appendAnswer(content, streamId);
    return true;
  }

  function appendThinking(event) {
    let step = state.workingItems[state.workingItems.length - 1];
    if (!step || step.kind !== "thinking" || step.finalized || step.streamId !== event.streamId) {
      step = { kind: "thinking", title: "Thinking", text: "", streamId: event.streamId, finalized: false, startedAt: Date.now() };
      state.workingItems.push(step);
    }
    step.text += event.content;
  }

  function appendAction(event) {
    const existing = toolIndex.get(event.actionId);
    if (existing?.step) return existing.message;
    const nat = naturalTitle(event.actionType);
    const execution = isExecutionAction(event.actionType);
    const step = {
      kind: "tool",
      title: event.actionType,
      toolCallId: event.actionId,
      status: "running",
      action: nat.action,
      description: nat.description,
      summary: nat.description ? `${nat.action} ${nat.description}` : nat.action,
      execution,
      code: execution ? executionDetail(event.actionType, event.content) : "",
      detail: execution ? "" : event.content || "",
      result: "",
      done: false
    };
    state.workingItems.push(step);
    toolIndex.set(event.actionId, { step, message: assistantMessage });
    openActionIds.add(event.actionId);
    return assistantMessage;
  }

  function updateAction(event) {
    const entry = toolIndex.get(event.actionId);
    if (!entry?.step) return undefined;
    const step = entry.step;
    step.status = event.status;
    step.done = event.type === "action.completed" || event.type === "action.failed";
    step.error = event.type === "action.failed";
    delete step.inferredTerminal;
    const raw = event.raw || {};
    if (Array.isArray(raw.content)) {
      const diffBlock = raw.content.find(block => block && (block.type === "diff" || block.diff));
      if (diffBlock) {
        const oldText = diffBlock.oldText || diffBlock.old_text || "";
        const newText = diffBlock.newText || diffBlock.new_text || "";
        step.diff = {
          path: diffBlock.path || diffBlock.file || "",
          oldText,
          newText,
          ...changedDiffLines(oldText, newText)
        };
      }
    }
    if (event.content && !event.approvalDenied) step.result = event.content;
    if (raw.rawOutput) step.rawOutput = typeof raw.rawOutput === "string" ? raw.rawOutput : JSON.stringify(raw.rawOutput);
    if (step.done) openActionIds.delete(event.actionId);
    return entry.message;
  }

  function updatePlan(raw) {
    const nativeEntries = Array.isArray(raw.entries);
    const items = nativeEntries ? raw.entries : (raw.items || raw.plan || []);
    if (!Array.isArray(items)) return;
    const todos = items.map(item => ({
      status: item.status || "pending",
      content: item.description || item.content || ""
    })).filter(item => item.content.length > 1);
    if (nativeEntries) {
      assistantMessage.plan = todos;
      return;
    }
    if (!todos.length) return;
    const existing = assistantMessage.plan || [];
    for (const todo of todos) {
      const index = existing.findIndex(item => item.content === todo.content);
      if (index >= 0) existing[index] = todo;
      else existing.push(todo);
    }
    assistantMessage.plan = existing;
  }

  function finishSteps() {
    const now = Date.now();
    for (const step of state.workingItems) {
      if (step.kind === "thinking" && !step.finalized) {
        step.finalized = true;
        step.durationMs = now - (step.startedAt || now);
      }
    }
    return now;
  }

  function finishActions(outcome) {
    const owners = new Set();
    for (const actionId of [...openActionIds]) {
      const entry = toolIndex.get(actionId);
      const step = entry?.step;
      if (!step || step.done) {
        openActionIds.delete(actionId);
        continue;
      }
      step.done = true;
      step.inferredTerminal = true;
      if (outcome === "completed") {
        step.status = "completed";
        step.error = false;
      } else {
        step.status = outcome;
        step.error = true;
      }
      if (entry.message) owners.add(entry.message);
      openActionIds.delete(actionId);
    }
    for (const owner of owners) pushThinking(owner);
  }

  function completeTurn() {
    const candidate = `${assistantMessage.text}${state.pendingText}`;
    if (isValidAnswer(candidate)) {
      flushPendingTextToAnswer();
    } else {
      clearPendingText();
      if (!isValidAnswer(assistantMessage.text)) {
        assistantMessage.text = "";
        state.answerBlocks = [];
      }
    }
    if (isValidAnswer(assistantMessage.text)) {
      finishActions("completed");
      assistantMessage.status = "done";
      assistantMessage.finishedAt = finishSteps();
      state.phase = "completed";
      pushThinking();
      return { needsFinalAnswer: false };
    }
    if (!state.finalizationAttempted) {
      state.finalizationAttempted = true;
      return { needsFinalAnswer: true };
    }
    appendAnswer(EMPTY_ANSWER_FALLBACK, "fallback");
    finishActions("completed");
    assistantMessage.status = "done";
    assistantMessage.finishedAt = finishSteps();
    state.phase = "completed";
    pushThinking();
    return { needsFinalAnswer: false };
  }

  function failTurn() {
    clearPendingText();
    if (!isValidAnswer(assistantMessage.text)) {
      assistantMessage.text = "";
      state.answerBlocks = [];
      appendAnswer(FAILED_ANSWER_FALLBACK, "failure");
    }
    finishActions("failed");
    assistantMessage.status = "failed";
    assistantMessage.finishedAt = finishSteps();
    state.phase = "completed";
    pushThinking();
    return { needsFinalAnswer: false };
  }

  function cancelTurn() {
    clearPendingText();
    finishActions("cancelled");
    assistantMessage.status = "stopped";
    assistantMessage.finishedAt = finishSteps();
    state.phase = "completed";
    pushThinking();
    return { needsFinalAnswer: false };
  }

  function handleEvent(event, rawEvent = event) {
    if (!event) {
      streamDebug(rawEvent, null, "ignored");
      return undefined;
    }
    if (state.phase === "completed") {
      streamDebug(rawEvent, event, "ignored", "turnAlreadyCompleted=true");
      return undefined;
    }
    if (state.finalAnswerOnly && [
      "thinking.delta",
      "action.started",
      "action.progress",
      "action.completed",
      "action.failed",
      "plan.updated"
    ].includes(event.type)) {
      streamDebug(rawEvent, event, "ignored", "finalAnswerOnly=true");
      return undefined;
    }
    switch (event.type) {
      case "thinking.delta":
        flushPendingTextToWorking();
        // A new reasoning phase means control has left the preceding Action.
        // Hermes ACP versions may omit the Action's terminal update, so this
        // phase boundary is authoritative for any still-open Action.
        finishActions("completed");
        appendThinking(event);
        state.phase = "thinking";
        pushThinking();
        streamDebug(rawEvent, event, "working");
        return undefined;
      case "action.started":
        flushPendingTextToWorking();
        // Hermes executes Actions sequentially. Some ACP versions omit a
        // terminal update, so the next Action is the reliable boundary for
        // the previous one. Keep its index so a late explicit update can
        // still replace this inferred success.
        finishActions("completed");
        appendAction(event);
        state.phase = "acting";
        state.hasToolActivity = true;
        pushThinking();
        streamDebug(rawEvent, event, "working");
        return undefined;
      case "action.progress":
      case "action.completed":
      case "action.failed":
        flushPendingTextToWorking();
        {
          const ownerMessage = updateAction(event);
          if (ownerMessage) pushThinking(ownerMessage);
        }
        state.phase = "acting";
        state.hasToolActivity = true;
        streamDebug(rawEvent, event, "working");
        return undefined;
      case "assistant_text.delta":
        if (state.ignoredAssistantText && state.ignoredAssistantText.test(String(event.content || ""))) {
          state.ignoredAssistantText = undefined;
          streamDebug(rawEvent, event, "ignored", "controlAcknowledgement=true");
          return undefined;
        }
        if (state.hasExplicitFinalEvent || state.finalAnswerOnly) {
          appendAnswer(event.content, event.streamId);
          state.phase = "answering";
          streamDebug(rawEvent, event, "answer");
        } else {
          appendPendingText(event);
          state.phase = "pending_text";
          streamDebug(rawEvent, event, "pending");
        }
        return undefined;
      case "final_answer.delta":
        flushPendingTextToAnswer();
        appendAnswer(event.content, event.streamId);
        state.hasExplicitFinalEvent = true;
        state.phase = "answering";
        streamDebug(rawEvent, event, "answer");
        return undefined;
      case "plan.updated":
        flushPendingTextToWorking();
        updatePlan(event.raw || {});
        pushThinking();
        pushPlan();
        streamDebug(rawEvent, event, "working");
        return undefined;
      case "turn.completed":
        streamDebug(rawEvent, event, "answer", "pendingFlushedTo=answer");
        return completeTurn();
      case "turn.failed":
        streamDebug(rawEvent, event, "answer");
        return failTurn();
      case "turn.cancelled":
        streamDebug(rawEvent, event, "ignored");
        return cancelTurn();
      default:
        streamDebug(rawEvent, event, "ignored");
        return undefined;
    }
  }

  function onSessionUpdate(update) {
    return handleEvent(normalizeHermesEvent(update, session.id), update);
  }

  function finalize(status = "done") {
    const type = status === "done" ? "turn.completed" : status === "stopped" ? "turn.cancelled" : "turn.failed";
    return handleEvent({ type, turnId: session.id }, { type });
  }

  function beginFinalAnswerOnly() {
    clearPendingText();
    state.finalAnswerOnly = true;
    state.hasExplicitFinalEvent = true;
    state.phase = "answering";
  }

  function ignoreNextAssistantText(pattern) {
    state.ignoredAssistantText = pattern instanceof RegExp ? pattern : new RegExp(String(pattern || ""));
  }

  function continueWith(nextAssistantMessage) {
    flushPendingTextToWorking();
    assistantMessage.status = "continued";
    assistantMessage.finishedAt = finishSteps();
    pushThinking();

    assistantMessage = nextAssistantMessage;
    state.workingItems = assistantMessage.thinking;
    state.answerBlocks = assistantMessage.text
      ? [{ type: "markdown", streamId: "existing", content: assistantMessage.text }]
      : [];
    state.pendingText = "";
    state.pendingTextStreamId = undefined;
    state.phase = "idle";
    state.hasToolActivity = false;
    state.hasExplicitFinalEvent = false;
    state.finalizationAttempted = false;
    state.finalAnswerOnly = false;
    state.ignoredAssistantText = undefined;
  }

  return { onSessionUpdate, handleEvent, finalize, beginFinalAnswerOnly, continueWith, ignoreNextAssistantText };
}

module.exports = { ACTION_LABELS, createAcpRenderer, naturalTitle, normalizeHermesEvent };
