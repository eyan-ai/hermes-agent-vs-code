"use strict";

class PromptQueue {
  constructor(createId = () => Math.random().toString(36).slice(2), onChange = () => {}) {
    this.createId = createId;
    this.onChange = onChange;
    this.itemsBySession = new Map();
  }

  restore(snapshot = {}) {
    this.itemsBySession.clear();
    for (const [sessionId, items] of Object.entries(snapshot || {})) {
      if (!Array.isArray(items) || !items.length) continue;
      this.itemsBySession.set(sessionId, items.map(item => ({ ...item })));
    }
  }

  all() {
    return Object.fromEntries([...this.itemsBySession]
      .filter(([, items]) => items.length)
      .map(([sessionId, items]) => [sessionId, items.map(item => ({ ...item }))]));
  }

  changed() {
    this.onChange(this.all());
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
    this.changed();
    return { ...item };
  }

  edit(sessionId, itemId, patch) {
    const item = this.list(sessionId).find(entry => entry.id === itemId);
    if (!item) return undefined;
    Object.assign(item, patch, { id: item.id, createdAt: item.createdAt, updatedAt: Date.now() });
    this.changed();
    return { ...item };
  }

  remove(sessionId, itemId) {
    const items = this.list(sessionId);
    const index = items.findIndex(item => item.id === itemId);
    if (index < 0) return undefined;
    const removed = { ...items.splice(index, 1)[0] };
    this.changed();
    return removed;
  }

  shift(sessionId) {
    const item = this.list(sessionId).shift();
    if (item) this.changed();
    return item ? { ...item } : undefined;
  }

  clear(sessionId) {
    const count = this.list(sessionId).length;
    this.itemsBySession.delete(sessionId);
    if (count) this.changed();
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
