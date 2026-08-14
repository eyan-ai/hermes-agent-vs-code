"use strict";

const assert = require("assert");
const {
  normalizeModelState,
  resolveSelectedModel,
  configuredModelState
} = require("../lib/model-settings");

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("normalizes ACP model state without inventing options", () => {
  assert.deepStrictEqual(normalizeModelState({
    availableModels: [
      { modelId: "deepseek:deepseek-v4-pro", name: "deepseek-v4-pro", description: "Provider: DeepSeek" },
      { modelId: "deepseek:deepseek-v4-flash", name: "deepseek-v4-flash" }
    ],
    currentModelId: "deepseek:deepseek-v4-pro"
  }), {
    options: [
      { id: "deepseek:deepseek-v4-pro", name: "deepseek-v4-pro", description: "Provider: DeepSeek" },
      { id: "deepseek:deepseek-v4-flash", name: "deepseek-v4-flash", description: "" }
    ],
    current: "deepseek:deepseek-v4-pro"
  });
});

test("accepts snake case ACP fields", () => {
  assert.deepStrictEqual(normalizeModelState({
    available_models: [{ model_id: "nous:openai/gpt-5.6-luna", name: "openai/gpt-5.6-luna" }],
    current_model_id: "nous:openai/gpt-5.6-luna"
  }), {
    options: [{ id: "nous:openai/gpt-5.6-luna", name: "openai/gpt-5.6-luna", description: "" }],
    current: "nous:openai/gpt-5.6-luna"
  });
});

test("falls back when the remembered model is unavailable", () => {
  const options = [
    { id: "deepseek:deepseek-v4-pro", name: "deepseek-v4-pro" },
    { id: "deepseek:deepseek-v4-flash", name: "deepseek-v4-flash" }
  ];
  assert.strictEqual(resolveSelectedModel("openrouter:missing", options, "deepseek:deepseek-v4-pro"), "deepseek:deepseek-v4-pro");
  assert.strictEqual(resolveSelectedModel("deepseek:deepseek-v4-flash", options, "deepseek:deepseek-v4-pro"), "deepseek:deepseek-v4-flash");
});

test("builds the pre-session list from only the configured provider", () => {
  const state = configuredModelState({ model: "deepseek-v4-pro", provider: "deepseek" }, {
    deepseek: { models: [{ id: "deepseek-v4-pro" }, { id: "deepseek-v4-flash" }] },
    openrouter: { models: [{ id: "openai/gpt-5.6-luna" }] }
  });
  assert.deepStrictEqual(state, {
    options: [
      { id: "deepseek:deepseek-v4-pro", name: "deepseek-v4-pro", description: "Provider: deepseek" },
      { id: "deepseek:deepseek-v4-flash", name: "deepseek-v4-flash", description: "Provider: deepseek" }
    ],
    current: "deepseek:deepseek-v4-pro"
  });
});

test("keeps the configured default visible when the provider catalog is absent", () => {
  assert.deepStrictEqual(configuredModelState({ model: "deepseek-v4-pro", provider: "deepseek" }, {}), {
    options: [{ id: "deepseek:deepseek-v4-pro", name: "deepseek-v4-pro", description: "Provider: deepseek" }],
    current: "deepseek:deepseek-v4-pro"
  });
});
