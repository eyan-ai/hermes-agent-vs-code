# Submit Scroll Restoration Design

## Goal

Restore the established conversation behavior: every successful new submission moves the conversation to its latest line once, while a user can still scroll upward during the following streamed response without the UI pulling them back down.

## Scope boundary

This change is limited to Webview scroll intent in `media/main.js` and its Webview regression tests.

It must not change:

- Stop button or `/stop` dispatch;
- ACP cancellation or session handoff;
- permission denial handling;
- cancellation barriers or prompt-queue cleanup;
- action lifecycle/status rendering;
- file and URL link behavior.

The host-side files implementing those behaviors are out of scope.

## Confirmed root cause

`submit()` currently clears `userScrolledUp` and sets `pinBottom`, but its immediate `render()` calls `currentRenderState()`. Before the host has appended the new running assistant message, `running` is false, so `currentRenderState()` resets `pinBottom` to false. The submission's scroll intent is therefore lost inside the same call path.

## Design

Add a one-shot pending submission scroll intent owned by the active Webview session.

On a genuine new submission, create a `pendingSubmissionScrollIntent` that records enough pre-submit identity to recognize the host acknowledgement:

- active session ID;
- the set of existing conversation message IDs;
- the set of existing queue item IDs.

Do not create this intent when editing an existing queued item.

The intent is independent from `pinBottom`: `pinBottom` remains responsible only for normal streaming auto-follow and does not carry submission acknowledgement across state updates.

While the intent is pending, the immediate composer render may move to the current bottom, but it must only read and must not consume the intent. On a subsequent host `state` update, acknowledge it only when the active session still matches and the incoming state contains a newly appended conversation item ID or a newly created queue item ID that was absent from the captured sets. A changed tail ID alone is insufficient, so queue reorder, a transient state rollback, or an unrelated state update cannot acknowledge the submission. At that point:

1. clear the previous manual-scroll state;
2. clear the one-shot pending intent;
3. pass a one-shot force-bottom value into the current render operation;
4. scroll the conversation region to `scrollHeight` after DOM reconciliation;
5. leave ordinary streaming auto-follow enabled until the user manually scrolls upward.

The one-shot force-bottom value is consumed by that render operation and must not turn into a persistent forced-bottom mode. Programmatic scrolling may emit a `scroll` event; the existing distance-from-bottom threshold determines the resulting state, while only an upward wheel gesture immediately expresses a manual release intent.

This acknowledgement rule covers normal prompts, `/steer`, command notices, replacement submissions, and queued prompts without leaving a permanent bottom lock when a queued prompt does not immediately create a conversation message.

## Interaction rules

1. A successful new submission always wins over a manual position left over from the previous turn.
2. Subsequent streaming follows the bottom while the user has not moved upward.
3. An upward wheel/scroll gesture releases streaming auto-follow.
4. Streaming updates preserve the user's chosen position after release.
5. The next successful submission starts a new one-shot bottom transition.

## Verification

Add separate regression coverage for these behaviors:

1. Submission acknowledgement: start with an overflowing conversation, scroll upward, submit, verify that the immediate render leaves the intent pending, deliver a host state containing a new identity, assert the region is at the bottom, then stream once and assert normal bottom following remains active.
2. Manual release: after acknowledgement and bottom following, scroll upward, stream again, and assert the position is preserved.
3. Queue edit exclusion: save an edit to an existing queued item and assert that no `pendingSubmissionScrollIntent` is created.

Run the existing Webview contract tests and the complete unit/lint suite. Existing Stop, cancellation-barrier, denial, queue, turn-lifecycle, and ACP renderer tests must remain unchanged and pass. Run the browser visual check when the environment permits it; if the sandbox blocks browser startup, report that separately rather than changing production behavior to accommodate the test environment.

## Packaging

Set the requested package version to `0.2.49`. After verification, rebuild `hermes-agent-vscode-0.2.49.vsix` and report its absolute path and checksum.
