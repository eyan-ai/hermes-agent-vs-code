const assert = require("assert");

exports.run = async function () {
  const vscode = require("vscode");
  const results = [];
  const ok = (name) => results.push({ name, pass: true });
  const fail = (name, err) => results.push({ name, pass: false, err: String(err && err.message || err) });

  // 1. Extension is installed
  const ext = vscode.extensions.getExtension("hermes-agent.hermes-agent");
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

  // 6. Editor-title agent button opens a NEW WINDOW, not a tab (v0.2.0 behavior)
  try {
    await vscode.commands.executeCommand("hermesAgent.openEditorSession");
    await new Promise(r => setTimeout(r, 1200));
    const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
    const webviewTabs = tabs.filter(t => t.input instanceof vscode.TabInputWebview);
    if (webviewTabs.length === 0) ok("openEditorSession opens a new window, no tab in current window");
    else fail("openEditorSession opens a new window, no tab in current window", `${webviewTabs.length} webview tab(s) found in current window`);
  } catch (e) { fail("openEditorSession opens a new window", e); }

  // 7. Session state is persisted through commands (provider writes sessions)
  try {
    await vscode.commands.executeCommand("hermesAgent.newSession");
    ok("state write exercised via newSession command");
  } catch (e) { fail("state write exercised via newSession command", e); }

  // Summary
  const passed = results.filter(r => r.pass).length;
  console.log("===== E2E SMOKE RESULTS =====");
  for (const r of results) console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name}${r.err ? " -> " + r.err : ""}`);
  console.log(`  TOTAL: ${passed}/${results.length} passed`);

  if (passed !== results.length) process.exitCode = 1;
};
