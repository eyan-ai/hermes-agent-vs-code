"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const main = fs.readFileSync(path.join(__dirname, "..", "media", "main.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "media", "styles.css"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("selected commands and skills render as one inline prompt token", () => {
  assert.match(main, /contenteditable="true"/);
  assert.match(main, /class="prompt-token" contenteditable="false"/);
  assert.match(main, /const placeholder = token \? "" :/);
  assert.match(main, /function promptBody\(/);
  assert.match(styles, /\.prompt-token\s*\{[^}]*display:\s*inline[^}]*color:\s*var\(--ha-accent\)/);
});

test("multiword command names can be filtered and selected by Space", () => {
  assert.match(main, /const commandFilter = value\.trimStart\(\)\.slice\(1\)\.toLowerCase\(\)/);
  assert.match(main, /event\.key === " "/);
  assert.match(main, /option\.name\.toLowerCase\(\) === typed/);
  assert.match(main, /selectCommandOption\(exact\)/);
});

test("permission popup reuses the existing frame with direct choices and custom input", () => {
  const start = main.indexOf("function renderPermissionInside(");
  const end = main.indexOf("\n}\n", start) + 2;
  const permission = main.slice(start, end);
  assert.match(permission, /choices\.map/);
  assert.match(permission, /h\(choice\.label\)/);
  assert.match(permission, /p\.diff \? renderDiff\(p\.diff\) : ""/);
  assert.match(permission, /p\.previewAction/);
  assert.match(permission, /id="permissionPreview"/);
  assert.doesNotMatch(permission, /permission-content|permission-path/);
  assert.match(permission, /<textarea[^>]*id="permissionFeedback"/);
  assert.doesNotMatch(permission, /Continue|Confirm selection/);
  assert.match(main, /const permissionFeedback = document\.querySelector\("#permissionFeedback"\)/);
  assert.match(main, /permissionFeedback\?\.addEventListener\("keydown"/);
  assert.match(main, /event\.key === "Enter" && !event\.shiftKey && !event\.isComposing/);
  assert.match(main, /decision: "feedback"/);
  assert.match(styles, /\.permission-feedback\s*\{/);
  assert.match(styles, /\.permission-preview\s*\{/);
  assert.match(main, /type: "reopenPermissionPreview"/);
});

test("edited Diff previews expose a preserving cancel action", () => {
  assert.match(main, /Keep my edits and cancel this change/);
  assert.match(main, /type:\s*"abandonDiffPreview"/);
  assert.match(main, /p\.previewDiverged/);
  assert.match(main, /previewDiverged:\s*Boolean\(message\.previewDiverged\)/);
});

test("permission responses retain request and session ownership", () => {
  assert.match(main, /type: "permissionResponse", decision: button\.dataset\.decision, optionId: button\.dataset\.optionId \|\| undefined, requestId: state\.permission\.requestId, sessionId: state\.permission\.sessionId/);
  assert.match(main, /state\.permission = message\.permission \|\| null/);
});

test("permission reminder interval is configurable and defaults to five minutes", () => {
  const setting = packageJson.contributes.configuration.properties["hermesAgent.permissionReminderMinutes"];
  assert.strictEqual(setting.type, "number");
  assert.strictEqual(setting.default, 5);
  assert.strictEqual(setting.minimum, 0);
});

test("composer rows retain compact controls with bottom clearance", () => {
  assert.match(styles, /\.input-line\.prompt\s*\{[^}]*min-height:\s*60px[^}]*padding:\s*10px 12px 7px/);
  assert.match(styles, /\.toolbar\s*\{[^}]*height:\s*36px[^}]*min-height:\s*36px[^}]*border-top:\s*0[^}]*padding:\s*0 8px 6px/);
  assert.match(styles, /\.plus-btn\s*\{[^}]*min-width:\s*30px[^}]*height:\s*30px/);
  assert.match(styles, /\.send\s*\{[^}]*width:\s*30px[^}]*height:\s*30px/);
});

test("composer and sent-message attachments stay on one horizontally scrollable row", () => {
  assert.match(styles, /\.attachments\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*hidden[^}]*scrollbar-width:\s*none/);
  assert.match(styles, /\.composer-top\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*hidden[^}]*scrollbar-width:\s*none/);
});

