# Hermes ACP Terminal Actions, Denial, and Commands Design

Date: 2026-08-14  
Target: Hermes Agent VS Code extension `0.2.45-fix`  
Status: approved direction, pending implementation

## Goal

Retain Hermes ACP as the primary transport while fixing three observed defects without redesigning the existing UI:

1. A completed Read Action can remain purple and animated.
2. Rejecting an edit can leave later prompts queued behind the rejected turn.
3. Slash commands are displayed and scheduled as ordinary chat messages instead of executing with command semantics.

The implementation is complete when each defect has a focused regression test, the existing unit and syntax checks pass, and a new VSIX is packaged at a stable absolute path.

## Constraints

- Keep ACP enabled and preserve the CLI parser only as a degraded fallback.
- Preserve the current timeline, colors, animation, folding, message layout, and approval UI.
- Do not infer stream ownership from natural-language content.
- Do not advertise a command unless it has a real executor.
- Preserve user-authored changes already present in the dirty worktree.
- The deliverable repository contains the VS Code extension. The installed Hermes source under `~/.hermes` is outside the writable project boundary, so the package must be robust against a missing terminal `tool_call_update`; the server-side ID propagation correction remains a separate upstream change.

## Approaches Considered

### A. Patch Hermes ACP only

Propagate a stable tool-call ID and add every CLI slash command to the ACP server. This is the cleanest protocol source-of-truth fix, but it does not make the VSIX self-contained and cannot be delivered from the extension repository alone. It also leaves the plugin's denial queue bug unchanged.

### B. Patch the extension around the existing ACP contract

Keep ACP, reconcile orphan Actions at terminal turn states, make denial cancellation atomic, and introduce an explicit command dispatcher that combines local handlers with commands genuinely advertised by ACP. This produces a self-contained VSIX and remains compatible with future Hermes ACP improvements.

This is the selected approach.

### C. Disable ACP and parse CLI output

Rejected. CLI output has no stable tool identity, structured permission request, or reliable stream ownership. It would make all three defects harder to solve.

## 1. Terminal Action Reconciliation

### Current failure

`tool_call` creates a running Action. Only a matching `tool_call_update` ends it. `finishSteps()` finalizes Thinking entries but leaves tools untouched, so a missing update leaves a permanent purple pulse.

### Design

Add a terminal reconciliation operation to the ACP renderer:

- On successful turn completion, every Action still marked running becomes completed.
- On cancellation, every running Action becomes cancelled and stops animating.
- On failure, every running Action becomes failed.
- A genuine `tool_call_update` remains authoritative and is never overwritten.
- Unknown update IDs are ignored for display but exposed through the existing debug stream diagnostics.
- Terminalized entries are removed from the active tool index.

The existing renderer mapping remains unchanged: completed is green, failed is red, and only running is purple and animated.

### Upstream follow-up

Hermes ACP should eventually propagate the execution's stable `toolCallId` into its completion callback instead of reconstructing it by tool name. The client reconciliation is still retained as defensive protocol handling.

## 2. Hard Denial and Prompt Queue Lifecycle

### Current failure

The denial path waits for sibling permission requests, keeps the prompt queue, and explicitly drains that queue after stopping. Prompts submitted while the old turn is still considered active are therefore attached to the rejected turn's queue.

### Design

Separate hard denial from feedback:

- A preset deny decision is a hard denial. It cancels the current ACP turn and all remaining permission requests for the same UI/ACP session.
- Custom feedback rejects only the current proposal and continues the current turn, preserving the existing revision workflow.

For hard denial:

1. Establish the stopping promise and mark the lifecycle cancelled before publishing the resolved UI state.
2. Respond to the current permission request as cancelled.
3. Cancel sibling permission requests for the same turn.
4. Clear prompts that were queued under the rejected turn.
5. Send ACP `session/cancel` and wait for the active `session/prompt` to settle or for the existing bounded transport reset.
6. Do not call `drainQueue()` from the denial path.
7. Publish an interruption notice including the number of discarded queued prompts when non-zero.

A prompt submitted after denial waits for the stopping promise, recomputes the session state after it settles, and starts as a fresh turn. It must not be inserted into the rejected turn's visible queue.

