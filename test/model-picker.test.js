"use strict";

const assert = require("assert");
const {
  calculateOverlayPlacement,
  filterModels,
  nextSelectableIndex
} = require("../media/model-picker");

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const models = [
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", description: "Anthropic" },
  { id: "openai/gpt-5.6-codex", name: "GPT-5.6 Codex", description: "OpenAI reasoning" },
  { id: "legacy/model", name: "Legacy", description: "Local", unavailable: true }
];

test("filters by display name, full id, and provider description without mutation", () => {
  const snapshot = JSON.parse(JSON.stringify(models));
  assert.deepStrictEqual(filterModels(models, "sonnet").map(item => item.id), ["anthropic/claude-sonnet-4"]);
  assert.deepStrictEqual(filterModels(models, "OPENAI/GPT").map(item => item.id), ["openai/gpt-5.6-codex"]);
  assert.deepStrictEqual(filterModels(models, "reasoning").map(item => item.id), ["openai/gpt-5.6-codex"]);
  assert.deepStrictEqual(filterModels(models, "").map(item => item.id), models.map(item => item.id));
  assert.deepStrictEqual(filterModels(models, "missing"), []);
  assert.deepStrictEqual(models, snapshot);
});

test("moves focus across selectable models and skips unavailable entries", () => {
  assert.strictEqual(nextSelectableIndex(models, 0, 1), 1);
  assert.strictEqual(nextSelectableIndex(models, 1, 1), 0);
  assert.strictEqual(nextSelectableIndex(models, 0, -1), 1);
  assert.strictEqual(nextSelectableIndex([{ id: "x", unavailable: true }], 0, 1), -1);
  assert.strictEqual(nextSelectableIndex([], -1, 1), -1);
});

test("places a short list flush below the trigger when it fits", () => {
  assert.deepStrictEqual(calculateOverlayPlacement({
    triggerRect: { top: 200, right: 320, bottom: 240, left: 20, width: 300 },
    viewportWidth: 400,
    viewportHeight: 600,
    contentHeight: 88,
    maxListHeight: 250,
    margin: 8
  }), {
    direction: "down",
    top: 240,
    left: 20,
    width: 300,
    maxHeight: 88
  });
});

test("places a tall list flush above when below is insufficient", () => {
  const placement = calculateOverlayPlacement({
    triggerRect: { top: 420, right: 320, bottom: 460, left: 20, width: 300 },
    viewportWidth: 400,
    viewportHeight: 600,
    contentHeight: 250,
    maxListHeight: 250,
    margin: 8
  });
  assert.strictEqual(placement.direction, "up");
  assert.strictEqual(placement.top, 170);
  assert.strictEqual(placement.maxHeight, 250);
});

test("caps a list to the larger available viewport side", () => {
  const above = calculateOverlayPlacement({
    triggerRect: { top: 330, right: 320, bottom: 370, left: 20, width: 300 },
    viewportWidth: 400,
    viewportHeight: 500,
    contentHeight: 500,
    maxListHeight: 500,
    margin: 8
  });
  assert.deepStrictEqual(above, {
    direction: "up",
    top: 8,
    left: 20,
    width: 300,
    maxHeight: 322
  });

  const below = calculateOverlayPlacement({
    triggerRect: { top: 130, right: 320, bottom: 170, left: 20, width: 300 },
    viewportWidth: 400,
    viewportHeight: 500,
    contentHeight: 500,
    maxListHeight: 500,
    margin: 8
  });
  assert.strictEqual(below.direction, "down");
  assert.strictEqual(below.top, 170);
  assert.strictEqual(below.maxHeight, 322);
});

test("clamps overlay width and horizontal position to the viewport", () => {
  const left = calculateOverlayPlacement({
    triggerRect: { top: 100, right: 190, bottom: 140, left: -10, width: 200 },
    viewportWidth: 300,
    viewportHeight: 500,
    contentHeight: 44,
    maxListHeight: 250,
    margin: 8
  });
  assert.strictEqual(left.left, 8);

  const right = calculateOverlayPlacement({
    triggerRect: { top: 100, right: 370, bottom: 140, left: 250, width: 120 },
    viewportWidth: 300,
    viewportHeight: 500,
    contentHeight: 44,
    maxListHeight: 250,
    margin: 8
  });
  assert.strictEqual(right.left, 172);

  const wide = calculateOverlayPlacement({
    triggerRect: { top: 100, right: 500, bottom: 140, left: 0, width: 500 },
    viewportWidth: 300,
    viewportHeight: 500,
    contentHeight: 44,
    maxListHeight: 250,
    margin: 8
  });
  assert.strictEqual(wide.left, 8);
  assert.strictEqual(wide.width, 284);
});

test("changes direction when filtering reduces desired height", () => {
  const input = {
    triggerRect: { top: 220, right: 320, bottom: 260, left: 20, width: 300 },
    viewportWidth: 400,
    viewportHeight: 400,
    maxListHeight: 250,
    margin: 8
  };
  assert.strictEqual(calculateOverlayPlacement({ ...input, contentHeight: 250 }).direction, "up");
  assert.strictEqual(calculateOverlayPlacement({ ...input, contentHeight: 44 }).direction, "down");
});
