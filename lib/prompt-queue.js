"use strict";

class PromptQueue {
  constructor(createId = () => Math.random().toString(36).slice(2)) {
    this.createId = createId;
    this.itemsBySession = new Map();
  }

  list(sessionId) {
    let items = this.itemsBySession.get(sessionId);
    if (!items) {
      items = [];
      this.itemsBySession.set(sessionId, items);
    }
    return items;
  }

  snapshot(sessionId) {
    return this.list(sessionId).map(item => ({ ...item }));
  }

  enqueue(sessionId, payload) {
    const item = { ...payload, id: this.createId(), createdAt: Date.now() };
    this.list(sessionId).push(item);
    return { ...item };
  }

  edit(sessionId, itemId, patch) {
    const item = this.list(sessionId).find(entry => entry.id === itemId);
    if (!item) return undefined;
    Object.assign(item, patch, { id: item.id, createdAt: item.createdAt, updatedAt: Date.now() });
    return { ...item };
  }

  remove(sessionId, itemId) {
    const items = this.list(sessionId);
    const index = items.findIndex(item => item.id === itemId);
    if (index < 0) return undefined;
    return { ...items.splice(index, 1)[0] };
  }

  shift(sessionId) {
    const item = this.list(sessionId).shift();
    return item ? { ...item } : undefined;
  }

  clear(sessionId) {
    const count = this.list(sessionId).length;
    this.itemsBySession.delete(sessionId);
    return count;
  }
}

function resolveSubmission(input = {}, active) {
  const prompt = String(input.prompt || "").trim();
  const command = String(input.command || "");
  const skill = String(input.skill || "");
  if (command === "/steer") {
    if (!prompt) return { action: "ignore", prompt, command, skill };
    if (active) return { action: "steer", prompt, command, skill };
    return { action: "run", prompt, command: "", skill };
  }
  if (!prompt && !command && !skill) return { action: "ignore", prompt, command, skill };
  return { action: active ? "queue" : "run", prompt, command, skill };
}

module.exports = { PromptQueue, resolveSubmission };
