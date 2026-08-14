"use strict";

function modelId(provider, model) {
  const providerValue = String(provider || "").trim().toLowerCase();
  const modelValue = String(model || "").trim();
  if (!modelValue) return "";
  return providerValue ? `${providerValue}:${modelValue}` : modelValue;
}

function normalizeModelState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const available = source.availableModels || source.available_models || [];
  const options = [];
  const seen = new Set();
  for (const entry of Array.isArray(available) ? available : []) {
    const id = String(entry?.modelId || entry?.model_id || entry?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    options.push({
      id,
      name: String(entry?.name || id).trim() || id,
      description: String(entry?.description || "").trim()
    });
  }
  const requestedCurrent = String(source.currentModelId || source.current_model_id || "").trim();
  const current = options.some(option => option.id === requestedCurrent)
    ? requestedCurrent
    : options[0]?.id || "";
  return { options, current };
}

function resolveSelectedModel(preferred, options, fallback) {
  const values = new Set((options || []).map(option => String(option?.id || "")).filter(Boolean));
  const preferredValue = String(preferred || "").trim();
  if (preferredValue && values.has(preferredValue)) return preferredValue;
  const fallbackValue = String(fallback || "").trim();
  if (fallbackValue && values.has(fallbackValue)) return fallbackValue;
  return (options || [])[0]?.id || "";
}

function configuredModelState(config, providers) {
  const source = config && typeof config === "object" ? config : {};
  const provider = String(source.provider || "").trim().toLowerCase();
  const configuredModel = String(source.model || "").trim();
  const catalog = providers && typeof providers === "object" ? providers : {};
  const entries = Array.isArray(catalog[provider]?.models) ? catalog[provider].models : [];
  const options = [];
  const seen = new Set();
  const push = value => {
    const name = String(typeof value === "string" ? value : value?.id || "").trim();
    const id = modelId(provider, name);
    if (!id || seen.has(id)) return;
    seen.add(id);
    options.push({ id, name, description: provider ? `Provider: ${provider}` : "" });
  };
  if (configuredModel) push(configuredModel);
  for (const entry of entries) push(entry);
  return { options, current: modelId(provider, configuredModel) || options[0]?.id || "" };
}

module.exports = {
  configuredModelState,
  modelId,
  normalizeModelState,
  resolveSelectedModel
};
