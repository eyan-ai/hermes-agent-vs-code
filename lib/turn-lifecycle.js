"use strict";

class TurnCancelledError extends Error {
  constructor(message = "Hermes turn was cancelled") {
    super(message);
    this.name = "TurnCancelledError";
    this.code = "HERMES_TURN_CANCELLED";
  }
}

function isTurnCancelled(error) {
  return Boolean(error && error.code === "HERMES_TURN_CANCELLED");
}

class TurnLifecycle {
  constructor({ timeoutMs = 1500 } = {}) {
    this.timeoutMs = timeoutMs;
    this.status = "running";
    this.cancelled = false;
    this.settled = false;
    this._stopPromise = null;
    this._settledPromise = new Promise(resolve => {
      this._resolveSettled = resolve;
    });
  }

  acceptsEvents() {
    return this.status === "running" && !this.cancelled;
  }

  markCancelled() {
    this.cancelled = true;
    if (this.status === "running") this.status = "stopping";
  }

  settle() {
    if (this.settled) return;
    this.settled = true;
    if (this.status === "running") this.status = "done";
    this._resolveSettled();
  }

  stop({ notify, forceStop }) {
    if (this._stopPromise) return this._stopPromise;
    this.markCancelled();
    try {
      if (notify) notify();
    } catch {
      // A failed notification still proceeds to the force-stop timeout.
    }

    this._stopPromise = new Promise(resolve => {
      let timer;
      let finished = false;
      let finishing = false;
      const finish = async forced => {
        if (finished || finishing) return;
        finishing = true;
        if (timer) clearTimeout(timer);
        if (forced && forceStop) {
          const terminated = await forceStop();
          if (terminated === false) {
            finished = true;
            finishing = false;
            this.status = "stopped";
            resolve({ forced: true, terminated: false });
            return;
          }
        }
        finished = true;
        finishing = false;
        this.status = "stopped";
        resolve({ forced });
      };
      this._settledPromise.then(() => finish(false));
      timer = setTimeout(() => finish(true), this.timeoutMs);
    });
    return this._stopPromise;
  }
}

module.exports = { TurnLifecycle, TurnCancelledError, isTurnCancelled };
