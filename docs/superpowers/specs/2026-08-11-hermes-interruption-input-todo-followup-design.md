# Hermes Interrupted, Stable Composer, and Todo Follow-up Design

Status: Confirmed for implementation on 2026-08-11 after interactive HTML review.

Target: the current Hermes Agent VS Code extension source at version `0.2.35`, including the inline command and runtime queue implementation.

## 1. Goals

This follow-up fixes three related conversation-state problems without changing unrelated interaction behavior:

1. Every manually stopped assistant response permanently retains an `Interrupted` line at the end of that response.
2. Streaming assistant output must not replace the focused prompt DOM, interrupt typing, move the caret, or break an active IME composition.
3. Native Hermes ACP Todo updates render as a compact Todo capsule above the queue, while the queue remains directly above the composer.

## 2. Non-goals

- No changes to runtime queue ordering, Steer semantics, queue edit-in-place, or the five-row queue limit.
- No changes to slash commands, Skill tokens, Diff preview, permissions, editor-column isolation, title editing, themes, tables, or Thinking height rules.
- No Todo persistence after the active task ends.
- No new Todo editing controls; the capsule is a read-only view of the active Hermes plan.
- No persistence of runtime Todo or queued prompts across extension restarts.

## 3. Interrupted Status

### Current problem

The stopped assistant message keeps `status: "stopped"`, but `answerStatusLine()` only renders a status for the last assistant message. A later turn therefore hides the earlier `Interrupted` line.

### Required behavior

- Every assistant message with `status: "stopped"` renders `Interrupted` as the last line of its own answer body.
- Every assistant message with `status: "failed"` continues to render `Tool Interrupted` as the last line of its own answer body.
- These terminal status lines remain visible after later user and assistant messages are appended.
- The animated `Working...` line belongs only to the currently running assistant message.
- The optimistic webview-only `_interrupted` flag may show `Interrupted` immediately after Stop is clicked, but persisted rendering must come from the message's terminal status.
- Starting or submitting a later message may clear the optimistic `_interrupted` flag, but must not alter an earlier message's `status: "stopped"` rendering.

## 4. Stable Composer During Streaming

### Current problem

Every state, answer-chunk, and thinking update calls the full `render()` function, which replaces `#app.innerHTML`. This destroys and recreates the focused `contenteditable` prompt and interrupts focus, caret position, selection, and IME composition.

### Rendering boundary

The webview will separate stable input DOM from live output regions:

- **Conversation live region:** diagnostics, user/assistant messages, Working and Thinking content.
- **Accessory live region:** active Todo capsule and runtime queue.
- **Stable composer:** prompt node, selected command/Skill token, attachments, context controls, mode control, and send/stop button.

Assistant streaming updates must update the conversation and accessory regions without replacing the prompt node.

### Update rules

- `assistantChunk`, `thinkingUpdate`, routine `state` updates, queue changes, and Todo changes use partial live-region rendering.
- While the prompt is focused or an IME composition is active, its DOM node identity, text, token, focus, selection, and caret remain unchanged.
- Queue and Todo updates may change the accessory region while the user continues typing.
- Send/Stop state may be patched on the existing button without rebuilding the prompt.
- Full rendering remains allowed for explicit structural transitions such as initial load, session switch, permission mode entry/exit, history/settings layout changes, and intentional composer reset after submission.
- Session switching intentionally discards the previous session's transient prompt focus and renders the target session state.
- Permission requests may intentionally replace the prompt area because the user must resolve the approval before continuing that turn.

### Scroll behavior

- Existing conversation auto-follow behavior remains unchanged.
- Updating the conversation region must not move the composer or change its height.
- Queue/Todo height changes may reduce the visible conversation area, but must not reset prompt focus or caret.

## 5. Native Todo Data

### Current problem

Hermes ACP emits Todo state as `agent_plan_update.entries`. The renderer currently reads only `raw.items` or `raw.plan`, so `assistantMessage.plan` is never populated from the actual ACP payload.

### Normalization

- Read native Todo entries from `raw.entries` first, while retaining compatibility with `raw.items` and `raw.plan`.
- Normalize every entry to `{ content, status }` using ACP statuses `pending`, `in_progress`, and `completed`.
- Native `entries` updates are full-list replacements, not incremental merges.
- An empty native `entries` array clears the active plan and removes the Todo capsule.
- Compatibility formats may retain their existing merge behavior only when they are genuinely incremental.
- Todo updates populate `assistantMessage.plan` only for the assistant segment that owns the active turn.

### Thinking duplication

- Native plan updates must no longer add a separate textual Plan/Todo list to the Thinking timeline.
- Normal tool activity may still show the Todo tool invocation according to existing action rendering, but the structured Todo list has one visual owner: the capsule.

## 6. Todo and Queue Hierarchy

The fixed bottom stack is ordered from current work to future work:

```text
Conversation
Todo capsule (current active task)
Queued messages (future prompts)
Composer
```

### Todo capsule

- Appears only when the currently running assistant message has at least one Todo entry.
- Default state is collapsed and shows `Todos <completed>/<total>`.
- The in-progress status remains visually animated using the existing semantic theme color.
- Clicking the capsule opens its read-only Todo list upward into the conversation area.
- The Todo popover must not cover or reorder the queue.
- The capsule and its popover remain theme-aware and keyboard accessible.
- When the task completes, fails, or is stopped, the capsule disappears from the composer area; the historical Thinking/answer content remains unchanged.

### Queue coexistence

- The Todo capsule is rendered before the queue in document order.
- The queue remains immediately above the composer and retains its independent fold state.
- Queue actions, five-row maximum, scroll behavior, editing position, and Steer behavior do not change.
- Opening or closing Todo does not expand, collapse, or scroll the queue.

## 7. Failure and Edge Cases

- A stopped response with no answer text still displays `Interrupted` inside its assistant response block.
- Multiple stopped turns each retain their own `Interrupted` line.
- A failed turn followed by a new turn retains `Tool Interrupted` on the failed response.
- A Todo update arriving while the user is composing text updates the capsule without disturbing the prompt.
- A Todo update received after the turn has already terminated is ignored by the completed renderer lifecycle.
- Steer continuation Todo updates belong to the currently targeted assistant continuation segment.
- An empty Todo replacement removes `Todos 0/0` instead of displaying an empty capsule.

## 8. Acceptance Criteria

1. Stop a task, send another prompt, and verify the first stopped response still ends with `Interrupted`.
2. Stop two different turns and verify both responses retain their own `Interrupted` lines.
3. Type continuously, including Chinese IME composition, while answer and Thinking updates stream; focus, text, token, selection, and caret remain stable.
4. Verify the actual prompt DOM node is not replaced during routine stream updates.
5. Feed a real-shaped `agent_plan_update` containing `entries`; the Todo capsule appears with correct completed/total counts.
6. Feed an empty `entries` replacement; the Todo capsule disappears.
7. Verify the structured Todo list is not duplicated as a separate textual Plan block in Thinking.
8. With Todo and Queue both present, verify the order is Todo, Queue, Composer and both fold states remain independent.
9. Open Todo details and verify they expand upward without covering the queue or interrupting prompt input.
10. Run unit/contract tests, Chromium webview interaction tests, `git diff --check`, and VS Code Extension Host smoke tests.
