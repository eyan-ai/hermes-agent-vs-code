const assert = require("assert");
const path = require("path");

exports.run = async function () {
  const vscode = require("vscode");
  const results = [];
  const ok = (name) => results.push({ name, pass: true });
  const fail = (name, err) => results.push({ name, pass: false, err: String(err && err.message || err) });
  const isHermesTab = tab => tab.input instanceof vscode.TabInputWebview
    && ["hermesAgent.editorSession", "mainThreadWebview-hermesAgent.editorSession"].includes(tab.input.viewType);

  // 1. Extension is installed
  const ext = vscode.extensions.getExtension("EyanLin.hermes-agent-vscode");
  if (ext) ok("extension found in extension host");
  else fail("extension found in extension host", "not found");

  // 2. Activation
  if (ext) {
    try {
      if (ext.isActive) ok("extension already active");
      else {
        await ext.activate();
        ok("extension activated");
      }
    } catch (e) { fail("extension activated", e); }
  }

  // 3. Commands are registered
  try {
    const cmds = await vscode.commands.getCommands(true);
    for (const c of ["hermesAgent.open", "hermesAgent.openEditorSession", "hermesAgent.newSession", "hermesAgent.focusInput"]) {
      if (cmds.includes(c)) ok(`command registered: ${c}`);
      else fail(`command registered: ${c}`, "not in command list");
    }
  } catch (e) { fail("commands enumerated", e); }

  // 4. Open the sidebar view via command
  try {
    await vscode.commands.executeCommand("hermesAgent.open");
    ok("hermesAgent.open executed without error");
  } catch (e) { fail("hermesAgent.open executed", e); }

  // 5. New session command
  try {
    await vscode.commands.executeCommand("hermesAgent.newSession");
    ok("hermesAgent.newSession executed without error");
  } catch (e) { fail("hermesAgent.newSession executed", e); }

  // 6. Documents stay left while every Hermes session reuses one right group.
  try {
    const readme = vscode.Uri.file(path.join(__dirname, "workspace", "README.md"));
    await vscode.commands.executeCommand("vscode.open", readme, {
      preview: false,
      viewColumn: vscode.ViewColumn.One
    });
    await vscode.commands.executeCommand("hermesAgent.openEditorSession");
    await new Promise(r => setTimeout(r, 1500));
    await vscode.commands.executeCommand("hermesAgent.openEditorSession");
    await new Promise(r => setTimeout(r, 1500));

    let groups = vscode.window.tabGroups.all;
    let hermesGroups = groups.filter(group => group.tabs.some(isHermesTab));
    let documentGroup = groups.find(group => group.tabs.some(tab =>
      tab.input instanceof vscode.TabInputText
        && tab.input.uri.toString() === readme.toString()
    ));
    let hermesTabs = hermesGroups.flatMap(group => group.tabs.filter(isHermesTab));

    const forcedDocument = vscode.Uri.file(path.join(__dirname, "workspace", "SECOND.md"));
    if (hermesGroups.length === 1) {
      await vscode.commands.executeCommand("vscode.open", forcedDocument, {
        preview: false,
        viewColumn: hermesGroups[0].viewColumn
      });
      await new Promise(r => setTimeout(r, 1000));
      groups = vscode.window.tabGroups.all;
      hermesGroups = groups.filter(group => group.tabs.some(isHermesTab));
      documentGroup = groups.find(group => group.tabs.some(tab =>
        tab.input instanceof vscode.TabInputText
          && tab.input.uri.toString() === forcedDocument.toString()
      ));
      hermesTabs = hermesGroups.flatMap(group => group.tabs.filter(isHermesTab));
    }
    const agentContainsDocument = hermesGroups.some(group => group.tabs.some(tab =>
      tab.input instanceof vscode.TabInputText
        || tab.input instanceof vscode.TabInputCustom
        || tab.input instanceof vscode.TabInputNotebook
    ));
    if (documentGroup && hermesGroups.length === 1 && hermesTabs.length >= 2
      && documentGroup.viewColumn < hermesGroups[0].viewColumn && !agentContainsDocument) {
      ok("editor routing keeps documents left and Hermes sessions in one right group");
    } else {
      fail("editor routing keeps documents left and Hermes sessions in one right group", JSON.stringify({
        documentColumn: documentGroup?.viewColumn,
        hermesColumns: hermesGroups.map(group => group.viewColumn),
        hermesTabs: hermesTabs.length,
        agentContainsDocument,
        groups: groups.map(group => ({
          column: group.viewColumn,
          tabs: group.tabs.map(tab => ({
            type: tab.input?.constructor?.name,
            viewType: tab.input?.viewType,
            label: tab.label
          }))
        }))
      }));
    }
  } catch (e) { fail("editor routing keeps documents left and Hermes sessions in one right group", e); }

  // 7. Session state is persisted through commands (provider writes sessions)
  try {
    await vscode.commands.executeCommand("hermesAgent.newSession");
    ok("state write exercised via newSession command");
  } catch (e) { fail("state write exercised via newSession command", e); }

  // 8. Chat output parser: reasoning + tool calls + answer blocks
  try {
    const { createChatParser } = require(path.join(__dirname, "..", "..", "lib", "chat-parser.js"));
    const thinking = [];
    const tools = [];
    const updates = [];
    const answer = [];
    const parser = createChatParser({
      onThinkingEnd: t => thinking.push(t),
      onTool: t => tools.push(t),
      // Mirror the extension host: updates merge back into the emitted step.
      onToolUpdate: t => {
        updates.push(t);
        const i = tools.findIndex(x => x.name === t.name);
        if (i >= 0) tools[i] = { ...tools[i], ...t };
      },
      onAnswerLine: l => answer.push(l)
    });
    parser.onChunk(`💬 Starting conversation: 'read the file'\r
\r
┌─ Reasoning ──────────────────────────┐\r
The user asks to read the file. Let me do it.\r
.\r
└──────────────────────────────────────┘\r
  ┊ 📖 preparing read_file…\r
  📞 Tool 1: read_file(['path'])\r
     Args: {\r
       "path": "/tmp/hermes_test.txt"\r
     }\r
\r
┌─ Reasoning ──────────────────────────┐\r
✅ Tool 1 completed in 0.12s\r
Result: {"content": "1|hello", "total_lines": 1}\r
The file was read successfully.\r
└──────────────────────────────────────┘\r
\r
╭─ ⚕ Hermes ───────────────────────────╮\r
    The file contains "hello".\r
╰──────────────────────────────────────╯\r
Session:        20260806_114600_test\r
`);
    parser.flush();
    const okThinking = thinking.length === 2
      && thinking[0].includes("user asks")
      && !thinking[0].includes("Tool 1")
      && !thinking[1].includes("Result:")
      && thinking[1].includes("file was read");
    const okTool = tools.length === 1 && tools[0].name === "read_file"
      && tools[0].args.includes('"path"')
      && tools[0].result.includes("hello")
      && tools[0].done === true
      && tools[0].summary === "Reading /tmp/hermes_test.txt"
      && tools[0].status === "success";
    const okUpdate = updates.some(u => u.done === true && u.result.includes("hello"));
    const okAnswer = answer.join("\n").includes("hello") && !answer.join("\n").includes("Session:");
    if (okThinking && okTool && okUpdate && okAnswer) ok("chat parser: reasoning + tool(args/result) + answer blocks");
    else fail("chat parser: reasoning + tool(args/result) + answer blocks", JSON.stringify({ thinking, tools, updates, answer }).slice(0, 400));
  } catch (e) { fail("chat parser: reasoning + tool(args/result) + answer blocks", e); }

  // 8b. Chat output parser: shell/code payloads extracted into tool.code
  try {
    const { createChatParser } = require(path.join(__dirname, "..", "..", "lib", "chat-parser.js"));
    const tools = [];
    const parser = createChatParser({
      onThinkingEnd: () => {},
      onTool: t => tools.push(t),
      onToolUpdate: t => {
        const i = tools.findIndex(x => x.name === t.name);
        if (i >= 0) tools[i] = { ...tools[i], ...t };
      },
      onAnswerLine: () => {}
    });
    parser.onChunk(`📞 Tool 1: terminal(['cmd'])\r
     Args: {\r
       "command": "ls -la"\r
     }\r
┌─ Reasoning ──┐\r
✅ Tool 1 completed\r
└──────────────┘\r
`);
    parser.flush();
    if (tools.length === 1 && tools[0].code === "ls -la" && tools[0].summary === "Running `ls -la`" && tools[0].status === "success") {
      ok("chat parser: tool.code extracts shell command, summary naturalized");
    } else {
      fail("chat parser: tool.code extracts shell command, summary naturalized", JSON.stringify(tools));
    }
  } catch (e) { fail("chat parser: tool.code extracts shell command, summary naturalized", e); }

  // 9. Chat output parser: plain --oneshot fallback streams into the answer
  try {
    const { createChatParser } = require(path.join(__dirname, "..", "..", "lib", "chat-parser.js"));
    const answer = [];
    const parser = createChatParser({ onThinkingEnd: () => {}, onTool: () => {}, onAnswerLine: l => answer.push(l) });
    parser.onChunk("Plain one-shot answer line one.\nPlain one-shot answer line two.\n");
    parser.flush();
    if (answer.join(" ").includes("line two")) ok("chat parser: unparsed output falls back to answer");
    else fail("chat parser: unparsed output falls back to answer", answer.join(" | "));
  } catch (e) { fail("chat parser: unparsed output falls back to answer", e); }

  // Summary
  const passed = results.filter(r => r.pass).length;
  console.log("===== E2E SMOKE RESULTS =====");
  for (const r of results) console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name}${r.err ? " -> " + r.err : ""}`);
  console.log(`  TOTAL: ${passed}/${results.length} passed`);

  if (passed !== results.length) throw new Error(`${results.length - passed} smoke assertion(s) failed`);
};
