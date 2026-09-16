"use strict";

function normalizeWorkspaceAgentState(value) {
  const source = value && typeof value === "object" ? value : {};
  const column = Number(source.editorColumn);
  return {
    activeSessionId: String(source.activeSessionId || ""),
    editorPanelOpen: Boolean(source.editorPanelOpen),
    editorSessionId: String(source.editorSessionId || ""),
    editorColumn: Number.isInteger(column) && column > 0 ? column : undefined
  };
}

function resolveWorkspaceSessionId(value, sessions) {
  const state = normalizeWorkspaceAgentState(value);
  const available = Array.isArray(sessions) ? sessions : [];
  return available.some(session => session?.id === state.activeSessionId)
    ? state.activeSessionId
    : available[0]?.id || "";
}

function sessionIsRunning(session) {
  return (session?.messages || []).some(message => message?.role === "assistant" && message?.status === "running");
}

function markSessionCompleted(session, { visible = false, completedAt = Date.now() } = {}) {
  if (!session || visible) return false;
  const next = Number(completedAt) || Date.now();
  if (session.completedPendingViewAt === next) return false;
  session.completedPendingViewAt = next;
  return true;
}

function markSessionViewed(session) {
  if (!session || session.completedPendingViewAt === undefined) return false;
  delete session.completedPendingViewAt;
  return true;
}

module.exports = {
  markSessionCompleted,
  markSessionViewed,
  normalizeWorkspaceAgentState,
  resolveWorkspaceSessionId,
  sessionIsRunning
};

