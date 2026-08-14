# Hermes Inline Skill, Slash Commands, and Queue Prototype Design

Date: 2026-08-11

## Goal

Confirm the input and queue experience before changing the Hermes Agent VS Code extension. This design covers three related surfaces:

1. A selected Skill must render inline with the prompt instead of occupying a separate composer row or column.
2. Slash input must expose grouped CLI commands, user quick commands, and installed Skills with live filtering.
3. While a task is running, new messages must enter a visible, editable queue instead of being blocked behind the active turn.

The first deliverable is an interactive standalone HTML prototype. Production extension code is explicitly out of scope until the prototype is approved.

## Selected Approach

Use a token-aware editable prompt surface rather than placing a Skill chip beside a textarea.

- Every selected slash command, including an installed Skill, is a non-editable inline token in the same text flow as the prompt.
- Text immediately follows the token on the same baseline.
- Wrapped lines restart from the left edge of the prompt rather than remaining indented after the token.
- The token uses the same VS Code accent color as the focused composer and has no pill background or border.
- Backspace at the token boundary removes the entire command or Skill.
- The submitted value remains structured as `selectedToken + tokenType + promptText`; visual markup is not submitted and command routing still distinguishes built-ins, user commands, and Skills.

Rejected alternatives:

- A Skill element beside a textarea still creates two visual columns when text wraps.
- A mirrored textarea overlay makes caret position, IME input, selection, and wrapping fragile.

## Slash Command Palette

Typing `/` as the first prompt character opens one unified palette above the composer. Commands are grouped in this order:

1. Session
2. Configuration
3. Tools & Skills
4. Info
5. User commands
6. Installed Skills

The built-in command inventory is:

- Session: `/new`, `/retry`, `/undo`, `/title`, `/branch`, `/compress`, `/rollback`, `/stop`, `/background`, `/agents`, `/journey`, `/queue`, `/steer`, `/goal`, `/status`, `/resume`, `/sessions`
- Configuration: `/model`, `/personality`, `/yolo`, `/handoff`, `/skin`, `/profile`
- Tools & Skills: `/browser`, `/pet`, `/hatch`, `/learn`, `/reload-mcp`, `/reload-skills`, `/save`
- Info: `/help`, `/usage`, `/version`, `/debug`

User commands are loaded from `quick_commands` in `config.yaml` when present. Installed Skill commands are generated dynamically.

Interaction rules:

- `/` shows all groups.
- Additional characters filter across command names and descriptions in real time.
- Arrow keys move selection; Enter, Tab, or click selects; Escape closes.
- Selection only writes the command into the prompt and never executes it.
- Candidate rows use the same name-and-description styling for every command type; installed Skills receive no special list color.
- Every selected command type becomes the same Accent inline token. The token itself is fixed while arguments remain editable after it.
- Built-in names take precedence during deduplication, followed by user commands, then installed Skills.
- Empty dynamic groups are omitted.

## Running-Turn Queue

### Send and Stop state

| Active turn | Prompt | Primary control |
| --- | --- | --- |
| Running | Empty | Stop |
| Running | Non-empty | Send |
| Idle | Empty | Disabled Send |
| Idle | Non-empty | Send |

Sending during an active turn clears the prompt and appends the message to the queue without interrupting the active turn. Once the prompt is empty, the primary control returns to Stop.

The empty prompt surface reserves approximately two text lines. It grows with input up to its maximum height and then scrolls internally.

### Queue presentation

- The queue appears directly above the composer.
- One through five messages expand naturally.
- More than five messages use a fixed five-row viewport with vertical scrolling.
- Initial scroll position remains at the first queued item.
- Queue order is explicitly numbered.
- The queue header toggles the list between expanded and collapsed states. The collapsed state preserves only the title, queued count, and expand control.
- Queue rows use a compact single-line height to preserve conversation visibility.

### Queue actions

- `Steer`: remove the queued message and immediately inject it into the active turn. It does not stop or restart the active turn. After sending, the steered content appears as a new user message in the conversation feed. Hovering or focusing the Steer action shows `Submit without interrupting the model`. The new user message is the complete success feedback; do not also show a Steer success toast.
- `Edit`: keep the queued message at its current position, mark it as being edited, and place its content into the prompt. Sending updates that same queue item in place; it must not move to the end of the queue.
- `Delete`: remove the queued message permanently.

### Steer chronology

Steer remains part of the current running task, but its presentation must preserve the actual event order:

1. Keep all Working content received before Steer in its original position and stop its active animation.
2. Mark that earlier Working segment as `Continued`; it remains expandable history rather than a completed task.
3. Render the steered content below it as a normal user message with a lightweight `Steered` metadata label.
4. Create a new active Working segment below the Steered message for every Thinking or Action event received afterward.
5. Render the final assistant answer only after the last active Working segment.

Multiple Steer actions repeat the same sequence: `Working segment → Steered message → Working segment`. The segments belong to one task, so Stop still cancels the whole active task rather than only the latest visual segment. Events already rendered before the successful Steer boundary are never moved retroactively.

Queue Steer and the `/steer` command use one `submitSteer(text)` behavior. Task state is checked at the moment of submission rather than when the command is selected:

- If an active task is still running, submit as Steer and use the chronological Steered presentation above.
- If no task is running, strip the `/steer` token and submit the remaining text as an ordinary new user message. Start a normal Working segment, do not show the `Steered` label, and do not show an error.
- If the active task finishes while the user is composing `/steer`, the send-time state check naturally follows the ordinary-new-message path.
- An empty `/steer` body is not submitted.

### Stop handoff

Stopping affects only the active turn. Hermes waits for the backend to confirm that the active turn has stopped before starting the first queued message. If the stop fails or ACP remains occupied, the queue is preserved and shown as waiting. If the queue is empty, the session becomes idle.

## Prototype States

The standalone prototype must provide three reviewable scenarios:

1. Inline Skill typing and wrapping.
2. Grouped slash command discovery, filtering, and selection.
3. Running task with a queue, including Send, Steer, Edit, Delete, and Stop-to-next-message handoff.

## Non-goals

- No production extension source changes.
- No ACP or CLI protocol calls.
- No persistence, history migration, or actual `config.yaml` parsing.
- No final command descriptions or localization review.
- No claim that a browser prototype proves VS Code Webview integration.

## Prototype Acceptance

- The Skill and prompt share one baseline and one wrapping flow.
- Slash filtering keeps group labels and hides empty groups.
- Selecting a command writes it into the prompt without execution.
- Running plus non-empty prompt shows Send; running plus empty prompt shows Stop.
- Queue rows support all three actions.
- Steer exposes a concise hover/focus explanation and creates a new user message in the feed after it is sent.
- Working output before and after Steer is separated around the Steered user message in chronological order while remaining one task.
- `/steer` and Queue Steer share send-time state detection; without an active task, the content becomes a normal new message without an error or Steered styling.
- Editing a queued message updates the original row without changing its queue position.
- The empty composer reserves two text lines, and the toolbar remains compact.
- More than five rows scroll inside a five-row queue viewport.
- The queue can collapse to its header without losing queued messages or changing their order.
- Stop visibly waits, ends the active turn, and promotes the first queued message.
