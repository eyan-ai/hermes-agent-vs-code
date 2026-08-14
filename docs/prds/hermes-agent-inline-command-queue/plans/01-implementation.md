# Implementation Plan

## 1. Pure state and catalog

- Add a command catalog with built-in groups, installed Skills, and parsed `quick_commands`.
- Add a runtime queue abstraction with stable IDs and index-preserving edits.
- Verify with focused unit tests.

## 2. Extension host orchestration

- Include commands and the per-session runtime queue in webview state.
- Route sends to queue while a turn is active.
- Add edit/delete/steer queue messages and drain after completion or confirmed stop.
- Send selected slash commands raw; keep existing Skill prompt composition.

## 3. ACP steer segmentation

- Send `/steer <text>` as a concurrent ACP prompt only while the session has an active turn.
- Retarget the renderer to a new assistant message while preserving the same turn lifecycle.
- Suppress only Hermes' immediate steer acknowledgement, not model output.

## 4. Webview

- Replace the separate Skill column plus textarea with one contenteditable prompt flow.
- Render grouped, filtered command candidates and a unified inline token.
- Add compact collapsible queue UI with Steer, Edit, and Delete actions.
- Preserve normal composer context, attachments, permissions, and keyboard submission.

## 5. Verification

- Run unit tests, syntax checks, full tests, Extension Host smoke, and a final scoped diff review.
