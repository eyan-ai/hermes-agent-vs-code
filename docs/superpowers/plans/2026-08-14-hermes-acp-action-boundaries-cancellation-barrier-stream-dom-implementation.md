# Hermes ACP Action Boundaries, Cancellation Barrier, and Stream DOM Implementation Plan

## 1. Reproduce the four failures

- Add an ACP renderer sequence test proving that a later Action closes an earlier orphan Read before turn completion.
- Add a cancellation sequence test proving that rejecting the current Edit does not change earlier inferred-success Actions.
- Add a delayed-release test for a prompt submitted during hard-denial cancellation.
- Add a browser contract that verifies streamed updates retain animated DOM node identity.

## 2. Correct Action lifecycle semantics

- Separate the Action lookup index from the set of currently open Actions.
- Reconcile earlier open Actions when a later Action starts.
- Keep explicit ACP updates authoritative.
- Apply turn failure or cancellation only to Actions that are still open and not already terminal.

## 3. Make hard denial atomic

- Remove the synthetic `/deny` notice.
- Track the exact active turn release with a promise.
- Install a per-session cancellation barrier before stopping.
- Make prompt submission wait outside the visible queue until the barrier releases.
- Preserve normal queue behavior after the first fresh turn has actually started.

## 4. Preserve live animation DOM

- Split assistant answer content from its running/interrupted status node.
- Reconcile conversation messages by message ID instead of replacing the entire conversation region.
- Reconcile Working rows by stable Action/stream keys and update row contents without replacing animation dots.
- Keep full rendering only for initial mount, session changes, and structural fallback.

## 5. Validate and package

- Run focused tests after each subsystem.
- Run the full syntax, unit, ACP, and diff checks.
- Package a version later than `0.2.46-fix`.
- Verify manifest version, archive integrity, and source/package hashes for every changed runtime file.
