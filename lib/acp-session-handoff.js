"use strict";

async function forkAcpSession(client, { sessionId, cwd, mcpServers = [] }) {
  const oldSessionId = String(sessionId || "").trim();
  if (!client || typeof client.request !== "function") throw new Error("ACP client is unavailable");
  if (!oldSessionId) throw new Error("The active ACP session is unavailable");

  const result = await client.request("session/fork", {
    sessionId: oldSessionId,
    cwd,
    mcpServers
  });
  const replacementSessionId = String(result?.sessionId || "").trim();
  if (!replacementSessionId) throw new Error("Hermes did not return a replacement ACP session");
  if (replacementSessionId === oldSessionId) throw new Error("Hermes reused the rejected ACP session");
  return { ...result, sessionId: replacementSessionId };
}

function installAcpSessionReplacement({ mappings, uiSessionId, oldSessionId, replacementSessionId, session }) {
  if (!(mappings instanceof Map)) throw new Error("ACP session mappings are unavailable");
  if (mappings.get(uiSessionId) !== oldSessionId) throw new Error("The ACP session changed during handoff");
  if (!replacementSessionId || replacementSessionId === oldSessionId) throw new Error("The replacement ACP session is invalid");
  mappings.set(uiSessionId, replacementSessionId);
  if (session) session.acpSessionId = replacementSessionId;
  return replacementSessionId;
}

module.exports = { forkAcpSession, installAcpSessionReplacement };
