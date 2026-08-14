# Hermes Inline Commands, Queue, and Steer

Status: Approved for implementation on 2026-08-11.

Source of truth: `docs/superpowers/specs/2026-08-11-hermes-inline-command-queue-prototype-design.md`.

## Scope

- One inline Accent token for selected slash commands and installed Skills.
- Grouped, searchable slash-command picker, including `quick_commands` and installed Skills.
- Compact two-line composer and a collapsible runtime queue with at most five visible rows.
- Queue edit-in-place, delete, Steer, natural completion draining, and stop-then-drain behavior.
- Conditional `/steer`: steer an active ACP turn; otherwise submit its body as an ordinary prompt.
- Chronological `Working -> Steered user message -> Working` segments without a success toast.

## Non-goals

- No changes to Diff preview, permissions, editor-column isolation, session title editing, theme palette, or table rendering.
- No persistence of queued prompts across extension restarts.
- No reimplementation of Hermes CLI command semantics inside the extension. Selected commands are sent to Hermes as raw slash commands.

## Acceptance

1. Command and Skill candidates use the same two-line row style and the same selected inline token style.
2. Queue edits retain their index, only five rows are visible before scrolling, and the queue can collapse.
3. An active task plus non-empty input enqueues; an empty input exposes Stop.
4. Stop waits for cancellation and then starts the first queued prompt.
5. Steer creates a chronological user message and a fresh Working segment without interrupting the task.
6. Idle `/steer text` becomes a normal `text` prompt and creates no Steered marker.
7. Empty `/steer` does not submit.

