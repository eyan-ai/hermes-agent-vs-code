"use strict";

class SessionCancellationBarrier {
  constructor() {
    this.pending = new Map();
  }

  has(sessionId) {
    return this.pending.has(sessionId);
  }

  wait(sessionId) {
    return this.pending.get(sessionId) || Promise.resolve();
  }

  open(sessionId) {
    const existing = this.pending.get(sessionId);
    if (existing) return { promise: existing, release() {}, owner: false };
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    this.pending.set(sessionId, promise);
    return {
      promise,
      owner: true,
      release: () => {
        if (this.pending.get(sessionId) !== promise) return;
        this.pending.delete(sessionId);
        release();
      }
    };
  }

  run(sessionId, operation) {
    const existing = this.pending.get(sessionId);
    if (existing) return existing;
    const control = this.open(sessionId);
    return Promise.resolve()
      .then(operation)
      .finally(control.release);
  }
}

module.exports = { SessionCancellationBarrier };
