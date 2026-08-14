# Hermes Steer Deduplication and User Message Expansion Fix

Status: Confirmed for implementation on 2026-08-11.

Target: Hermes Agent VS Code extension source at version `0.2.36`.

## Goal

Fix five narrowly scoped regressions without changing the established Queue, conversation, Todo, composer, or approval interaction model:

1. One click on a queued message's Steer action must create exactly one Steer request and one Steered user message.
2. An overflowing user message must expand on message-box click, remain expanded across live Agent updates, and collapse only from its explicit bottom-right control.
3. The Todo capsule must use a visually lighter chevron aligned with the Todo label on the same horizontal line.
4. Document Diff preview and approval must work when an existing target document has no open Editor tab and when the target file does not exist yet.
5. Sent slash-command tokens and active Todo indicators must use the same semantic accent color as the focused composer border.

## Current Causes

### Repeated Queue Steer

The accessory region is rebound after live conversation updates even when its DOM nodes were not replaced. Each bind adds another click listener to the same Steer button. A later click therefore posts the same `queueSteer` message two or more times.

The extension currently has no in-flight guard for the same queued item, so duplicate Webview messages can enter `steerQueuedPrompt()` before the first request removes the item.

### Missing User Message Expansion

The current stylesheet still caps `.question-frame` at `76px` and applies the fade mask when content overflows. The rendering and binding code no longer carries an expanded-message state, message-box click handler, or collapse control, so the truncated content cannot be revealed.

### Heavy Todo Chevron

The Todo capsule reuses the general chevron SVG with a `1.8` stroke. It reads heavier than the Todo label and does not provide sufficiently precise visual alignment for the compact capsule.

### Diff Preview Depends on an Existing Document

`showDocDiff()` currently opens the target URI as a VS Code text document before it can create the preview. A new file has no backing resource, so this source acquisition fails. Accept validation later opens the same target URI again and therefore fails for the same reason.

An unopened existing file also has no visible editor selection. Its preview must be based on a stable file-content snapshot rather than requiring the target to already own an Editor tab.

### Related Accent Colors Use Different Theme Roles

The focused composer border and prompt token use `--ha-accent`, while sent command tokens use `--ha-link` and active Todo indicators use `--ha-running`. VS Code themes may map these variables to unrelated hues, so one interaction family appears visually inconsistent.

## Design

### 1. Queue Steer Is Exactly Once

The Webview binding lifecycle must be idempotent:

- Repeated live updates must not attach another listener to an unchanged Queue node.
- Recreated Queue markup receives one listener set.
- Existing Queue edit, delete, collapse, order, and scroll behavior remain unchanged.

The extension adds a second safety boundary keyed by `sessionId + queueItemId`:

- When the key is already being processed, another `queueSteer` request for it is ignored.
- The guard covers the complete asynchronous Steer/start operation and is released in `finally`.
- A successful active-turn Steer removes the queued item and creates one Steered user message.
- If no task is active, the existing behavior remains: remove the item and run it as one ordinary new prompt.
- Failure does not fabricate a success or silently remove an item that was not successfully consumed.

This is an idempotency guard, not a debounce timer; behavior does not depend on click timing.

### 2. Long User Messages Expand and Persist

Expanded state is transient Webview UI state keyed by stable `message.id`. It is not written into session history.

Collapsed behavior:

- `.question-frame` remains capped at `76px`.
- The fade mask appears only when the content actually overflows.
- Clicking a non-overflowing message does nothing.
- Clicking an overflowing message box expands it.

Expanded behavior:

- Remove the maximum height, clipping, and fade mask.
- Show all attachments, metadata, and message text in the existing bubble.
- Add a compact, icon-only collapse control at the bottom-right of the bubble.
- Keep the message expanded across Agent chunks, Thinking updates, Todo updates, Queue updates, and other live conversation rerenders.
- Collapse only when the user activates the explicit collapse control.

Event boundaries:

- Attachment clicks continue to open the attachment and do not toggle expansion.
- Modify continues to enter composer edit mode and does not toggle expansion.
- The collapse control stops propagation and does not trigger another expansion.
- Existing right alignment, fill color, border behavior, Steered metadata, and latest-message treatment are unchanged.

Expanded-message state may be discarded when the Webview itself is recreated, the active session changes, or the message no longer exists.

### 3. Todo Chevron Is Thin and Aligned

The Todo capsule receives a dedicated chevron SVG rather than changing the shared icon used elsewhere:

- Stroke width is `1.25`.
- The icon uses the existing muted color and current rotation behavior.
- The icon box remains stable so opening Todo does not shift the label.
- The chevron and `Todos <done>/<total>` label are vertically centered in the same flex row.
- SVG rendering uses `display: block`, and the wrapper uses inline-flex alignment to avoid baseline drift.
- Todo remains centered above Queue; its click target, dropdown direction, and dropdown placement are unchanged.

