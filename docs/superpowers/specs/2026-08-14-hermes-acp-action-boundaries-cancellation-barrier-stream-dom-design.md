# Hermes ACP Action Boundaries, Cancellation Barrier, and Stream DOM Design

Date: 2026-08-14  
Target: Hermes Agent VS Code extension after `0.2.46-fix`  
Status: approved design, pending implementation

## Goal

Keep ACP as the primary transport and correct four defects observed in the installed `0.2.46-fix` package:

1. A completed Read Action keeps its purple running animation until the whole turn ends.
2. Rejecting a later Edit incorrectly changes earlier Read Actions to failed.
3. Selecting No displays a synthetic `/deny` notice and does not reliably release the old turn before a new prompt is submitted.
4. Streaming output repeatedly recreates animated DOM nodes, making Working and Action animations appear paused.

The implementation is complete only when the exact observed event sequence has behavioral regression coverage, all existing unit and syntax checks pass, the packaged runtime files match the verified source, and a new VSIX is produced at a stable absolute path.

## Verified Cause of the Previous Failure

The installed extension is `0.2.46-fix`, and its runtime file hashes match the delivered source. The failed behavior is therefore not stale installation state.

The previous implementation used the wrong boundaries:

- orphan Actions were reconciled only when the entire turn ended;
- cancellation assigned the cancelled outcome to every Action still considered open;
- `/deny` was explicitly added as a system notice;
- denial tests inspected source structure but did not execute the asynchronous stop-and-resubmit race;
- every live update replaced `#conversationRegion.innerHTML`, recreating all CSS animation nodes.

## Approaches Considered

### A. Timeouts and CSS phase compensation

Automatically complete Actions after a delay and give recreated animation nodes a calculated negative delay. This is small but semantically unsafe: slow Actions can be marked successful, and the full conversation still incurs repeated DOM construction, Markdown parsing, and event rebinding.

### B. Exact Action boundaries, a session cancellation barrier, and keyed DOM updates

Use the next Action as the completion boundary for an earlier orphan Action, keep explicit ACP updates authoritative, serialize post-denial submissions behind release of the exact old turn, and preserve live message and animation DOM nodes by stable keys.

This is the selected approach.

### C. Patch only the Hermes ACP server

Server-side stable tool IDs remain desirable, but an upstream-only change does not make the VSIX robust to incomplete terminal updates and does not fix the extension's cancellation or rendering races.

## 1. Action Boundary State Machine

The renderer will distinguish Action identity from Action openness:

- keep an index of every Action in the current renderer by `toolCallId` so a late explicit update can still find it;
- separately track which Actions are still open;
- when a new `action.started` arrives, mark every earlier open Action completed, set `inferredTerminal: true`, and remove it from the open set;
- append the new Action only after the earlier Actions have been reconciled;
- if an explicit `tool_call_update` later arrives for an inferred Action, apply its real status and content; the explicit ACP event is authoritative;
- on successful turn completion, complete only Actions that remain open;
- on failure or cancellation, apply the terminal outcome only to Actions that remain open and are not already explicitly finished.

The existing permission outcome recorder remains responsible for the rejected Edit. Selecting No marks that matching Edit step done and failed before turn cancellation. Turn cancellation must observe that the Edit is already terminal and must not overwrite earlier completed Read steps.

Expected presentation:

- an earlier Read turns green as soon as the next Action begins;
- that Read never resumes animation;
- a later rejected Edit is red;
- cancelling the turn does not change the earlier Read from green to red.

## 2. Hard Denial and Session Cancellation Barrier

Preset No and custom feedback remain separate operations:

- No is a hard denial: reject the current operation and stop the turn;
- custom feedback rejects only the proposal and continues the current turn.

For hard denial:

