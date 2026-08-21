"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_NODE_MODULE) candidates.push(process.env.PLAYWRIGHT_NODE_MODULE);
  candidates.push("playwright");
  const npxRoot = path.join(os.homedir(), ".npm", "_npx");
  if (fs.existsSync(npxRoot)) {
    for (const directory of fs.readdirSync(npxRoot)) {
      candidates.push(path.join(npxRoot, directory, "node_modules", "playwright"));
    }
  }
  for (const candidate of candidates) {
    try {
      const playwright = require(candidate);
      if (playwright.chromium && fs.existsSync(playwright.chromium.executablePath())) return playwright;
    } catch {
      // Try the next local Playwright installation.
    }
  }
  throw new Error("A Playwright installation with a downloaded Chromium was not found. Set PLAYWRIGHT_NODE_MODULE to its module directory.");
}

const { chromium } = loadPlaywright();

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
    const harness = path.join(__dirname, "fixtures", "webview-harness.html");
    const artifacts = path.join(__dirname, "artifacts");
    fs.mkdirSync(artifacts, { recursive: true });
    await page.goto(`file://${harness}`);
    await page.waitForSelector(".queue-panel");

    await page.evaluate(() => {
      window.__statePayload.sessions.push({
        id: "session-archive",
        title: "Archived release notes",
        createdAt: Date.now() - 60000,
        updatedAt: Date.now() - 60000,
        messages: []
      });
      window.__dispatchState();
    });
    await page.click("#historyBtn");
    await page.click("#historySearch");
    await page.keyboard.type("archive");
    assert.strictEqual(await page.locator("#historySearch").inputValue(), "archive");
    assert.ok(await page.locator("#historySearch").evaluate(node => node === document.activeElement));
    assert.strictEqual(await page.locator(".history-item").count(), 1);
    await page.click("#historyBtn");

    assert.strictEqual(await page.locator(".working-status.interrupted").count(), 1);
    assert.ok(await page.evaluate(() => Boolean(document.querySelector(".todos-wrap").compareDocumentPosition(document.querySelector(".queue-panel")) & Node.DOCUMENT_POSITION_FOLLOWING)));

    const promptBeforeStream = await page.locator("#prompt").elementHandle();
    const queueBeforeStream = await page.locator(".queue-list").elementHandle();
    const queueScrollBeforeStream = await page.locator(".queue-list").evaluate(node => {
      node.scrollTop = 48;
      return node.scrollTop;
    });
    await page.locator("#prompt").click();
    await page.keyboard.type("draft stays focused");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    const caretBeforeStream = await page.evaluate(() => window.getSelection()?.anchorOffset);
    await page.evaluate(() => {
      window.__statePayload.sessions[0].messages.at(-1).thinking[0].text += " Streaming update.";
      window.__dispatchState();
    });
    const promptAfterStream = await page.locator("#prompt").elementHandle();
    assert.ok(await promptBeforeStream.evaluate((node, next) => node === next, promptAfterStream));
    assert.ok(await queueBeforeStream.evaluate((node, next) => node === next, await page.locator(".queue-list").elementHandle()));
    assert.strictEqual(await page.locator(".queue-list").evaluate(node => node.scrollTop), queueScrollBeforeStream);
    assert.strictEqual(await page.locator("#prompt").innerText(), "draft stays focused");
    assert.ok(await page.locator("#prompt").evaluate(node => node === document.activeElement));
    assert.strictEqual(await page.evaluate(() => window.getSelection()?.anchorOffset), caretBeforeStream);
    const headerBeforeAnimationStream = await page.locator('[data-message-id="assistant-1"] .thinking-toggle').elementHandle();
    const footerBeforeAnimationStream = await page.locator('[data-message-id="assistant-1"] .working-status.working').elementHandle();
    await page.evaluate(() => {
      const assistant = window.__statePayload.sessions[0].messages.find(message => message.id === "assistant-1");
      assistant.thinking.push({
        kind: "tool",
        toolCallId: "stream-action-1",
        action: "Read",
        description: "/workspace/stream.md",
        status: "running",
        done: false
      });
      window.__dispatchState();
    });
    const actionDotBeforeStream = await page.locator('[data-message-id="assistant-1"] [data-live-key="tool:stream-action-1"] .timeline-dot').elementHandle();
    assert.strictEqual(await actionDotBeforeStream.evaluate(node => node.getAnimations().length), 0);
    assert.ok(await headerBeforeAnimationStream.evaluate(node => node.getAnimations({ subtree: true }).length > 0));
    assert.ok(await footerBeforeAnimationStream.evaluate(node => node.getAnimations({ subtree: true }).length > 0));
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      const assistant = window.__statePayload.sessions[0].messages.find(message => message.id === "assistant-1");
      assistant.text += "Streaming answer content.";
      assistant.thinking.at(-1).detail = "First streamed detail.";
      window.__dispatchState();
      assistant.text += " More content.";
      assistant.thinking.at(-1).detail = "Second streamed detail.";
      window.__dispatchState();
    });
    assert.ok(await headerBeforeAnimationStream.evaluate((node, next) => node === next, await page.locator('[data-message-id="assistant-1"] .thinking-toggle').elementHandle()));
    assert.ok(await footerBeforeAnimationStream.evaluate((node, next) => node === next, await page.locator('[data-message-id="assistant-1"] .working-status.working').elementHandle()));
    assert.ok(await actionDotBeforeStream.evaluate(node => node.isConnected));
    assert.strictEqual(await actionDotBeforeStream.evaluate(node => node.getAnimations().length), 0);
    await page.evaluate(() => {
      window.__dispatchState();
      window.__dispatchState();
      window.__messages.length = 0;
    });
    await page.click('.queue-row[data-queue-id="queue-1"] [data-action="steer"]');
    const queuedSteerMessages = await page.evaluate(() => window.__messages.filter(message => message.type === "queueSteer" && message.id === "queue-1"));
    assert.strictEqual(queuedSteerMessages.length, 1);
    await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { data: {
      type: "planUpdate",
      messageId: "assistant-1",
      plan: [
        { content: "Preserve Interrupted", status: "completed" },
        { content: "Keep prompt DOM stable", status: "in_progress" },
        { content: "Center Todo", status: "pending" },
        { content: "Run smoke", status: "pending" }
      ]
    } })));
    assert.ok(await promptBeforeStream.evaluate((node, next) => node === next, await page.locator("#prompt").elementHandle()));
    assert.strictEqual((await page.locator("#todosCapsule").innerText()).replace(/\s+/g, " ").trim(), "Todos 1/4");
    const centeredTodo = await page.evaluate(() => {
      const accessories = document.querySelector("#composerAccessories").getBoundingClientRect();
      const capsule = document.querySelector("#todosCapsule").getBoundingClientRect();
      return Math.abs((accessories.left + accessories.width / 2) - (capsule.left + capsule.width / 2));
    });
    assert.ok(centeredTodo < 1, String(centeredTodo));
    const closedTodoAlignment = await page.evaluate(() => {
      const label = document.querySelector(".todos-label").getBoundingClientRect();
      const chevron = document.querySelector(".todos-chevron").getBoundingClientRect();
      return Math.abs((label.top + label.height / 2) - (chevron.top + chevron.height / 2));
    });
    assert.ok(closedTodoAlignment < 1, String(closedTodoAlignment));
    await page.click("#todosCapsule");
    assert.ok(await page.locator(".todos-dropdown").isVisible());
    const openTodoAlignment = await page.evaluate(() => {
      const label = document.querySelector(".todos-label").getBoundingClientRect();
      const chevron = document.querySelector(".todos-chevron").getBoundingClientRect();
      return Math.abs((label.top + label.height / 2) - (chevron.top + chevron.height / 2));
    });
    assert.ok(openTodoAlignment < 1, String(openTodoAlignment));
    const runningTodoColor = await page.locator(".todos-status.running").evaluate(node => getComputedStyle(node).color);
    const todoQueueOverlap = await page.evaluate(() => {
      const todo = document.querySelector(".todos-dropdown").getBoundingClientRect();
      const queue = document.querySelector(".queue-panel").getBoundingClientRect();
      return Math.max(0, Math.min(todo.bottom, queue.bottom) - Math.max(todo.top, queue.top));
    });
    assert.strictEqual(todoQueueOverlap, 0);
    await page.click("#todosCapsule");
    await page.locator("#prompt").click();
    const accentColors = await page.evaluate(() => ({
      composer: getComputedStyle(document.querySelector(".composer")).borderTopColor,
      command: getComputedStyle(document.querySelector('[data-message-id="user-long"] .question-skill')).color,
      spinner: getComputedStyle(document.querySelector(".todos-spinner")).borderTopColor
    }));
    assert.strictEqual(accentColors.command, accentColors.composer);
    assert.strictEqual(accentColors.spinner, accentColors.composer);
    assert.strictEqual(runningTodoColor, accentColors.composer);

    const longMessage = page.locator('[data-message-id="user-long"]');
    await page.waitForFunction(() => document.querySelector('[data-message-id="user-long"] .question-frame')?.classList.contains("fade-overflow"));
    const collapsedHeight = await longMessage.locator(".question-frame").evaluate(node => node.getBoundingClientRect().height);
    await longMessage.locator(".bubble").click();
    assert.ok(await longMessage.locator(".question-frame").evaluate(node => node.classList.contains("expanded")));
    assert.ok(await longMessage.locator(".question-collapse").isVisible());
    const expandedThreadLayout = await page.evaluate(() => {
      const thread = document.querySelector(".thread");
      const threadRect = thread.getBoundingClientRect();
      return {
        threadWidth: threadRect.width,
        columnWidth: Number.parseFloat(getComputedStyle(thread).gridTemplateColumns),
        overflowingItems: [...thread.children].filter(child => {
          const rect = child.getBoundingClientRect();
          return rect.left < threadRect.left - 0.5 || rect.right > threadRect.right + 0.5;
        }).length
      };
    });
    assert.ok(expandedThreadLayout.columnWidth <= expandedThreadLayout.threadWidth + 0.5, JSON.stringify(expandedThreadLayout));
    assert.strictEqual(expandedThreadLayout.overflowingItems, 0, JSON.stringify(expandedThreadLayout));
    const expandedHeight = await longMessage.locator(".question-frame").evaluate(node => node.getBoundingClientRect().height);
    assert.ok(expandedHeight > collapsedHeight, `${expandedHeight} <= ${collapsedHeight}`);
    await page.evaluate(() => {
      window.__statePayload.sessions[0].messages.at(-1).thinking[0].text += " Keep expanded.";
      window.__dispatchState();
    });
    assert.ok(await page.locator('[data-message-id="user-long"] .question-frame').evaluate(node => node.classList.contains("expanded")));
    await page.click('[data-message-id="user-long"] .question-collapse');
    await page.waitForFunction(() => document.querySelector('[data-message-id="user-long"] .question-frame')?.classList.contains("fade-overflow"));
    assert.ok(!await page.locator('[data-message-id="user-long"] .question-frame').evaluate(node => node.classList.contains("expanded")));
    await page.locator("#prompt").evaluate(node => {
      node.textContent = "";
      node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));
    });
    await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { data: {
      type: "localPicked",
      attachments: [
        { name: "composer-architecture-overview.md", path: "/workspace/composer-architecture-overview.md", uri: "file:///workspace/composer-architecture-overview.md", type: "file" },
        { name: "composer-interaction-specification.md", path: "/workspace/composer-interaction-specification.md", uri: "file:///workspace/composer-interaction-specification.md", type: "file" },
        { name: "composer-responsive-validation.md", path: "/workspace/composer-responsive-validation.md", uri: "file:///workspace/composer-responsive-validation.md", type: "file" },
        { name: "composer-release-checklist.md", path: "/workspace/composer-release-checklist.md", uri: "file:///workspace/composer-release-checklist.md", type: "file" }
      ]
    } })));

    const attachmentRows = await page.evaluate(() => {
      const inspect = selector => {
        const row = document.querySelector(selector);
        const tops = [...row.children].map(child => child.getBoundingClientRect().top);
        const style = getComputedStyle(row);
        return {
          flexWrap: style.flexWrap,
          overflowX: style.overflowX,
          scrolls: row.scrollWidth > row.clientWidth,
          singleRow: Math.max(...tops) - Math.min(...tops) < 1
        };
      };
      return {
        composer: inspect(".composer-top"),
        sent: inspect('[data-message-id="user-1"] .attachments')
      };
    });
    assert.deepStrictEqual(attachmentRows.composer, { flexWrap: "nowrap", overflowX: "auto", scrolls: true, singleRow: true });
    assert.deepStrictEqual(attachmentRows.sent, { flexWrap: "nowrap", overflowX: "auto", scrolls: true, singleRow: true });

    const narrow = await page.evaluate(() => {
      const list = document.querySelector(".queue-list");
      const prompt = document.querySelector("#prompt");
      const viewportWidth = document.documentElement.clientWidth;
      const thread = document.querySelector(".thread");
      const threadRect = thread.getBoundingClientRect();
      const threadColumnWidth = Number.parseFloat(getComputedStyle(thread).gridTemplateColumns);
      const overflowingThreadItems = [...thread.children].map(child => {
        const rect = child.getBoundingClientRect();
        return { className: child.className, left: rect.left, right: rect.right, width: rect.width };
      }).filter(rect => rect.left < threadRect.left - 0.5 || rect.right > threadRect.right + 0.5);
      return {
        bodyWidth: document.body.scrollWidth,
        viewportWidth,
        threadWidth: threadRect.width,
        threadColumnWidth,
        overflowingThreadItems,
        queueClientHeight: list.clientHeight,
        queueScrollHeight: list.scrollHeight,
        promptHeight: prompt.getBoundingClientRect().height
      };
    });
    assert.ok(narrow.bodyWidth <= narrow.viewportWidth, JSON.stringify(narrow));
    assert.ok(narrow.threadColumnWidth <= narrow.threadWidth + 0.5, JSON.stringify(narrow));
    assert.deepStrictEqual(narrow.overflowingThreadItems, [], JSON.stringify(narrow));
    assert.ok(narrow.queueClientHeight <= 191 && narrow.queueScrollHeight > narrow.queueClientHeight, JSON.stringify(narrow));
    assert.ok(narrow.promptHeight >= 60, JSON.stringify(narrow));

    await page.click("#modeBtn");
    assert.ok(await page.locator("#modePopover.open").isVisible());
    assert.strictEqual(await page.locator(".approval-option").count(), 2);
    assert.strictEqual(await page.locator(".effort-field").count(), 0);
    const naturalSettingsHeight = await page.locator("#modePopover").evaluate(node => node.getBoundingClientRect().height);
    assert.ok(naturalSettingsHeight < 468, String(naturalSettingsHeight));

    await page.evaluate(() => { window.__messages.length = 0; });
    await page.click(".model-combobox .dropdown-icon");
    assert.ok(await page.locator("#modelList").isVisible());
    assert.strictEqual((await page.evaluate(() => window.__messages.filter(message => message.type === "settingsChanged").length)), 0);
    await page.keyboard.press("Escape");

    await page.click("#modelPickerInput");
    assert.ok(await page.locator("#modelList").isVisible());
    assert.strictEqual(await page.locator("#settingsOverlayRoot > #modelList").count(), 1);
    await page.locator("#modelPickerInput").press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.locator("#modelPickerInput").fill("Anthropic");
    assert.strictEqual(await page.locator("#modelList .model-option").count(), 1);
    const attachedModelList = await page.evaluate(() => {
      const trigger = document.querySelector(".model-combobox").getBoundingClientRect();
      const list = document.querySelector("#modelList").getBoundingClientRect();
      const direction = document.querySelector("#modelList").classList.contains("opens-up") ? "up" : "down";
      return {
        direction,
        gap: direction === "up" ? Math.abs(list.bottom - trigger.top) : Math.abs(list.top - trigger.bottom),
        insideViewport: list.top >= 0 && list.bottom <= window.innerHeight,
        triggerVisible: list.bottom <= trigger.top || list.top >= trigger.bottom
      };
    });
    assert.ok(attachedModelList.gap < 0.5, JSON.stringify(attachedModelList));
    assert.ok(attachedModelList.insideViewport, JSON.stringify(attachedModelList));
    assert.ok(attachedModelList.triggerVisible, JSON.stringify(attachedModelList));

    await page.keyboard.press("Escape");
    assert.strictEqual(await page.locator("#modelPickerInput").inputValue(), "GPT-5.6 Codex");
    assert.strictEqual((await page.evaluate(() => window.__messages.filter(message => message.type === "settingsChanged").length)), 0);

    await page.click("#modelPickerInput");
    await page.locator("#modelPickerInput").fill("DeepSeek");
    await page.click(".modes-title");
    assert.strictEqual(await page.locator("#modelList").count(), 0);
    assert.strictEqual(await page.locator("#modelPickerInput").inputValue(), "GPT-5.6 Codex");
    assert.strictEqual((await page.evaluate(() => window.__messages.filter(message => message.type === "settingsChanged").length)), 0);

    await page.click("#modelPickerInput");
    await page.locator("#modelPickerInput").fill("Legacy");
    assert.strictEqual(await page.locator("#modelList .model-option.unavailable").count(), 1);
    await page.keyboard.press("Enter");
    assert.strictEqual((await page.evaluate(() => window.__messages.filter(message => message.type === "settingsChanged").length)), 0);
    await page.keyboard.press("Escape");

    await page.evaluate(() => { window.__messages.length = 0; });
    await page.click("#modelPickerInput");
    await page.locator("#modelPickerInput").fill("Anthropic");
    await page.click("#modelList .model-option-main");
    const clickSettings = await page.evaluate(() => window.__messages.filter(message => message.type === "settingsChanged"));
    assert.strictEqual(clickSettings.length, 1);
    assert.strictEqual(clickSettings[0].settings.model, "anthropic:claude-sonnet-4");
    assert.strictEqual(clickSettings[0].settings.mode, "Manual");
    assert.strictEqual(await page.locator(".approval-option").count(), 2);
    assert.strictEqual((await page.locator(".approval-option.active strong").innerText()).trim(), "Manual");

    await page.evaluate(() => { window.__messages.length = 0; });
    await page.click("#modelPickerInput");
    await page.locator("#modelPickerInput").fill("Google");
    await page.keyboard.press("Enter");
    const enterSettings = await page.evaluate(() => window.__messages.filter(message => message.type === "settingsChanged"));
    assert.strictEqual(enterSettings.length, 1);
    assert.strictEqual(enterSettings[0].settings.model, "google:gemini-2.5-pro");
    assert.strictEqual(enterSettings[0].settings.mode, "Manual");

    await page.evaluate(() => { window.__messages.length = 0; });
    await page.click("#modelPickerInput");
    await page.locator("#modelPickerInput").fill("Qwen");
    await page.click("#refreshModels");
    assert.strictEqual(await page.locator("#modelList").count(), 0);
    assert.strictEqual((await page.evaluate(() => window.__messages.filter(message => message.type === "refreshModels").length)), 1);
    await page.click("#modelPickerInput");
    assert.strictEqual(await page.locator("#modelList .model-option").count(), 6);

    await page.setViewportSize({ width: 360, height: 430 });
    await page.waitForTimeout(20);
    const resizedModelList = await page.evaluate(() => {
      const trigger = document.querySelector(".model-combobox").getBoundingClientRect();
      const list = document.querySelector("#modelList").getBoundingClientRect();
      const direction = document.querySelector("#modelList").classList.contains("opens-up") ? "up" : "down";
      return {
        gap: direction === "up" ? Math.abs(list.bottom - trigger.top) : Math.abs(list.top - trigger.bottom),
        insideViewport: list.top >= 0 && list.bottom <= window.innerHeight,
        triggerVisible: list.bottom <= trigger.top || list.top >= trigger.bottom
      };
    });
    assert.ok(resizedModelList.gap < 0.5, JSON.stringify(resizedModelList));
    assert.ok(resizedModelList.insideViewport, JSON.stringify(resizedModelList));
    assert.ok(resizedModelList.triggerVisible, JSON.stringify(resizedModelList));
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 360, height: 780 });

    await page.evaluate(() => {
      window.__statePayload.settings.reasoningEffortSupported = true;
      window.__statePayload.settings.modelRefreshStatus = "idle";
      window.__dispatchState();
    });
    assert.strictEqual(await page.locator(".effort-field").count(), 1);
    const effortSettingsHeight = await page.locator("#modePopover").evaluate(node => node.getBoundingClientRect().height);
    const effortFieldHeight = await page.locator(".effort-field").evaluate(node => node.getBoundingClientRect().height);
    assert.ok(Math.abs((effortSettingsHeight - naturalSettingsHeight) - effortFieldHeight) < 1, JSON.stringify({ naturalSettingsHeight, effortSettingsHeight, effortFieldHeight }));
    await page.click("#effortPickerButton");
    assert.strictEqual(await page.locator("#settingsOverlayRoot > #effortList").count(), 1);
    assert.strictEqual(await page.locator("#effortList .effort-option").count(), 6);
    await page.keyboard.press("Escape");
    assert.strictEqual(await page.locator(".approval-option").count(), 2);
    assert.strictEqual((await page.locator(".approval-option.active strong").innerText()).trim(), "Manual");
    await page.screenshot({ path: path.join(artifacts, "webview-360.png"), fullPage: true });

  await page.click("#queueToggle");
  assert.strictEqual(await page.locator(".queue-list").isVisible(), false);
  await page.click("#queueToggle");

  const prompt = page.locator("#prompt");
  await prompt.click();
  await page.keyboard.type("/ste");
  await page.waitForSelector("#commandPopover.open .command-option");
  assert.ok((await page.locator("#commandPopover.open .command-option").count()) >= 1);
  await page.keyboard.type("er");
  await page.keyboard.press("Space");
  assert.strictEqual((await page.locator(".prompt-token").innerText()).trim(), "/steer");
  await page.keyboard.type("focus on errors");
  await page.click("#sendBtn");
  const steerMessage = await page.evaluate(() => window.__messages.find(message => message.type === "sendPrompt" && message.command === "/steer"));
  assert.ok(steerMessage);
  assert.strictEqual(steerMessage.prompt, "focus on errors");

  await prompt.click();
  await page.keyboard.type("line one");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("line two");
  await page.click("#sendBtn");
  const multilineMessage = await page.evaluate(() => window.__messages.find(message => message.type === "sendPrompt" && message.prompt?.includes("line one")));
  assert.ok(multilineMessage);
  assert.strictEqual(multilineMessage.prompt, "line one\nline two");

  await page.click('.queue-row[data-queue-id="queue-2"] [data-action="edit"]');
  assert.strictEqual((await page.locator(".prompt-token").innerText()).trim(), "/status");
  await page.keyboard.press("End");
  await page.keyboard.type(" revised");
  await page.click("#sendBtn");
  const editMessage = await page.evaluate(() => window.__messages.find(message => message.type === "queueEdit" && message.id === "queue-2"));
  assert.ok(editMessage);
  assert.ok(editMessage.item.prompt.endsWith("revised"));

  await page.setViewportSize({ width: 900, height: 800 });
  await page.screenshot({ path: path.join(artifacts, "webview-900.png"), fullPage: true });
  const wideOverflow = await page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
  assert.ok(wideOverflow <= 0, `wide overflow: ${wideOverflow}`);

  await page.evaluate(() => {
    const assistant = window.__statePayload.sessions[0].messages.find(message => message.id === "assistant-1");
    assistant.thinking = [
      ...Array.from({ length: 28 }, (_, index) => ({ kind: "note", text: `Progress line ${index + 1}: keep the conversation scroll position stable.`, finalized: true })),
      {
        kind: "tool",
        action: "Run command",
        description: "validate a deliberately long action title without moving the adjacent expand control outside the visible conversation width",
        status: "running",
        execution: true,
        code: "npm test",
        result: ""
      }
    ];
    window.__dispatchState();
  });
  const region = page.locator("#conversationRegion");
  await region.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await region.hover({ position: { x: 24, y: 24 }, force: true });
  await page.mouse.wheel(0, -600);
  await page.waitForFunction(() => document.querySelector("#jumpToLatest")?.classList.contains("visible"));
  const heldScrollTop = await region.evaluate(node => node.scrollTop);
  await page.evaluate(() => {
    const assistant = window.__statePayload.sessions[0].messages.find(message => message.id === "assistant-1");
    assistant.thinking[0].text += " Stream update.";
    window.__dispatchState();
  });
  assert.ok(Math.abs((await region.evaluate(node => node.scrollTop)) - heldScrollTop) <= 1);

  const longAction = page.locator(".tool-item .step-row").last();
  const actionLayout = await longAction.evaluate(node => {
    const summary = node.querySelector(".step-summary").getBoundingClientRect();
    const caret = node.querySelector(".step-caret").getBoundingClientRect();
    const row = node.getBoundingClientRect();
    return {
      summaryHeight: summary.height,
      lineHeight: Number.parseFloat(getComputedStyle(node.querySelector(".step-summary")).lineHeight),
      caretRight: caret.right,
      rowRight: row.right
    };
  });
  assert.ok(actionLayout.summaryHeight <= actionLayout.lineHeight + 1, JSON.stringify(actionLayout));
  assert.ok(actionLayout.caretRight <= actionLayout.rowRight + 0.5, JSON.stringify(actionLayout));
  if (await longAction.getAttribute("aria-expanded") !== "true") await longAction.click();
  assert.ok(await page.locator(".tool-item .action-detail-card").last().isVisible());

  const jumpHit = await page.evaluate(() => {
    const button = document.querySelector("#jumpToLatest");
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      button: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      hit: hit?.id || hit?.className || hit?.tagName,
      contained: button.contains(hit),
      pointerEvents: getComputedStyle(button).pointerEvents,
      zIndex: getComputedStyle(button).zIndex
    };
  });
  assert.ok(jumpHit.contained, JSON.stringify(jumpHit));
  await page.mouse.click(jumpHit.button.left + 6, (jumpHit.button.top + jumpHit.button.bottom) / 2);
  await page.waitForFunction(() => {
    const node = document.querySelector("#conversationRegion");
    return node.scrollHeight - node.scrollTop - node.clientHeight < 96;
  });

  // A new submission must override an old manual scroll position exactly
  // once, after the host acknowledges it with a genuinely new identity.
  await page.goto(`file://${harness}`);
  await page.waitForSelector("#conversationRegion");
  await page.evaluate(() => {
    const session = window.__statePayload.sessions[0];
    const previousAssistant = session.messages.find(message => message.id === "assistant-1");
    previousAssistant.status = "completed";
    previousAssistant.finishedAt = Date.now();
    for (let index = 0; index < 12; index += 1) {
      session.messages.push(
        { id: `scroll-user-${index}`, role: "user", text: `Earlier question ${index + 1}`, createdAt: Date.now() - 1000 + index },
        { id: `scroll-assistant-${index}`, role: "assistant", text: `Earlier answer ${index + 1}. `.repeat(8), status: "completed", startedAt: Date.now() - 900 + index, finishedAt: Date.now() - 800 + index, thinking: [] }
      );
    }
    window.__dispatchState();
  });
  const submitScrollRegion = page.locator("#conversationRegion");
  await submitScrollRegion.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await submitScrollRegion.hover({ position: { x: 24, y: 24 }, force: true });
  await page.mouse.wheel(0, -700);
  await page.waitForFunction(() => state.userScrolledUp === true);
  await page.locator("#prompt").click();
  await page.keyboard.type("restore bottom after submit");
  await page.click("#sendBtn");
  assert.ok(await page.evaluate(() => Boolean(state.pendingSubmissionScrollIntent)));
  assert.strictEqual(await page.evaluate(() => state.pendingSubmissionScrollIntent.sessionId), "session-1");

  // An unrelated state update must not consume the pending intent.
  await page.evaluate(() => window.__dispatchState());
  assert.ok(await page.evaluate(() => Boolean(state.pendingSubmissionScrollIntent)));

  await page.evaluate(() => {
    window.__statePayload.sessions[0].messages.push(
      { id: "submit-scroll-user", role: "user", text: "restore bottom after submit", createdAt: Date.now() },
      { id: "submit-scroll-assistant", role: "assistant", text: "Starting the response.", status: "running", startedAt: Date.now(), thinking: [] }
    );
    window.__dispatchState();
  });
  await page.waitForFunction(() => state.pendingSubmissionScrollIntent === null);
  await page.waitForFunction(() => {
    const node = document.querySelector("#conversationRegion");
    return node.scrollHeight - node.scrollTop - node.clientHeight < 96;
  });

  // Ordinary streaming follows after acknowledgement.
  await page.evaluate(() => {
    window.__statePayload.sessions[0].messages.at(-1).text += " More streamed output.".repeat(20);
    window.__dispatchState();
  });
  await page.waitForFunction(() => {
    const node = document.querySelector("#conversationRegion");
    return node.scrollHeight - node.scrollTop - node.clientHeight < 96;
  });

  // A fresh upward gesture releases normal streaming follow again.
  await submitScrollRegion.hover({ position: { x: 24, y: 24 }, force: true });
  await page.mouse.wheel(0, -700);
  await page.waitForFunction(() => state.userScrolledUp === true);
  const releasedScrollTop = await submitScrollRegion.evaluate(node => node.scrollTop);
  await page.evaluate(() => {
    window.__statePayload.sessions[0].messages.at(-1).text += " Output received after manual release.".repeat(20);
    window.__dispatchState();
  });
  assert.ok(Math.abs((await submitScrollRegion.evaluate(node => node.scrollTop)) - releasedScrollTop) <= 1);

  // Saving an existing Queue edit is not a new submission intent.
  await page.click('.queue-row[data-queue-id="queue-2"] [data-action="edit"]');
  await page.keyboard.press("End");
  await page.keyboard.type(" scroll edit");
  await page.click("#sendBtn");
  assert.strictEqual(await page.evaluate(() => state.pendingSubmissionScrollIntent), null);
    console.log("WEBVIEW_VISUAL_CHECK_PASS", JSON.stringify(narrow));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