### 4. Diff Preview Supports Unopened and New Files

Source acquisition distinguishes three states without writing the target file:

- **Open existing document:** use the in-memory document text and version so unsaved user edits remain authoritative.
- **Unopened existing file:** read the file through `vscode.workspace.fs`, decode it as UTF-8 text, and record the exact content snapshot. Do not open the source document or require an existing Editor tab.
- **Missing new file:** require `oldText` to be empty, use an empty source string, and record that the target did not exist when preview began.

The read-only `hermes-diff-preview` document remains the only Editor opened by preview. For a missing file, the complete proposed content is rendered as added content with whole-line green Diff decoration.

Accept validation follows the recorded source state:

- For an open document, the document version and text must still match the preview snapshot.
- For an unopened existing file, a fresh filesystem read must exactly match the preview snapshot. If the target has since been opened as a text document, its in-memory text must also match the snapshot so unsaved edits block approval.
- For a missing file, the target must still be missing. If another process or the user created it while approval was pending, Accept is blocked as a source-state conflict.

After successful validation, the preview closes and Hermes receives the existing approval response. Hermes remains responsible for the real file creation or edit. The extension does not create an empty placeholder, apply the proposed change itself, or write to the target during preview. Deny closes the preview and leaves the filesystem unchanged.

If a target is missing while `oldText` is non-empty, the preview is unsafe and must fail rather than treating the operation as a new file.

### 5. Related Interaction Colors Use the Composer Accent

The existing `--ha-accent` variable remains sourced from VS Code `focusBorder` with its current fallbacks. No new palette token is introduced.

- Sent slash-command and Skill tokens in `.question-skill` use `--ha-accent`, matching prompt tokens and the focused composer border.
- The Todo capsule spinner's active segment and the in-progress Todo item's animated status point use `--ha-accent`.
- Pending, completed, warning, error, link, Working, and other semantic colors are unchanged.

## Modification Scope

Expected production files:

- `media/main.js`: UI state, render markup, event binding, Todo icon selection, and Steer listener lifecycle.
- `media/styles.css`: expanded-message and collapse-control styles, Todo chevron alignment, and related accent-color mapping.
- `extension.js`: per-session/per-item in-flight Queue Steer guard plus filesystem-aware Diff source acquisition and validation.

Expected tests:

- `test/webview-visual-check.js`: one Steer post after repeated live updates; expand, persist, and collapse a long user message; verify Todo chevron alignment.
- `test/webview-contract.test.js`: stable markup and style contracts.
- `test/extension-contract.test.js` or a focused provider seam: repeated concurrent requests for one queued item execute once.
- `test/extension-contract.test.js`: Diff preview contracts for open, unopened, and missing target states.
- `test/fixtures/webview-harness.html`: one overflowing user-message fixture.

No changes are planned for ACP routing, Queue ordering, slash-command semantics, permission choices or timing, editor-group routing, the base theme-variable definitions, or package dependencies.

## Acceptance Criteria

1. After at least three live state/Thinking updates, clicking one Queue Steer button posts exactly one `queueSteer` message.
2. Two concurrent backend requests for the same session and Queue item execute no more than one Steer/start operation.
3. A successful Queue Steer creates exactly one Steered user message and removes exactly one queued item.
4. A user message that exceeds `76px` has the existing collapsed fade treatment and expands from a message-box click.
5. The expanded message shows its full content and a bottom-right collapse control.
6. The expanded state remains after Agent output, Todo, or Queue updates rerender the conversation.
7. The collapse control restores the capped, faded presentation and does not activate Modify or attachment actions.
8. Non-overflowing messages do not acquire unnecessary expansion controls.
9. The Todo chevron is visually thinner than the current general chevron, stays on the same horizontal line as the Todo label, and is vertically centered with it in both open and closed states.
10. Queue edit/delete/collapse, Todo positioning, composer focus, and existing message styles continue to pass their current tests.
11. An existing target file with no open Editor tab produces a read-only Diff preview from its current filesystem content.
12. A missing target with empty `oldText` produces a full-content green preview without creating a disk file before approval.
13. Accept succeeds only when an existing target's source content is unchanged or a new target remains missing; a conflicting source-state change blocks approval.
14. Deny or preview cleanup never creates or modifies the target file.
15. Sent slash-command/Skill tokens, the Todo spinner active segment, and the in-progress Todo status point use `--ha-accent`, matching the focused composer border across VS Code themes.

## Verification

Run in order:

1. Focused Webview and extension tests demonstrating the regressions before the production fix.
2. Focused tests after implementation.
3. `npm run lint`.
4. `npm run test:unit`.
5. Chromium Webview visual and interaction check at narrow and wide viewport widths.
6. `git diff --check`.
7. `npm test` for VS Code Extension Host smoke coverage.
