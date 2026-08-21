"use strict";

function normalizeTitleOrigin(value) {
  return value === "manual" ? "manual" : "automatic";
}

function normalizedTitle(value) {
  return String(value || "").trim() || "Untitled";
}

function isMeaninglessContextTitle(value) {
  return /^context:\s*(?:#\d+)?$/i.test(String(value || "").trim());
}

function legacyRequestTitle(session) {
  const firstUser = (session?.messages || []).find(message => message?.role === "user");
  if (!firstUser) return "";
  const prompt = String(firstUser.text || "");
  const command = String(firstUser.command || "");
  return `${command}${command && prompt ? " " : ""}${prompt}`.slice(0, 64);
}

function hasUserText(session) {
  return (session?.messages || []).some(message => (
    message?.role === "user" && String(message.text || "").trim()
  ));
}

function inferTitleOrigin(session) {
  if (session?.titleOrigin === "manual" || session?.titleOrigin === "automatic") return session.titleOrigin;
  const title = normalizedTitle(session?.title);
  if (title === "Untitled" || isMeaninglessContextTitle(title)) return "automatic";
  return title === legacyRequestTitle(session) ? "automatic" : "manual";
}

function applyManualTitle(session, title) {
  if (!session) return false;
  const next = normalizedTitle(title);
  const changed = session.title !== next || session.titleOrigin !== "manual";
  session.title = next;
  session.titleOrigin = "manual";
  return changed;
}

function applyAutomaticTitle(session, title) {
  if (!session || normalizeTitleOrigin(session.titleOrigin) === "manual" || !hasUserText(session)) return false;
  const next = normalizedTitle(title);
  if (next === "Untitled" || isMeaninglessContextTitle(next)) return false;
  const changed = session.title !== next || session.titleOrigin !== "automatic";
  session.title = next;
  session.titleOrigin = "automatic";
  return changed;
}

module.exports = {
  applyAutomaticTitle,
  applyManualTitle,
  hasUserText,
  inferTitleOrigin,
  isMeaninglessContextTitle,
  normalizeTitleOrigin
};