## 3. Slash Command Dispatch

### Current failure

The command catalog mirrors Hermes CLI commands, but the extension runs Hermes ACP. Except for `/steer`, selected commands pass through ordinary prompt submission, create chat bubbles, and are queued while a turn is active. Hermes ACP supports only a smaller advertised command set, so many catalog entries fall through to the model.

### Command registry

Replace implicit fallback with a registry whose entries declare:

- command name;
- executor type: `local`, `acp`, `skill`, or `unsupported`;
- whether it may run during an active turn;
- whether it creates a chat turn;
- argument requirements;
- handler identifier.

Every displayed command must resolve to an executor. A recognized system command must never fall through to the model.

### Local commands

Implement or reuse extension-side handlers for commands that map to existing extension state:

- `/stop`: use the same stop path as the stop button; never queue or create a user message.
- `/new`: create a new extension session.
- `/title`: rename the active extension session.
- `/sessions` and `/resume`: expose existing session selection/resume behavior.
- `/model`: query or set the current ACP model through `session/set_model`.
- `/save`: export the active extension conversation as a JSON snapshot under the Hermes saved-session directory and report the absolute path.
- `/status`, `/usage`, `/debug`, `/help`, and `/version`: return command notices from known extension/ACP state.

### ACP commands

Consume `available_commands_update` and merge the real ACP list into the registry. The known ACP set includes `/tools`, `/context`, `/reset`, `/compact`, `/queue`, `/steer`, and any future commands advertised by the connected server.

- `/compress` is an explicit compatibility alias for ACP `/compact`.
- `/steer` retains its active-turn injection behavior.
- `/queue` uses one queue owner. The extension queue is the visible source of truth; the command must not create a second hidden queue layer.
- ACP command responses render as command notices, not ordinary user/assistant chat turns.

### Unsupported CLI-only commands

Commands without a local handler or ACP advertisement are hidden. They are not sent to the model. This initially covers commands such as `/retry`, `/undo`, `/branch`, `/rollback`, `/background`, `/agents`, `/journey`, `/goal`, `/personality`, `/yolo`, `/handoff`, `/skin`, `/profile`, `/browser`, `/pet`, `/hatch`, `/learn`, `/reload-mcp`, and `/reload-skills` unless an executor is implemented during the inventory pass.

### Quick commands and skills

- Installed Skills remain Agent turns and continue to create normal messages.
- Quick-command aliases are expanded and redispatched.
- Quick-command exec entries require a dedicated, bounded, sanitized local executor. Until that executor exists, exec entries are not advertised as runnable.

### Command result presentation

Add a minimal system/command notice message type using existing typography and spacing. It reports success, failure, usage guidance, or an output path. It does not add a new panel, color system, or interaction model.

## Error Handling

- ACP command failure produces a command notice and leaves the current chat turn unchanged.
- Commands disallowed during an active turn return an immediate explanatory notice instead of entering the prompt queue.
- Unknown commands return `Unknown command` and never reach the model.
- Save failure reports the attempted destination and filesystem error without claiming success.
- Cancellation timeout retains the existing bounded ACP transport reset.

## Tests

Add focused coverage for:

1. A Read Action with no terminal update becomes green and non-running when the turn completes.
2. Orphan Actions become cancelled or failed on the corresponding terminal state.
3. A genuine failed update is not overwritten by successful turn completion.
4. Denying the first of multiple permissions cancels the batch and current turn.
5. Hard denial clears old queued prompts and never calls denial-path drain.
6. A prompt submitted after cancellation starts as a fresh turn.
7. `/stop` and `/save` bypass normal prompt submission and produce command notices.
8. Every displayed command has an executor.
9. Unsupported commands are hidden and unknown commands cannot fall through to the model.
10. ACP available-command updates affect the catalog.
11. `/compress` maps to `/compact`.
12. Skills still use ordinary Agent-turn submission.

Run the repository's unit tests, syntax checks, diff checks, and VSIX packaging verification. Inspect the packaged manifest and compare hashes for modified runtime files.

## Deliverable

Package a version later than `0.2.45-fix` with an unambiguous fix suffix. Report its stable full absolute path, version, size, and SHA-256 digest.
