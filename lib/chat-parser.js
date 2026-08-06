function parseArgs(text) {
  try {
    return JSON.parse(String(text || "").trim()) || {};
  } catch {
    return {};
  }
}

function summarizeTool(tool) {
  const args = parseArgs(tool.args);
  const first = value => {
    if (value === undefined || value === null) return "";
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  };
  // Code-like payloads (shell commands, scripts, patch bodies) render in a
  // code box instead of raw JSON.
  const code = String(args.command || args.code || args.script || args.patch || args.text || "").trim();
  tool.code = code.slice(0, 600);
  const templates = {
    read_file: p => `Reading ${first(p.path || p.file || p.name) || "a file"}`,
    search_files: p => `Searching for ${first(p.pattern) || "files"}`,
    write_file: p => `Writing ${first(p.path) || "a file"}`,
    patch: p => `Patching ${first(p.path) || "a file"}`,
    terminal: p => `Running \`${first(p.command) || "a command"}\``,
    execute_code: p => `Executing code${p.language ? ` (${p.language})` : ""}`,
    web_search: p => `Searching the web: ${first(p.query) || ""}`,
    browser_navigate: p => `Opening ${first(p.url) || "a page"}`,
    skill_view: p => `Loading skill ${first(p.name) || ""}`,
    memory: p => "Updating long-term memory"
  };
  const fn = templates[tool.name];
  if (fn) return fn(args);
  return `Called ${tool.name}`;
}

/**
 * Stream parser for `hermes chat -q ... -v` output.
 *
 * Box layout produced by the CLI:
 *   ┌─ Reasoning ─┐   thinking block
 *   └─────────────┘
 *   📞 Tool N: name()   tool call (+ Args: block)
 *   ╭─ ⚕ Hermes ─╮     final answer
 *   ╰─────────────╯
 *
 * Reasoning blocks become thinking steps (natural language only), tool
 * calls become action steps with a natural-language summary, tool
 * outcomes (`✅ Tool N completed`, `Result: ...`) attach to the last tool
 * step instead of polluting the thinking text, and the Hermes block
 * streams as the answer. Anything unparsed (e.g. plain `--oneshot`
 * output) falls back into the answer stream.
 */
function createChatParser(handlers) {
  const { onThinkingEnd, onTool, onToolUpdate, onAnswerLine } = handlers;
  let buffer = "";
  let mode = null; // "reasoning" | "answer"
  let reasoningLines = [];
  let tool = null; // tool being assembled
  let lastTool = null; // last tool emitted (for result updates)
  let collectingArgs = false;
  const fallback = [];
  const clean = line => line.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
  const reasoningContent = line => line.replace(/^[│┊]\s*/, "").replace(/[│┊─\u2500\s]+$/, "").trim();
  const answerContent = line => line.replace(/^ {1,4}/, "").replace(/[│─\u2500\s]+$/, "").trimEnd();
  const isNoise = line =>
    /^(Query:|Initializing|─{4,}|🤖|🔗|🔑|✅|🛠️|⚠️|📊|💬|🎉|Resume|Session:|Duration:|Messages:|┌|└|╭|╰|$)/.test(line);

  function emitTool() {
    if (!tool) return;
    tool.args = tool.args.replace(/^Args:\s*/, "").trim();
    tool.summary = summarizeTool(tool);
    tool.status = "pending";
    onTool(tool);
    lastTool = tool;
    tool = null;
    collectingArgs = false;
  }

  function endReasoning() {
    if (mode !== "reasoning") return;
    const text = reasoningLines.join("\n");
    reasoningLines = [];
    mode = null;
    if (text.trim()) onThinkingEnd(text.trim());
  }

  function handleLine(raw) {
    const line = clean(raw);
    if (!line) return;
    // Box starts / ends drive the state machine.
    if (line.includes("┌─ Reasoning")) {
      endReasoning();
      emitTool(); // assembled tool call surfaces before its result arrives
      mode = "reasoning";
      reasoningLines = [];
      return;
    }
    if (line.includes("╭─") && line.includes("Hermes")) {
      endReasoning();
      mode = "answer";
      return;
    }
    if (mode === "reasoning") {
      if (line.includes("└")) {
        endReasoning();
        return;
      }
      const content = reasoningContent(line);
      if (!content || content === ".") return;
      // Tool outcome lines belong to the tool step, not the thinking text.
      if (/^✅ Tool \d+ completed/.test(content)) {
        if (lastTool) {
          lastTool.done = true;
          lastTool.status = "success";
          onToolUpdate({ ...lastTool });
        }
        return;
      }
      if (/^❌|failed|error/i.test(content) && lastTool) {
        lastTool.status = "error";
        onToolUpdate({ ...lastTool });
        return;
      }
      const resultMatch = content.match(/^Result:\s*([\s\S]*)/);
      if (resultMatch) {
        if (lastTool) {
          lastTool.result = (lastTool.result ? `${lastTool.result}\n` : "") + resultMatch[1];
          onToolUpdate({ ...lastTool });
        }
        return;
      }
      reasoningLines.push(content);
      return;
    }
    if (mode === "answer") {
      if (line.includes("╰")) {
        mode = null;
        return;
      }
      const content = answerContent(line);
      if (content) onAnswerLine(content);
      return;
    }
    // Outside blocks: tool calls, then generic fallback lines.
    const toolMatch = line.match(/Tool \d+:\s*(\w+)\(/);
    if (toolMatch) {
      emitTool();
      tool = { name: toolMatch[1], args: "", result: "", done: false };
      collectingArgs = true;
      return;
    }
    if (collectingArgs && tool) {
      const stripped = line.replace(/^Args:\s*/, "").trimStart();
      if (stripped) tool.args += `${stripped}\n`;
      if (line.trimEnd().endsWith("}")) collectingArgs = false;
      return;
    }
    if (line.trimStart().startsWith("┊")) return; // live tool progress lines
    if (!isNoise(line)) fallback.push(line);
  }

  function onChunk(chunk) {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      handleLine(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
  }

  return {
    onChunk,
    flush() {
      handleLine(buffer);
      buffer = "";
      endReasoning();
      emitTool();
      // Unparsed output (e.g. plain `--oneshot`) streams into the answer.
      for (const line of fallback) onAnswerLine(line);
      fallback.length = 0;
    }
  };
}

module.exports = { createChatParser };
