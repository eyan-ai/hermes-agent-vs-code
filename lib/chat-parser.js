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
 * Reasoning blocks become thinking steps, tool calls become tool steps,
 * the Hermes block streams as the answer, and anything unparsed (e.g.
 * plain `--oneshot` output) falls back into the answer stream.
 */
function createChatParser(handlers) {
  const { onThinkingEnd, onTool, onAnswerLine } = handlers;
  let buffer = "";
  let mode = null; // "reasoning" | "answer"
  let reasoningLines = [];
  let tool = null;
  let collectingArgs = false;
  const fallback = [];
  const clean = line => line.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
  const reasoningContent = line => line.replace(/^[│┊]\s*/, "").replace(/[│┊─\u2500\s]+$/, "").trim();
  const answerContent = line => line.replace(/^ {1,4}/, "").replace(/[│─\u2500\s]+$/, "").trimEnd();
  const isNoise = line =>
    /^(Query:|Initializing|─{4,}|🤖|🔗|🔑|✅|🛠️|⚠️|📊|💬|🎉|Resume|Session:|Duration:|Messages:|┌|└|╭|╰|$)/.test(line);

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
      if (content && content !== ".") reasoningLines.push(content);
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
      if (tool) onTool(tool);
      tool = { name: toolMatch[1], args: "" };
      collectingArgs = true;
      return;
    }
    if (collectingArgs && tool) {
      const stripped = line.replace(/^Args:\s*/, "").trimStart();
      if (stripped) tool.args += `${stripped}\n`;
      if (!line.startsWith(" ") && line.endsWith("}")) collectingArgs = false;
      return;
    }
    if (line.startsWith("┊")) return; // live tool progress lines
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
      if (tool) onTool(tool);
      tool = null;
      collectingArgs = false;
      // Unparsed output (e.g. plain `--oneshot`) streams into the answer.
      for (const line of fallback) onAnswerLine(line);
      fallback.length = 0;
    }
  };
}

module.exports = { createChatParser };