test("empty title and selected tokens use readable semantic theme colors", () => {
  assert.match(styles, /--ha-accent:\s*var\(--vscode-focusBorder,\s*var\(--vscode-textLink-foreground,\s*var\(--vscode-button-background\)\)\);/);
  assert.match(styles, /--ha-focus:\s*var\(--vscode-focusBorder/);
  assert.match(styles, /\.composer:focus-within\s*\{[^}]*border-color:\s*var\(--ha-accent\)/);
  assert.match(styles, /\.prompt-token\s*\{[^}]*color:\s*var\(--ha-accent\)/);
  assert.match(styles, /\.hero h1\s*\{[^}]*font-weight:\s*650[^}]*color:\s*var\(--ha-fg-primary\)/);
});

test("slash palette remains grouped with two-line command rows", () => {
  assert.match(main, /state\.settings\.commands/);
  assert.match(main, /command-group-title/);
  assert.match(main, /command-name/);
  assert.match(main, /command-desc/);
  assert.match(styles, /\.command-option\s*\{[^}]*flex-direction:\s*column/);
});

test("command results render as notices rather than assistant turns", () => {
  assert.match(main, /message\.role === "system"/);
  assert.match(main, /function renderCommandNotice\(/);
  assert.match(main, /class="command-notice \$\{kind\}"/);
  assert.match(styles, /\.command-notice\s*\{/);
});

test("runtime queue is collapsible, capped to five rows, and edits in place", () => {
  assert.match(main, /function renderQueue\(/);
  assert.match(main, /state\.queueCollapsed/);
  assert.match(main, /type: "queueEdit", id: state\.editingQueueId/);
  assert.match(main, /type: "queueSteer"/);
  assert.match(main, /Submit without interrupting the model/);
  assert.match(styles, /\.queue-list\s*\{[^}]*max-height:\s*calc\(38px \* 5\)[^}]*overflow-y:\s*auto/);
});

test("live conversation updates do not rebind unchanged Queue actions", () => {
  const start = main.indexOf("function renderLiveRegions(");
  const liveRender = main.slice(start, main.indexOf("\nfunction renderAccessoriesOnly", start));
  assert.match(liveRender, /refreshAccessoryRegion\(accessoryEl\)/);
  assert.doesNotMatch(liveRender, /bindAccessoryRegion\(\)/);
  assert.match(main, /_queueBindingsReady/);
});

test("live streaming reconciles keyed messages instead of replacing the conversation DOM", () => {
  const start = main.indexOf("function renderLiveRegions(");
  const liveRender = main.slice(start, main.indexOf("\nfunction renderAccessoriesOnly", start));
  assert.match(main, /function reconcileConversationRegion\(/);
  assert.match(main, /data-live-key/);
  assert.match(liveRender, /reconcileConversationRegion\(scrollEl, messages\)/);
  assert.doesNotMatch(liveRender, /scrollEl\.innerHTML\s*=/);
  assert.match(main, /class="answer-content"/);
  assert.match(main, /class="answer-status"/);
});

test("manual upward scrolling releases the streaming bottom lock", () => {
  assert.match(main, /if \(!atBottom\) \{[\s\S]{0,120}state\.userScrolledUp = true;[\s\S]{0,120}state\.pinBottom = false;/);
  assert.match(main, /addEventListener\("wheel"[\s\S]{0,220}event\.deltaY >= 0[\s\S]{0,160}state\.pinBottom = false/);
});

test("submission acknowledgement owns a one-shot bottom transition", () => {
  assert.match(main, /pendingSubmissionScrollIntent:\s*null/);
  assert.match(main, /function createPendingSubmissionScrollIntent\(/);
  assert.match(main, /conversationMessageIds:\s*submissionIdentityIds\(activeSession\(\)\.messages\)/);
  assert.match(main, /queueItemIds:\s*submissionIdentityIds\(state\.queue\)/);
  assert.match(main, /state\.pendingSubmissionScrollIntent = createPendingSubmissionScrollIntent\(\);[\s\S]{0,100}type: "sendPrompt"/);
  assert.match(main, /hasNewConversationItem[\s\S]{0,180}hasNewQueueItem/);
  assert.match(main, /renderLiveRegions\(\{ forceSubmissionBottom \}\)/);
  assert.match(main, /if \(forceSubmissionBottom\) \{[\s\S]{0,100}el\.scrollTop = el\.scrollHeight/);
});

test("submission acknowledgement ignores unchanged and reordered identities", () => {
  const helperStart = main.indexOf("function submissionIdentityIds(");
  const helperEnd = main.indexOf("\nfunction submit()", helperStart);
  const helperSource = main.slice(helperStart, helperEnd);
  const mockState = {
    activeSessionId: "session-1",
    queue: [{ id: "queue-1" }, { id: "queue-2" }],
    pendingSubmissionScrollIntent: null,
    userScrolledUp: true
  };
  const active = { messages: [{ id: "message-1" }, { id: "message-2" }] };
  const helpers = Function("state", "activeSession", `${helperSource}; return { createPendingSubmissionScrollIntent, acknowledgePendingSubmissionScroll };`)(mockState, () => active);
  mockState.pendingSubmissionScrollIntent = helpers.createPendingSubmissionScrollIntent();

  assert.strictEqual(helpers.acknowledgePendingSubmissionScroll(
    [{ id: "session-1", messages: [...active.messages] }],
    "session-1",
    [{ id: "queue-2" }, { id: "queue-1" }]
  ), false);
  assert.ok(mockState.pendingSubmissionScrollIntent);
  assert.strictEqual(mockState.userScrolledUp, true);

  assert.strictEqual(helpers.acknowledgePendingSubmissionScroll(
    [{ id: "session-1", messages: [...active.messages, { id: "message-3" }] }],
    "session-1",
    [{ id: "queue-1" }, { id: "queue-2" }]
  ), true);
  assert.strictEqual(mockState.pendingSubmissionScrollIntent, null);
  assert.strictEqual(mockState.userScrolledUp, false);
});

test("queued-item edits do not create submission scroll intent", () => {
  const submitStart = main.indexOf("function submit()");
  const submitEnd = main.indexOf("\n}\n\nwindow.addEventListener", submitStart) + 2;
  const submitBody = main.slice(submitStart, submitEnd);
  const editBranch = submitBody.slice(submitBody.indexOf("if (state.editingQueueId)"), submitBody.indexOf("state.pendingSubmissionScrollIntent"));
  assert.match(editBranch, /type: "queueEdit"/);
  assert.match(editBranch, /return;/);
  assert.doesNotMatch(editBranch, /pendingSubmissionScrollIntent/);
});

test("Todo is centered above Queue and expands upward", () => {
  assert.match(main, /\$\{plan \? renderTodosCapsule\(plan\) : ""\}[\s\S]{0,100}\$\{renderQueue\(\)\}/);
  assert.match(styles, /\.todos-wrap\s*\{[^}]*margin(?:-left|-right)?:\s*(?:0\s+)?auto/);
  assert.match(styles, /\.todos-dropdown\s*\{[^}]*left:\s*50%[^}]*transform:\s*translateX\(-50%\)/);
  assert.match(main, /message\.type === "planUpdate"[\s\S]{0,260}assistant\.plan = message\.plan \|\| \[\][\s\S]{0,120}renderLiveRegions\(\)/);
});

test("Todo uses a thin aligned chevron and the composer accent for active indicators", () => {
  assert.match(main, /todoChevron:[^\n]*stroke-width="1\.25"/);
  assert.match(main, /\$\{icons\.todoChevron\}/);
  assert.match(styles, /\.todos-chevron\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/);
  assert.match(styles, /\.todos-chevron \.icon\s*\{[^}]*display:\s*block/);
  assert.match(styles, /\.todos-spinner\s*\{[^}]*border-top-color:\s*var\(--ha-accent\)/);
  assert.match(styles, /\.todos-status\.running\s*\{[^}]*color:\s*var\(--ha-accent\)/);
});

test("overflowing user messages expand persistently and collapse explicitly", () => {
  assert.match(main, /expandedUserMessages:\s*\{\}/);
  assert.match(main, /state\.expandedUserMessages\[messageKey\]/);
  assert.match(main, /question-collapse/);
  assert.match(main, /event\.stopPropagation\(\)[\s\S]{0,180}delete state\.expandedUserMessages/);
  assert.match(styles, /\.question-frame\.expanded\s*\{[^}]*max-height:\s*none[^}]*overflow:\s*visible/);
  assert.match(styles, /\.question-collapse\s*\{/);
});

test("terminal assistant statuses are not restricted to the latest assistant message", () => {
  const statusFunction = main.match(/function answerStatusLine\([\s\S]*?\n\}/)?.[0] || "";
  assert.ok(statusFunction.indexOf('message.status === "stopped"') < statusFunction.indexOf("laterAssistant"));
  assert.ok(statusFunction.indexOf('message.status === "failed"') < statusFunction.indexOf("laterAssistant"));
  assert.match(statusFunction, /message\.status === "stopped"[\s\S]*Interrupted/);
  assert.match(statusFunction, /message\.status === "failed"[\s\S]*Tool Interrupted/);
});

test("active input sends while an empty active composer stops", () => {
  assert.match(main, /if \(state\.running && !canSubmit\(\)\)/);
  assert.match(main, /vscode\.postMessage\(\{ type: "stop" \}\)/);
  assert.match(main, /vscode\.postMessage\(\{ type: "sendPrompt", \.\.\.payload \}\)/);
});

test("steered messages render chronologically without a success toast", () => {
  assert.match(main, /message\.steer \? `<div class="question-meta">Steered<\/div>`/);
  assert.match(main, /message\.status === "continued"[\s\S]{0,120}\? "Continued"/);
  assert.doesNotMatch(main, /Steer (sent|submitted|success)/i);
});

test("title input clicks retain native caret movement", () => {
  assert.match(main, /event\.target\.closest\("#titleInput"\) \|\| state\.titleEditing/);
  assert.match(main, /#titleInput"\)\?\.addEventListener\("click", event => event\.stopPropagation\(\)\)/);
  assert.doesNotMatch(main, /titleInput[\s\S]{0,500}\.select\(\)/);
  assert.match(main, /#titleInput"\)\?\.addEventListener\("blur",/);
});

test("manual titles are visibly marked in the top bar and session history", () => {
  assert.match(main, /function manualTitleMarker\(session\)/);
  assert.match(main, /session\?\.titleOrigin !== "manual"/);
  assert.match(main, /title="Manually edited in VS Code"/);
  assert.match(main, /<span class="title-text">\$\{renderedTitle\(session\)\}<\/span>/);
  assert.match(main, /class="history-name">/);
  assert.match(main, /manualTitleMarker\(active \|\| session\)/);
  assert.match(styles, /\.title-origin-marker\s*\{/);
});

test("history search refreshes results without replacing the focused input", () => {
  assert.match(main, /function refreshHistoryResults\(\)/);
  assert.match(main, /list\.innerHTML = renderHistoryItems\(\)/);
  const start = main.indexOf('document.querySelector("#historySearch")?.addEventListener("input"');
  const end = main.indexOf("bindHistoryItems();", start);
  const handler = main.slice(start, end);
  assert.match(handler, /refreshHistoryResults\(\)/);
  assert.doesNotMatch(handler, /render\(\)/);
});

test("local Working actions use one basename link and URLs use one complete link", () => {
  assert.match(main, /renderActionDescription\(action, description\)/);
  assert.match(main, /function renderActionFileLink\(/);
  assert.match(main, /data-path=.*pathDisplayName/);
  assert.match(main, /https\?:\\\/\\\//);
  assert.match(main, /\^\(\?:Read\|Edit\|Write\|Create\|Delete\)\$/);
  assert.doesNotMatch(main, /Read\|Edit\|Write\|Create\|Delete[\s\S]{0,120}\[A-Za-z\]:/);
  assert.match(styles, /\.action-path\s*\{[^}]*color:\s*inherit/);
  assert.match(styles, /\.action-path:hover\s*\{[^}]*text-decoration:\s*underline/);
});

test("Action dots are static while Working animations remain", () => {
  const runningDot = styles.match(/\.timeline-dot\.running\s*\{[^}]*\}/)?.[0] || "";
  assert.match(runningDot, /background:\s*var\(--ha-accent\)/);
  assert.doesNotMatch(runningDot, /animation/);
  assert.doesNotMatch(styles, /@keyframes\s+actionDotPulse/);
  assert.match(styles, /@keyframes\s+workingDot/);
  assert.match(styles, /@keyframes\s+workingDotChar/);
});

test("code actions keep source and optional output in the expandable detail", () => {
  assert.match(main, /function renderActionDetail\(/);
  assert.match(main, /executionAction/);
  assert.match(main, /code && result[\s\S]{0,160}renderIOTable/);
  assert.match(main, /code[\s\S]{0,160}renderCodeBlock/);
  assert.doesNotMatch(main, /renderIOTable\(code, result\) : ""/);
});

test("natural action details stay unframed while structured output uses a detail card", () => {
  assert.match(main, /function isStructuredActionDetail\(/);
  assert.match(main, /class="action-detail-text"/);
  assert.match(main, /renderCodeBlock\(result, "action-detail-card action-result"\)/);
  assert.match(styles, /\.action-detail-text\s*\{[^}]*color:\s*var\(--ha-fg-secondary\)/);
  assert.match(styles, /\.action-detail-card\s*\{[^}]*color:\s*var\(--ha-fg-primary\)/);
});

test("Working keeps a stable label with sequential dots and a return-to-latest control", () => {
  assert.match(main, /working-label">Working<\/span>/);
  assert.match(main, /working-ellipsis[\s\S]{0,160}working-dot-char/);
  assert.match(main, /id="jumpToLatest"/);
  assert.match(main, /function updateJumpToLatest\(/);
  assert.match(styles, /\.working-dot-char:nth-child\(2\)/);
  assert.match(styles, /\.working-dot-char:nth-child\(3\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("action summaries stay on one line and preserve adjacent controls", () => {
  assert.match(styles, /\.step-summary\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/);
  assert.match(styles, /\.step-content-main\s*\{[^}]*min-width:\s*0/);
  assert.match(styles, /\.step-caret\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(styles, /\.timeline-dot\.running/);
});

test("genuine questions render as an expandable AskUserQuestion record", () => {
  assert.match(main, /AskUserQuestion/);
  assert.match(main, /<span>Q:<\/span><p>\$\{h\(step\.question/);
  assert.match(main, /<span>A:<\/span><p>\$\{h\(step\.answer/);
});

test("compact confirmation Diff renders only changed whole lines", () => {
  assert.match(main, /p\.diff \? renderDiff\(p\.diff\) : ""/);
  assert.match(main, /diff\.oldLines/);
  assert.match(main, /diff\.newLines/);
  assert.match(main, /diff-line diff-del/);
  assert.match(main, /diff-line diff-add/);
  assert.match(styles, /\.diff-del, \.diff-line\.diff-del\s*\{[^}]*text-decoration:\s*none/);
});

test("assistant document links use an isolated open message", () => {
  assert.match(main, /a\[data-doc-path\]/);
  assert.match(main, /type: "openGeneratedDocument", path: filePath/);
});

test("only the current running Thinking detail is capped to ten lines", () => {
  assert.match(main, /thinking-step-running/);
  assert.match(main, /step\.kind === "thinking"[\s\S]{0,180}index === lastIndex[\s\S]{0,180}!step\.finalized/);
  assert.match(main, /querySelectorAll\("\.step-content\.thinking-step-running:not\(\.collapsed\)"\)/);
  assert.match(styles, /\.step-content\.thinking-step-running:not\(\.collapsed\)\s*\{[^}]*max-height:\s*calc\(1\.55em \* 10\)/);
  assert.match(styles, /\.step-content\.thinking-step-running\.has-top-overflow/);
  assert.doesNotMatch(styles, /\.thinking\.thinking-running:not\(\.collapsed\)[^{]*\{[^}]*max-height/);
});

test("conversation content cannot widen the page", () => {
  assert.match(styles, /overflow-x:\s*hidden/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.message\.user\s*\{[^}]*min-width:\s*0/);
  assert.match(styles, /\.composer-wrap::after\s*\{[^}]*left:\s*clamp\(-21px, -5vw, -8px\)[^}]*right:\s*clamp\(-21px, -5vw, -8px\)/);
});

test("answer tables expand fully without nested scrolling", () => {
  const match = styles.match(/\.table-wrap\s*\{([^}]*)\}/);
  assert.ok(match);
  assert.doesNotMatch(match[1], /max-height|overflow/);
  assert.match(match[1], /max-width:\s*100%/);
});

test("conversation colors use semantic VS Code theme roles", () => {
  assert.match(styles, /--ha-fg-primary:\s*var\(--vscode-editor-foreground/);
  assert.match(styles, /--ha-link:\s*var\(--vscode-textLink-foreground/);
  assert.match(styles, /--ha-button-bg:\s*var\(--vscode-button-background/);
  assert.match(styles, /--ha-success:\s*var\(--vscode-testing-iconPassed/);
  assert.match(styles, /--ha-diff-add-bg:\s*color-mix\(in srgb, var\(--vscode-diffEditor-insertedTextBackground/);
  assert.match(styles, /\.answer\s*\{[^}]*color:\s*var\(--ha-fg-primary\)[^}]*opacity:\s*1/);
  assert.match(styles, /\.message\.user \.bubble\s*\{[^}]*color-mix\(in srgb, var\(--ha-focus\) 22%, var\(--bg\)\)[^}]*border-color:\s*transparent/);
  assert.doesNotMatch(styles, /\.message\.user:not\(\.latest-user\) \.bubble\s*\{[^}]*opacity:/);
  assert.match(styles, /\.question-skill\s*\{[^}]*color:\s*var\(--ha-accent\)/);
});

test("high contrast themes use an explicit contrast border", () => {
  assert.match(styles, /body\.vscode-high-contrast[\s\S]*--ha-border:\s*var\(--vscode-contrastBorder/);
  assert.match(styles, /body\.vscode-high-contrast-light[\s\S]*--ha-border-soft:\s*var\(--vscode-contrastBorder/);
  assert.match(styles, /body\.vscode-high-contrast \.message\.user \.bubble[\s\S]*border-color:\s*var\(--vscode-contrastBorder/);
});

test("Run settings uses one editable Model combobox and a root overlay", () => {
  assert.doesNotMatch(main, /id="resetMode"/);
  assert.match(main, /class="mode-panel-content"/);
  assert.match(main, /<div class="model-field">[\s\S]*<span[^>]*>Model<\/span>[\s\S]*id="modelPickerInput"/);
  assert.match(main, /id="modelPickerInput"[^>]*role="combobox"[^>]*aria-autocomplete="list"[^>]*aria-controls="modelList"[^>]*aria-expanded=/);
  assert.strictEqual((main.match(/id="modelPickerInput"/g) || []).length, 1);
  assert.doesNotMatch(main, /id="modelSearch"|class="model-search"/);
  assert.match(main, /function ensureSettingsOverlayRoot\(/);
  assert.match(main, /document\.body\.appendChild\(root\)/);
  assert.match(main, /id = "settingsOverlayRoot"/);
  assert.match(main, /function renderModelOverlay\(/);
  assert.match(main, /No matching models/);
  assert.match(main, /HermesModelPicker\.filterModels/);
  assert.match(main, /HermesModelPicker\.nextSelectableIndex/);
  assert.match(main, /document\.querySelector\("\.model-combobox"\)\?\.addEventListener\("click"[\s\S]{0,180}modelInput\?\.focus\(\)[\s\S]{0,100}openModelPicker\(\)/);
  assert.match(main, /function closeModelPicker\(/);
  assert.match(main, /function positionOpenPicker\(/);
  assert.match(main, /getBoundingClientRect\(\)/);
  assert.match(main, /HermesModelPicker\.calculateOverlayPlacement/);
  assert.match(main, /requestAnimationFrame\(positionOpenPicker\)/);
  assert.match(main, /state\.settings\.reasoningEffortSupported[\s\S]*class="effort-field"[\s\S]*id="effortPickerButton"/);
  assert.match(main, /ArrowUp/);
  assert.match(main, /ArrowDown/);
  assert.match(main, /Enter/);
  assert.match(main, /Escape/);
  assert.match(main, /Low[\s\S]*Medium[\s\S]*High[\s\S]*Extra High[\s\S]*Max[\s\S]*Ultra/);
  assert.doesNotMatch(main, /Update Hermes to configure reasoning effort/);
  assert.doesNotMatch(main, /class="effort-picker"/);
  assert.match(main, /type:\s*"refreshModels"/);
  assert.match(main, /Refresh models/);
  assert.match(main, /Refreshing…/);
  assert.match(main, /Refreshed/);
  assert.match(main, /Failed/);
  assert.match(main, /Unavailable/);
  assert.match(styles, /#settingsOverlayRoot\s*\{[^}]*position:\s*fixed[^}]*pointer-events:\s*none/);
  assert.match(styles, /\.model-list\s*\{[^}]*position:\s*fixed/);
  assert.match(styles, /\.effort-list\s*\{[^}]*position:\s*fixed/);
  assert.doesNotMatch(styles, /#modePopover\s*\{[^}]*height:\s*min\(468px/);
  assert.doesNotMatch(styles, /\.model-list, \.effort-list\s*\{[^}]*bottom:\s*50px/);
  assert.match(styles, /\.mode-panel-content\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(styles, /\.model-combobox\s*\{[^}]*width:\s*100%/);
  assert.match(styles, /\.model-combobox \.dropdown-icon\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/);
  assert.match(main, /\["Manual", "Auto"\]/);
  assert.match(main, /Always ask for approval before making each edit\./);
  assert.match(main, /Only ask for approval when actions detected as potentially unsafe\./);
});

test("Refresh closes transient Run settings lists before requesting models", () => {
  const start = main.indexOf('document.querySelector("#refreshModels")');
  const end = main.indexOf("\n  const prompt", start);
  const handler = main.slice(start, end);
  assert.match(handler, /closeModelPicker\(/);
  assert.match(handler, /state\.effortPickerOpen = false/);
  assert.ok(handler.indexOf("closeModelPicker(") < handler.indexOf('vscode.postMessage({ type: "refreshModels" })'));
  assert.ok(handler.indexOf("state.effortPickerOpen = false") < handler.indexOf('vscode.postMessage({ type: "refreshModels" })'));
});

test("typing and dismissing Model never send a settings change", () => {
  const inputStart = main.indexOf('modelInput?.addEventListener("input"');
  const inputEnd = main.indexOf('modelInput?.addEventListener("keydown"', inputStart);
  const inputHandler = main.slice(inputStart, inputEnd);
  assert.match(inputHandler, /state\.modelQuery = event\.currentTarget\.value/);
  assert.match(inputHandler, /renderModelOverlay\(\)/);
  assert.doesNotMatch(inputHandler, /settingsChanged|vscode\.postMessage/);

  const closeStart = main.indexOf("function closeModelPicker(");
  const closeEnd = main.indexOf("\nfunction selectModel(", closeStart);
  const close = main.slice(closeStart, closeEnd);
  assert.match(close, /state\.modelFilterActive = false/);
  assert.match(close, /state\.modelQuery = ""/);
  assert.doesNotMatch(close, /settingsChanged|vscode\.postMessage/);
  assert.match(main, /state\.modelPickerOpen && !event\.target\.closest\("\.model-combobox, #modelList"\)[\s\S]{0,100}closeModelPicker\(\)/);
});

test("Model selection preserves Mode and sends one existing settings change", () => {
  const selectStart = main.indexOf("function selectModel(");
  const selectEnd = main.indexOf("\nfunction selectReasoningEffort(", selectStart);
  const select = main.slice(selectStart, selectEnd);
  assert.match(select, /if \(!selected \|\| selected\.unavailable\) return/);
  assert.strictEqual((select.match(/settingsChanged\(\)/g) || []).length, 1);
  assert.doesNotMatch(select, /state\.settings\.mode\s*=/);

  const modeBlock = main.slice(main.indexOf('document.querySelectorAll(".approval-option")'), main.indexOf('const modelInput = document.querySelector("#modelPickerInput")'));
  assert.match(modeBlock, /state\.settings\.mode = button\.dataset\.mode/);
  assert.match(modeBlock, /settingsChanged\(\)/);
});

test("state refresh preserves an active title or history rename editor", () => {
  assert.match(main, /function captureRenameFocus\(/);
  assert.match(main, /function restoreRenameFocus\(/);

  const stateStart = main.indexOf('if (message.type === "state")');
  const stateEnd = main.indexOf('if (message.type === "editorContext")', stateStart);
  const stateHandler = main.slice(stateStart, stateEnd);
  assert.match(stateHandler, /const renameFocus = captureRenameFocus\(\)/);
  assert.match(stateHandler, /state\.renamingSessionId && !state\.sessions\.some\(session => session\.id === state\.renamingSessionId\)/);
  assert.match(stateHandler, /restoreRenameFocus\(renameFocus\)/);
  assert.doesNotMatch(stateHandler, /if \(needsFullRender\) \{\s*state\.renamingSessionId = null/);
});