1. Capture the exact current turn object.
2. Install a per-session cancellation barrier before publishing any state that allows another submission.
3. Mark the captured turn cancelled.
4. Record the rejected Edit outcome.
5. Respond to the current permission request and cancel sibling permission requests for the same session.
6. Clear prompts that belonged to the rejected turn.
7. Cancel the captured ACP session prompt.
8. Wait until that captured turn reaches its `runAcp` release point and is removed from `activeTurns`.
9. If bounded cancellation cannot release it, reset the captured transport, detach the captured turn, and reject its late events before releasing the barrier.
10. Remove the barrier and publish the final idle state.

`sendPrompt` must await the barrier for its own session before checking whether the session is running. A message waiting on this barrier is not inserted into `PromptQueue` and is not shown as queued. Once released, the message recomputes current state and starts a fresh turn.

Multiple messages submitted after release retain normal behavior: the first starts the fresh turn and subsequent messages may use the ordinary visible queue because a genuinely new turn is then active.

The hard-denial UI contains only the existing interrupted status. The extension must not create a `/deny` command notice or any replacement rejection notice.

## 3. Persistent Live DOM Rendering

Streaming must not replace the complete conversation DOM.

### Stable keys

- assistant message root: `messageId`;
- Action row: `toolCallId`;
- Thinking stream: `streamId` plus a stable occurrence key where a stream can produce multiple rows;
- user and system messages: message ID.

### Update rules

- `assistantChunk` updates only the matching assistant answer content;
- `thinkingUpdate` reconciles only the matching assistant's keyed Working rows;
- `planUpdate` updates only that assistant's plan region;
- ordinary state messages reconcile keyed messages instead of assigning `conversationRegion.innerHTML`;
- a full rebuild is reserved for initial mount, session switch, or an unrecoverable structural mismatch.

The answer markup will separate the Markdown content node from the running/interrupted status node. Updating streamed Markdown may replace the content node's children, but it must preserve the assistant root, header Working indicator, status indicator, and any unchanged keyed Action row.

Existing animation CSS remains unchanged. Continuity comes from retaining the same DOM nodes rather than compensating for repeated restarts.

## 4. Error and Race Handling

- Late events from a cancelled, detached turn are ignored by its cancelled lifecycle and cannot update a fresh turn.
- A failed transport reset keeps the session blocked and reports an error instead of pretending that a new task can safely start.
- A late explicit Action failure may replace an inferred green state because protocol truth is authoritative.
- A malformed live update falls back to a scoped message rebuild; it must not rebuild unaffected messages or the entire conversation.
- Reduced-motion settings continue to disable animations through the existing media query.

## 5. Behavioral Tests

Tests must execute behavior rather than only search source text.

### Renderer sequence

```text
Read started
Thinking update
next Action started
Read is completed and non-running
Edit started
Edit permission is rejected
turn is cancelled
Read remains completed
Edit remains failed
```

Also verify that a late explicit update overrides an inferred terminal status without duplicating the Action.

### Cancellation race

Use a fake ACP turn whose cancellation settlement is deliberately delayed:

```text
hard denial begins
old queue is cleared
new prompt is submitted while cancellation is pending
new prompt waits outside PromptQueue
old turn release resolves
new prompt starts exactly once as a fresh turn
visible queue remains empty
```

Verify the forced-reset branch separately and assert that events from the detached old turn cannot reach the new renderer.

### DOM and animation continuity

In a browser-backed webview test:

1. capture the Working indicator and active Action dot nodes;
2. inject repeated assistant and thinking chunks faster than the animation duration;
3. assert the nodes retain object identity;
4. assert their animation `currentTime` advances;
5. assert streamed text and Action details still update;
6. assert a genuine structural change can add a new keyed message without replacing earlier animated nodes.

Static contract tests may supplement these checks but cannot replace the behavioral sequence or node-identity test.

## Deliverable

After the behavioral tests fail on `0.2.46-fix` and pass with the implementation, run the full unit suite, syntax checks, ACP self-check, diff validation, and VSIX integrity checks. Package a version later than `0.2.46-fix` and report its full absolute path, size, and SHA-256 digest.
