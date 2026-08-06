/**
 * e2e-acp-test.js — Real end-to-end test of the AcpClient + AcpRenderer
 * against `hermes acp`.
 *
 * Runs: initialize → session/new → session/prompt(...) and feeds every
 * session/update through the same AcpRenderer the extension uses, printing
 * the exact UI messages the webview would receive (thinkingUpdate /
 * assistantChunk). Verifies the wire format end to end.
 */
"use strict";

const { AcpClient } = require("../lib/acp-client");
const { createAcpRenderer } = require("../lib/acp-render");

const CWD = __dirname;

async function main() {
  const uiMessages = [];
  const client = new AcpClient({
    command: "hermes",
    args: ["acp"],
    cwd: CWD,
    handlers: {
      onSessionUpdate: (update, sessionId) => {
        const renderer = renderers.get(sessionId);
        if (renderer) renderer.onSessionUpdate(update);
      },
      onError: err => console.error("\n[onError]", err.message),
      onExit: code => console.error(`\n[onExit] code=${code}`),
      onStderr: line => {
        if (/error|traceback/i.test(line)) console.error(`[stderr] ${line.slice(0, 160)}`);
      }
    }
  });
  const renderers = new Map();

  // Fake assistant message + post collector (mirrors extension.js usage).
  const assistantMessage = {
    id: "test-msg-1",
    role: "assistant",
    text: "",
    status: "running",
    thinking: [],
    startedAt: Date.now()
  };
  const session = { id: "test-ui-session" };
  const post = msg => {
    uiMessages.push(msg);
    if (msg.type === "assistantChunk") process.stdout.write(msg.chunk);
  };
  const renderer = createAcpRenderer({ assistantMessage, post, session });

  console.log("1. start()…");
  await client.start();

  console.log("2. initialize…");
  const init = await client.request("initialize", {
    protocolVersion: 1,
    clientCapabilities: {},
    clientInfo: { name: "e2e-test", version: "0.0.1" }
  });
  console.log(`   agent=${init.agentInfo.name} v${init.agentInfo.version}, protocol=${init.protocolVersion}`);

  console.log("3. session/new…");
  const created = await client.request("session/new", { cwd: CWD, mcpServers: [] });
  const sessionId = created.sessionId;
  console.log(`   session_id=${sessionId}`);
  renderers.set(sessionId, renderer);

  console.log("4. session/prompt (ask it to run `ls` via terminal)…\n");
  const result = await client.request("session/prompt", {
    sessionId,
    prompt: [{ type: "text", text: "List the files in the current directory using the terminal tool. Reply with just the file names, one per line. Do not use any other tools." }]
  });
  renderer.finalize(result && result.stopReason === "refusal" ? "failed" : "done");

  console.log(`\n\n5. prompt returned: stopReason=${result && result.stopReason}`);
  console.log("\n── UI messages emitted (what the webview receives) ──");
  const byType = {};
  for (const m of uiMessages) byType[m.type] = (byType[m.type] || 0) + 1;
  console.log(byType);
  console.log(`\n   total messages: ${uiMessages.length}`);

  const thinkingSteps = assistantMessage.thinking;
  console.log("\n── final thinking steps ──");
  for (const step of thinkingSteps) {
    console.log(`  [${step.kind}] ${step.title} — status=${step.status || "-"} done=${!!step.done}`);
    if (step.code && step.kind === "tool") console.log(`       code: ${String(step.code).slice(0, 80)}`);
    if (step.result && step.kind === "tool") console.log(`       result: ${String(step.result).slice(0, 80)}`);
  }

  const toolSteps = thinkingSteps.filter(s => s.kind === "tool");
  const ok =
    uiMessages.some(m => m.type === "thinkingUpdate") &&
    uiMessages.some(m => m.type === "assistantChunk") &&
    assistantMessage.text.trim().length > 0;

  if (!ok) {
    console.error("\n❌ FAIL: expected thinkingUpdate + assistantChunk + answer text");
    process.exit(1);
  }
  console.log(`\n✅ PASS: ${thinkingSteps.length} thinking steps, ${toolSteps.length} tool card(s), answer=${assistantMessage.text.length} chars`);
  console.log("\nNote: tool card status flow = tool_call (start) → tool_call_update (complete)");

  client.kill();
  process.exit(0);
}

main().catch(err => {
  console.error("\n❌ FAIL:", err);
  process.exit(1);
});
