"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const extension = fs.readFileSync(path.join(__dirname, "..", "extension.js"), "utf8");

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("ACP turns become cancellable before transport initialization", () => {
  const runAcp = extension.slice(extension.indexOf("async runAcp("), extension.indexOf("async syncAcpTitle("));
  const promptIndex = runAcp.indexOf('client.request("session/prompt"');
  assert.ok(runAcp.indexOf("this.activeTurns.set") < runAcp.indexOf("await this.ensureAcp"));
  assert.ok(runAcp.indexOf("if (lifecycle.cancelled)") < runAcp.indexOf("await this.ensureMappedAcpSession"));
  assert.ok(runAcp.lastIndexOf("if (lifecycle.cancelled)", promptIndex) > runAcp.indexOf('client.request("session/set_mode"'));
});

test("Diff acceptance checks the recorded source state before rollback", () => {
  const start = extension.indexOf("async resolveDiffPermission(");
  const resolve = extension.slice(start, extension.indexOf("\n  disposeDocDiffUi()", start));
  assert.ok(resolve.indexOf("await this.diffSourceMatches(preview)") < resolve.indexOf("rollbackDocDiffPreview"));
  assert.ok(resolve.indexOf("await this._diffPreviewPromise") < resolve.indexOf("pending?.diff && !this._diffPreview"));
  assert.match(resolve, /if \(!await this\.diffSourceMatches\(preview\)\)/);
});

