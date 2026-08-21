"use strict";

const EFFORT_OPTIONS = Object.freeze([
  Object.freeze({ label: "Low", value: "low" }),
  Object.freeze({ label: "Medium", value: "medium" }),
  Object.freeze({ label: "High", value: "high" }),
  Object.freeze({ label: "Extra High", value: "xhigh" }),
  Object.freeze({ label: "Max", value: "max" }),
  Object.freeze({ label: "Ultra", value: "ultra" })
]);
const EFFORT_VALUES = new Set(EFFORT_OPTIONS.map(option => option.value));

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

function mergeRefreshedModels(previous, refreshed, selected) {
  const prior = previous && typeof previous === "object" ? previous : { options: [], current: "" };
  const next = refreshed && typeof refreshed === "object" ? refreshed : { options: [], current: "" };
  const selectedId = String(selected || "").trim();
  const options = (Array.isArray(next.options) ? next.options : []).map(option => ({ ...option }));
  if (selectedId && !options.some(option => option.id === selectedId)) {
    const priorOption = (Array.isArray(prior.options) ? prior.options : []).find(option => option.id === selectedId);
    options.unshift({
      id: selectedId,
      name: priorOption?.name || selectedId.split(":").slice(1).join(":") || selectedId,
      description: "Unavailable",
      unavailable: true
    });
  }
  return { options, current: selectedId || next.current || "" };
}

function rememberReasoningEffort(current, model, effort) {
  const modelIdValue = String(model || "").trim();
  const effortValue = String(effort || "").trim().toLowerCase();
  if (!modelIdValue || !EFFORT_VALUES.has(effortValue)) return current;
  return { ...(current || {}), [modelIdValue]: effortValue };
}

module.exports = {
  EFFORT_OPTIONS,
  configuredModelState,
  mergeRefreshedModels,
  modelId,
  normalizeModelState,
  rememberReasoningEffort,
  resolveSelectedModel
};
