/**
 * acp-render.js — Maps ACP session updates to the extension's existing
 * UI message protocol (thinkingUpdate / assistantChunk), so the webview
 * frontend needs zero changes when switching from CLI-parser to ACP.
 *
 * ACP update types handled:
 *   agent_thought_chunk  → thinking step (kind: "thinking")
 *   tool_call (start)    → thinking step (kind: "tool", pending)
 *   tool_call (progress) → updates the matching tool step (by tool_call_id)
 *   agent_message_chunk  → assistantChunk (streaming answer)
 *   agent_plan_update    → todo list (best-effort, folded into thinking)
 */
"use strict";

const { textOf } = require("./acp-text");

/**
 * Naturalize a server-generated tool title ("terminal: npm test",
 * "read: /abs/foo.py") into an action phrase like the desktop UI:
 * "Bash npm test", "Reading /abs/foo.py". Falls back to the raw title.
 */
function naturalTitle(title) {
  if (!title) return "";
  const match = String(title).match(/^([a-z_]+):\s*(.*)$/);
  if (!match) return title;
  const verb = match[1];
  const rest = match[2] || "";
  const phrases = {
    terminal: `Bash ${rest}`,
    read: `Reading ${rest}`,
    read_file: `Reading ${rest}`,
    search: `Searching for ${rest}`,
    search_files: `Searching for ${rest}`,
    write: `Writing ${rest}`,
    write_file: `Writing ${rest}`,
    patch: `Patching ${rest}`,
    edit: `Editing ${rest}`,
    browser: `Opening ${rest}`,
    browser_navigate: `Opening ${rest}`,
    web_search: `Searching the web: ${rest}`,
    fetch: `Fetching ${rest}`,
    execute_code: `Executing code`,
    skill_view: `Loading skill ${rest}`,
    memory: `Updating memory`,
    todo: `Updating plan`
  };
  return phrases[verb] || title;
}

/**
 * Create a renderer bound to one assistant message.
 *
 * @param {object} opts
 * @param {object} opts.assistantMessage  mutable message being built
 * @param {Function} opts.post            (msg) => void, posts to webviews
 * @param {object} opts.session           session object (for sessionId)
 */
function createAcpRenderer({ assistantMessage, post, session }) {
  // tool_call_id → index into assistantMessage.thinking (tool steps only)
  const toolIndex = new Map();

  function pushThinking() {
    post({
      type: "thinkingUpdate",
      sessionId: session.id,
      messageId: assistantMessage.id,
      thinking: assistantMessage.thinking.map(step => ({ ...step }))
    });
  }

  function pushAnswer(chunk) {
    post({
      type: "assistantChunk",
      sessionId: session.id,
      messageId: assistantMessage.id,
      chunk
    });
  }

  /** Handle one `session/update` notification. */
  function onSessionUpdate(update) {
    const kind = update.sessionUpdate;
    switch (kind) {
      case "agent_thought_chunk": {
        const text = textOf(update.content);
        if (!text) return;
        // Merge consecutive thought chunks into one live thinking step.
        let step = assistantMessage.thinking[assistantMessage.thinking.length - 1];
        if (!step || step.kind !== "thinking" || step.finalized) {
          step = { kind: "thinking", title: "Thinking", text: "", finalized: false };
          assistantMessage.thinking.push(step);
        }
        step.text += text;
        pushThinking();
        break;
      }

      case "tool_call": {
        // ToolCallStart — new tool invocation.
        if (update.toolCallId === undefined && update.tool_call_id === undefined) break;
        const toolCallId = update.toolCallId || update.tool_call_id;
        const title = update.title || update.toolCallId || "tool";
        const step = {
          kind: "tool",
          title,
          toolCallId,
          status: "running",
          summary: naturalTitle(title),
          code: textOf(update.content) || "",
          result: "",
          done: false
        };
        assistantMessage.thinking.push(step);
        toolIndex.set(toolCallId, assistantMessage.thinking.length - 1);
        pushThinking();
        break;
      }

      case "tool_call_update": {
        // ToolCallProgress — completion / failure / status change.
        if (update.toolCallId === undefined && update.tool_call_id === undefined) break;
        const toolCallId = update.toolCallId || update.tool_call_id;
        const index = toolIndex.get(toolCallId);
        if (index === undefined || !assistantMessage.thinking[index]) break;
        const step = assistantMessage.thinking[index];
        const status = update.status || "completed";
        step.status = status;
        step.done = status === "completed";
        if (status === "failed") step.error = true;
        const content = textOf(update.content);
        if (content) step.result = content;
        if (update.rawOutput) {
          step.rawOutput = typeof update.rawOutput === "string" ? update.rawOutput : JSON.stringify(update.rawOutput);
        }
        pushThinking();
        break;
      }

      case "agent_message_chunk": {
        const text = textOf(update.content);
        if (!text) return;
        assistantMessage.text += text;
        pushAnswer(text);
        break;
      }

      case "agent_plan_update": {
        // Best-effort: surface as a summary line on the thinking list.
        const items = update.items || update.plan || [];
        if (!Array.isArray(items) || !items.length) break;
        const lines = items.map(item => `- ${item.status || "pending"}: ${item.description || item.content || ""}`).filter(l => l.length > 3);
        if (!lines.length) break;
        assistantMessage.thinking.push({
          kind: "plan",
          title: "Plan",
          text: lines.join("\n"),
          finalized: true
        });
        pushThinking();
        break;
      }

      default:
        // usage_update / session_info_update / available_commands_update — ignored.
        break;
    }
  }

  /** Finalize: close the open thinking step and mark the message done. */
  function finalize(status = "done") {
    for (const step of assistantMessage.thinking) {
      if (step.kind === "thinking" && !step.finalized) step.finalized = true;
    }
    assistantMessage.status = status;
    assistantMessage.finishedAt = Date.now();
    pushThinking();
  }

  return { onSessionUpdate, finalize };
}

module.exports = { createAcpRenderer };