test("open-document Diff uses a reversible inline edit and repairs any autosaved preview", () => {
  const start = extension.indexOf("async showDocDiff(");
  const end = extension.indexOf("\n  async resolveDiffPermission", start);
  const lifecycle = extension.slice(start, end);
  assert.match(lifecycle, /async openInlineDiffPreview\(/);
  assert.match(lifecycle, /editor\.edit\(builder =>/);
  assert.match(lifecycle, /preview\.diskTextBefore = await this\.readFileTextIfExists\(uri\)/);
  assert.match(lifecycle, /locatePreviewForRemoval\(document\.getText\(\), preview\)/);
  assert.match(lifecycle, /vscode\.workspace\.applyEdit\(edit\)/);
  assert.match(lifecycle, /diskText === preview\.previewText[\s\S]*document\.save\(\)/);
  assert.doesNotMatch(lifecycle, /workspace\.fs\.writeFile/);
});

test("Diff preview supports open, unopened, and missing target states without writing", () => {
  assert.match(extension, /async readDiffSource\(/);
  assert.match(extension, /vscode\.workspace\.fs\.readFile\(uri\)/);
  assert.match(extension, /sourceKind:\s*"missing"/);
  assert.match(extension, /if \(oldText\) return undefined/);
  assert.match(extension, /async diffSourceMatches\(/);
  assert.match(extension, /await this\.diffSourceMatches\(preview\)/);
  const start = extension.indexOf("async showDocDiff(");
  const end = extension.indexOf("\n  async rollbackDocDiffPreview", start);
  assert.doesNotMatch(extension.slice(start, end), /workspace\.fs\.writeFile/);
});

test("Diff approval choices live only in the confirmation popup", () => {
  const start = extension.indexOf("async showDocDiff(");
  const showDiff = extension.slice(start, extension.indexOf("\n  async rollbackDocDiffPreview", start));
  assert.doesNotMatch(showDiff, /createStatusBarItem/);
  assert.doesNotMatch(showDiff, /registerCommand\("hermesAgent\.(acceptDiff|rejectDiff)"/);
});

test("assistant document links resolve separately from attachments", () => {
  assert.match(extension, /case "openGeneratedDocument":/);
  assert.match(extension, /await this\.openGeneratedDocument\(message\.path\)/);
  assert.match(extension, /async openGeneratedDocument\(rawPath\)/);
  assert.match(extension, /buildGeneratedDocumentCandidates/);
  assert.match(extension, /await this\.openDocumentUri\(uri, \{ preview: true \}\)/);
});

test("editor Diff decorations follow VS Code theme colors", () => {
  assert.match(extension, /new vscode\.ThemeColor\("diffEditor\.removedTextBackground"\)/);
  assert.match(extension, /new vscode\.ThemeColor\("diffEditor\.insertedTextBackground"\)/);
  assert.match(extension, /new vscode\.ThemeColor\("editorOverviewRuler\.deletedForeground"\)/);
  assert.match(extension, /new vscode\.ThemeColor\("editorOverviewRuler\.addedForeground"\)/);
  assert.match(extension, /changedLineIndices\(preview\.oldText, preview\.newText\)/);
  assert.match(extension, /isWholeLine:\s*true/);
  assert.match(extension, /light: \{ backgroundColor: "rgba\(/);
  assert.match(extension, /dark: \{ backgroundColor: "rgba\(/);
  assert.doesNotMatch(extension, /textDecoration:\s*"line-through"/);
  assert.doesNotMatch(extension, /backgroundColor:\s*"rgba\(224, 100, 95/);
  assert.doesNotMatch(extension, /backgroundColor:\s*"rgba\(100, 201, 136/);
});

test("document migration only closes a source tab after opening succeeds", () => {
  assert.match(extension, /const opened = await this\.openDocumentTab[\s\S]{0,180}if \(opened && group\.tabs\.includes\(tab\)\)/);
  assert.match(extension, /executeCommand\("vscode\.diff", input\.original, input\.modified/);
});

test("Stop recognizes ACP initialization and CLI output rejects late events", () => {
  const stopStart = extension.indexOf("async stop(");
  const stop = extension.slice(stopStart, extension.indexOf("\n  terminateProcess(", stopStart));
  assert.match(stop, /this\.acp \|\| this\._startingAcp \|\| this\.activeTurns\.has/);
  assert.match(stop, /return this\.isolateAcpTurnForStop\(session\.id\)/);
  assert.doesNotMatch(stop, /await this\.drainQueue\(session\.id\)/);
  assert.match(stop, /const stopping = this\.terminateProcess/);
  assert.match(extension, /onAnswerLine: line => \{\s*if \(assistantMessage\.status !== "running"\) return;/);
});

test("slash Stop and the pause button share the same safe Stop operation", () => {
  const dispatchStart = extension.indexOf("async dispatchCommand(");
  const dispatchEnd = extension.indexOf("\n  async startPrompt(", dispatchStart);
  const dispatch = extension.slice(dispatchStart, dispatchEnd);
  assert.match(dispatch, /case "\/stop":[\s\S]{0,100}if \(await this\.stop\(sessionId\)\)/);
  assert.match(dispatch, /else[\s\S]{0,180}未能安全停止当前任务/);
  assert.match(extension, /case "stop":\s*await this\.stop\(sessionId\)/);
});

test("Stop forks and remaps the ACP session before cancelling the old turn", () => {
  const start = extension.indexOf("async isolateAcpTurnForStop(");
  const end = extension.indexOf("\n  async acpStop(", start);
  const isolate = extension.slice(start, end);
  const forkIndex = isolate.indexOf("await this.forkAcpSessionForCancellation(target, turn)");
  const cancelIndex = isolate.indexOf("await this.cancelPermissionsForSession(sessionId)");
  assert.ok(forkIndex >= 0 && forkIndex < cancelIndex);
  assert.match(isolate, /this\.cancellationBarriers\.open\(sessionId\)/);
  assert.match(isolate, /this\.promptQueue\.clear\(sessionId\)/);
  assert.match(isolate, /await this\.stopRetiredAcpTurn\(turn, handoff\)/);
  assert.match(isolate, /await this\.restartAcpTransportAndResume\(target, turn\)/);
  assert.match(isolate, /if \(isolated\) barrier\.release\(\)/);
  assert.doesNotMatch(isolate, /drainQueue/);
});

test("prompt routing exposes runtime queue operations and drains after completion", () => {
  assert.match(extension, /this\.promptQueue = new PromptQueue\(id\)/);
  assert.match(extension, /case "queueEdit"/);
  assert.match(extension, /case "queueDelete"/);
  assert.match(extension, /case "queueSteer"/);
  assert.match(extension, /resolveSubmission\(message, active\)/);
  assert.match(extension, /if \(drainAfter\) await this\.drainQueue\(session\.id\)/);
  assert.match(extension, /queue:\s*this\.promptQueue\.snapshot\(session\.id\)/);
});

test("queue draining cannot bypass an active cancellation barrier", () => {
  const start = extension.indexOf("async drainQueue(");
  const end = extension.indexOf("\n  async steerQueuedPrompt(", start);
  const drain = extension.slice(start, end);
  assert.match(drain, /this\.cancellationBarriers\.has\(sessionId\)/);
  assert.ok((drain.match(/this\.cancellationBarriers\.has\(sessionId\)/g) || []).length >= 2);
});

test("queued Steer requests use a per-session in-flight guard", () => {
  assert.match(extension, /this\.steeringQueueItems = new Set\(\)/);
  const start = extension.indexOf("async steerQueuedPrompt(");
  const steerQueued = extension.slice(start, extension.indexOf("\n  async steerPrompt(", start));
  assert.match(steerQueued, /const key = `\$\{sessionId\}:\$\{itemId\}`/);
  assert.match(steerQueued, /if \(this\.steeringQueueItems\.has\(key\)\) return/);
  assert.match(steerQueued, /this\.steeringQueueItems\.add\(key\)/);
  assert.match(steerQueued, /finally[\s\S]*this\.steeringQueueItems\.delete\(key\)/);
});

test("active steer retargets the renderer and sends a raw ACP control command", () => {
  const start = extension.indexOf("async steerPrompt(");
  const steer = extension.slice(start, extension.indexOf("\n  async runAgent(", start));
  assert.match(steer, /renderer\.continueWith\(assistantMessage\)/);
  assert.match(steer, /renderer\.ignoreNextAssistantText/);
  assert.match(steer, /text: `\/steer \$\{prompt\}`/);
  assert.match(steer, /turn\.assistantMessage = assistantMessage/);
});

test("selected slash commands bypass the ordinary prompt wrapper", () => {
  const start = extension.indexOf("function composeHermesPrompt(");
  const compose = extension.slice(start, extension.indexOf("\nfunction id()", start));
  assert.match(compose, /if \(userMessage\.command\)/);
  assert.match(compose, /return `\$\{userMessage\.command\}/);
});

test("system commands dispatch before ordinary prompt queue resolution", () => {
  const start = extension.indexOf("async sendPrompt(");
  const end = extension.indexOf("\n  async startPrompt(", start);
  const send = extension.slice(start, end);
  assert.ok(send.indexOf("await this.dispatchCommand") < send.indexOf("resolveSubmission(message, active)"));
  assert.match(send, /message\.command !== "\/steer"/);
  assert.match(extension, /async appendCommandNotice\(/);
  assert.match(extension, /role: "system"/);
});

test("ACP advertised commands are captured and command responses bypass the chat renderer", () => {
  assert.match(extension, /update\.sessionUpdate === "available_commands_update"/);
  assert.match(extension, /this\.acpAvailableCommands\.set\(acpSessionId, available\)/);
  assert.match(extension, /this\.acpCommandCaptures\.get\(acpSessionId\)/);
  assert.match(extension, /commandCapture\.push\(textOf\(update\.content\)\)/);
  assert.match(extension, /availableCommands: this\.availableCommandsForSession\(session\.id\)/);
});

test("stop and save have immediate local command handlers", () => {
  const start = extension.indexOf("async dispatchCommand(");
  const end = extension.indexOf("\n  async startPrompt(", start);
  const dispatch = extension.slice(start, end);
  assert.match(dispatch, /case "\/stop":[\s\S]{0,100}await this\.stop\(sessionId\)/);
  assert.match(dispatch, /case "\/save":[\s\S]{0,180}saveConversationSnapshot/);
  assert.match(extension, /hermes_vscode_conversation_/);
});

test("editor panels bind messages and state to their own sessions", () => {
  assert.match(extension, /this\.configureWebview\(panel\.webview, panel\)/);
  assert.match(extension, /this\.onMessage\(message, panel\)/);
  assert.match(extension, /panel\.webview\.postMessage\(this\.stateMessage\(panel\.sessionId\)\)/);
  assert.match(extension, /await this\.sendPrompt\(message, sessionId, panel\)/);
  assert.match(extension, /this\.cliTurns\.set\(session\.id, cliTurn\)/);
});

test("permissions are queued and resolved only for the requesting session", () => {
  assert.match(extension, /const pending = \{[\s\S]{0,320}uiSessionId:/);
  assert.match(extension, /this\.permissionQueue\.push\(pending\)/);
  assert.match(extension, /if \(sessionId && pending\?\.uiSessionId !== sessionId\) return false/);
  assert.match(extension, /if \(requestId && pending\?\.request\.id !== requestId\) return false/);
  assert.match(extension, /pending\.client\.respond\(pending\.request\.id/);
});

test("hard denial cancels sibling permissions and clears the rejected turn queue without draining it", () => {
  const start = extension.indexOf("async resolveDiffPermission(");
  const end = extension.indexOf("\n  async openAppliedNewFile(", start);
  const resolve = extension.slice(start, end);
  assert.match(resolve, /const hardDenial = Boolean\(/);
  assert.match(resolve, /normalizedDecision !== "feedback"/);
  assert.match(resolve, /this\.cancelQueuedPermissionsForSession\(pending\.uiSessionId\)/);
  assert.match(resolve, /this\.promptQueue\.clear\(pending\.uiSessionId\)/);
  assert.match(resolve, /await this\.forkAcpSessionForCancellation\(pending, deniedTurn\)/);
  assert.ok(resolve.indexOf("await this.forkAcpSessionForCancellation(pending, deniedTurn)") < resolve.indexOf("pending.client.respond(pending.request.id"));
  assert.match(resolve, /await this\.stopRetiredAcpTurn\(deniedTurn, denialHandoff\)/);
  assert.match(resolve, /await this\.restartAcpTransportAndResume\(pending, deniedTurn\)/);
  assert.match(resolve, /this\.cancellationBarriers\.open\(pending\.uiSessionId\)/);
  assert.match(resolve, /if \(isolated\) denialBarrier\.release\(\)/);
  assert.doesNotMatch(resolve, /appendCommandNotice[\s\S]{0,100}\/deny/);
  assert.doesNotMatch(resolve, /drainQueue/);
});

test("legacy synthetic deny notices are removed from persisted session history", () => {
  const start = extension.indexOf("loadSessions()");
  const end = extension.indexOf("\n  saveSessions()", start);
  const load = extension.slice(start, end);
  assert.match(load, /message\.role === "system" && message\.command === "\/deny"/);
  assert.match(load, /message\.role === "assistant" && message\.status === "running"/);
  assert.match(load, /status: "stopped"/);
});

test("running-state routing uses live turns instead of persisted message status", () => {
  const start = extension.indexOf("isSessionRunning(sessionId)");
  const end = extension.indexOf("\n  queuePayload(", start);
  const running = extension.slice(start, end);
  assert.match(running, /this\.activeTurns\.get\(sessionId\)/);
  assert.match(running, /this\.cliTurns\.has\(sessionId\)/);
  assert.match(running, /this\.mockTurns\.has\(sessionId\)/);
  assert.doesNotMatch(running, /session\.messages|message\.status/);
});

test("retired ACP sessions reject late updates and permissions", () => {
  assert.match(extension, /if \(this\.retiredAcpSessions\.has\(acpSessionId\)\) return/);
  assert.match(extension, /if \(this\.retiredAcpSessions\.has\(sessionId\)\)[\s\S]{0,160}outcome: "cancelled"/);
  assert.match(extension, /installAcpSessionReplacement\(/);
  assert.match(extension, /replacementSessionId: replacementAcpSessionId,[\s\S]{0,80}session/);
});

test("new submissions wait for the session denial barrier before queue resolution", () => {
  const start = extension.indexOf("async sendPrompt(");
  const end = extension.indexOf("\n  async startPrompt(", start);
  const send = extension.slice(start, end);
  assert.ok(send.indexOf("await this.cancellationBarriers.wait(sessionId)") < send.indexOf("resolveSubmission(message, active)"));
  assert.match(extension, /\breleased,\s*\n\s*release:/);
  assert.match(extension, /turn\.release\(\)/);
});

test("pending permissions are replayed only into their owning session", () => {
  assert.match(extension, /permissionMessageForSession\(sessionId\)/);
  assert.match(extension, /permission:\s*this\.permissionMessageForSession\(session\.id\)/);
  assert.match(extension, /message\.sessionId \|\| sessionId[\s\S]{0,120}requestId:\s*message\.requestId/);
});

test("permission reminders never resolve or reject the pending request", () => {
  const start = extension.indexOf("schedulePermissionReminder(");
  const end = extension.indexOf("\n  clearPermissionReminder(", start);
  const reminder = extension.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(reminder, /setInterval/);
  assert.match(reminder, /showInformationMessage/);
  assert.doesNotMatch(reminder, /\.respond\(|resolveDiffPermission/);
});

test("session permission grants are scoped by ACP session and operation type", () => {
  assert.match(extension, /this\.permissionSessionGrants = new Map\(\)/);
  assert.match(extension, /permissionScope.*"edit".*"execute"/s);
  assert.match(extension, /grantPermissionForSession\(pending\.acpSessionId, pending\.scope\)/);
  assert.match(extension, /hasPermissionSessionGrant\(sessionId, scope\)/);
  assert.match(extension, /toolCall\?\.kind[\s\S]{0,180}kind === "edit"[\s\S]{0,180}kind === "execute"/);
});

test("edit approvals use fixed copy while other approvals expose ACP options", () => {
  const start = extension.indexOf("permissionChoicesForPending(");
  const end = extension.indexOf("\n  permissionQuestion(", start);
  const choices = extension.slice(start, end);
  assert.match(choices, /pending\.scope === "edit"/);
  assert.match(choices, /label: "Yes"/);
  assert.match(choices, /label: "Yes, always allow in this session"/);
  assert.match(choices, /label: "No"/);
  assert.match(choices, /pending\.request\.params\?\.options/);
});

test("terminal ACP state expires stale permission UI without a late response", () => {
  assert.match(extension, /this\.expirePermissionFromSessionUpdate\(update, acpSessionId\)/);
  assert.match(extension, /await this\.expirePermissionsForSession\(session\.id, \{ acpSessionId \}\)/);

  const start = extension.indexOf("async expirePendingPermission(");
  const end = extension.indexOf("\n  async ", start + 10);
  const expire = extension.slice(start, end);
  assert.ok(start >= 0);
  assert.match(expire, /rollbackDocDiffPreview/);
  assert.match(expire, /permissionResolved/);
  assert.doesNotMatch(expire, /\.respond\(/);
});

test("shared ACP reset cancels every turn on the transport", () => {
  assert.match(extension, /cancelTurnsForClient\(client\)[\s\S]{0,350}turn\.lifecycle\.markCancelled\(\)/);
  assert.match(extension, /this\.cancelTurnsForClient\(client\);/);
});

test("extension deactivation waits for provider cleanup", () => {
  assert.match(extension, /function deactivate\(\) \{[\s\S]{0,180}return provider\?\.dispose\(\)/);
  assert.match(extension, /this\._disposePromise = \(async \(\) => \{[\s\S]*await this\.rollbackDocDiffPreview\(\)/);
});

test("model settings use ACP session state and persist only successful selections", () => {
  assert.match(extension, /const \{[^}]*configuredModelState[^}]*normalizeModelState[^}]*resolveSelectedModel[^}]*\} = require\("\.\/lib\/model-settings"\)/s);
  assert.match(extension, /const created = await client\.request\("session\/new"/);
  assert.match(extension, /applyAcpSessionState\(session, acpSessionId, models\)[\s\S]{0,180}normalizeModelState\(models\)/);
  assert.match(extension, /client\.request\("session\/set_model", \{[\s\S]{0,120}sessionId:[\s\S]{0,120}modelId:/);
  assert.match(extension, /saveLastModel\(this\.context, selectedModel\)/);
  assert.match(extension, /session\.settings = \{[\s\S]{0,100}mode: lastMode\(this\.context\),[\s\S]{0,100}model: lastModel\(this\.context/);
  assert.match(extension, /models:\s*modelState\.options/);
});

test("custom confirmation feedback stays on the related action and continues without Queue", () => {
  const start = extension.indexOf("async continuePermissionFeedback(");
  const feedbackFlow = extension.slice(start, extension.indexOf("\n  schedulePermissionReminder(", start));
  assert.match(extension, /normalizedDecision === "feedback"/);
  assert.match(extension, /continuePermissionFeedback\(pending, feedbackText\)/);
  assert.match(extension, /outcome: \{ outcome: "cancelled" \}/);
  assert.doesNotMatch(extension, /sendPrompt\(\{ prompt: feedbackText, workingFeedback: true/);
  assert.match(feedbackFlow, /prompt: \[\{ type: "text", text: `\/steer \$\{feedbackText\}` \}\]/);
  assert.doesNotMatch(feedbackFlow, /promptQueue\.enqueue|continueWith\(|steer:\s*true/);
  assert.match(extension, /await this\.saveSessions\(\)/);
  assert.match(extension, /recordPermissionOutcome\(pending/);
  assert.doesNotMatch(feedbackFlow, /kind: "clarification"/);
});

test("permission outcomes bind to the original operation rather than the synthetic approval id", () => {
  assert.match(extension, /capturePermissionAction\(pending\)/);
  assert.match(extension, /permissionActionStep\(pending/);
  assert.match(extension, /pending\.actionMessageId/);
  assert.match(extension, /pending\.actionStepIndex/);
  assert.match(extension, /用户拒绝了本次写入/);
  assert.match(extension, /用户提出了新的要求/);
});

test("intentional turn cancellation suppresses expected ACP stderr noise", () => {
  assert.match(extension, /client\.suppressCancellationErrorsUntil/);
  assert.match(extension, /suppressCancellationErrorsUntil = Date\.now\(\) \+ 5000/);
  assert.match(extension, /turn\.client === client && turn\.lifecycle\.cancelled/);
  assert.match(extension, /if \(cancellingTurn\) return;/);
});

test("permission requests classify operation approvals separately from genuine questions", () => {
  assert.match(extension, /permissionIntent\(/);
  assert.match(extension, /intent:\s*this\.permissionIntent/);
  assert.match(extension, /recordPermissionQuestion\(/);
  assert.match(extension, /recordPermissionOutcome\(/);
  assert.match(extension, /conversationLanguage\(/);
  assert.match(extension, /systemCancellation = false/);
  assert.match(extension, /systemCancellation: true/);
});

test("one permission request aggregates every Diff block for the same document", () => {
  assert.match(extension, /prepareDocumentReviewBatch/);
  assert.match(extension, /filter\(block => block && block\.type === "diff"\)/);
  assert.match(extension, /showDocDiff\(pending\.diffs\?\.length \? pending\.diffs : pending\.diff/);
});

test("document approvals prefer an inline Diff for open documents before size-based Review", () => {
  assert.match(extension, /prepareDocumentReviewBatch\(\{/);
  assert.match(extension, /review\.kind === "new-file"/);
  assert.match(extension, /if \(sourceEditor\)[\s\S]*openInlineDiffPreview/);
  assert.match(extension, /review\.kind === "full-review"/);
  assert.match(extension, /pending\.previewKind = "compact-diff"/);
  assert.match(extension, /pending\.previewKind = "inline-diff"/);
  assert.match(extension, /diff:\s*pending\.diffInConfirmation \? this\.compactPermissionDiff\(pending\.diff\) : null/);
  assert.match(extension, /registerTextDocumentContentProvider\("hermes-new-file-preview"/);
  assert.match(extension, /createWebviewPanel\([\s\S]{0,120}REVIEW_VIEW_TYPE/);
  assert.match(extension, /Candidate ready · Original unchanged/);
  assert.match(extension, /data-tab="result"[\s\S]{0,80}data-tab="changes"/);
  const showStart = extension.indexOf("async showDocDiff(");
  const showEnd = extension.indexOf("\n  async rollbackDocDiffPreview", showStart);
  assert.doesNotMatch(extension.slice(showStart, showEnd), /workspace\.fs\.writeFile/);
});

test("completed Review closes its dedicated Editor group and restores the Agent", () => {
  assert.match(extension, /async closeDocumentReview\(/);
  assert.match(extension, /workbench\.action\.closeEditorsAndGroup/);
  assert.match(extension, /group\.tabs\.length === 1/);
  assert.match(extension, /agentPanel\.reveal\(agentPanel\.viewColumn, false\)/);
});

test("new-file approval opens the real file only after the approved content exists", () => {
  assert.match(extension, /accept && resolvedPreview\?\.previewKind === "new-file"/);
  assert.match(extension, /async openAppliedNewFile\(/);
  assert.match(extension, /Buffer\.from\(bytes\)\.toString\("utf8"\) === preview\.candidateText/);
  assert.match(extension, /await this\.openDocumentUri\(uri, \{ preview: false \}\)/);
});

test("Review feedback preserves the same temporary Editor while the candidate regenerates", () => {
  assert.match(extension, /normalizedDecision === "feedback" && resolvedPreview\?\.previewKind === "full-review"/);
  assert.match(extension, /rollbackDocDiffPreview\(\{ preserveReviewPanel \}\)/);
  assert.match(extension, /Generating a revised candidate\. The original document remains unchanged\./);
  assert.match(extension, /case "reopenPermissionPreview"/);
});
