# Isolated Temporary Diff Preview Design

Date: 2026-08-21

Status: Confirmed design; implementation not started

## 1. Goal

Move every existing-file Diff preview out of the real source document and into a temporary, read-only VS Code editor tab while preserving the currently approved tight Diff appearance.

The source document must remain untouched until the user approves the pending Hermes edit. Opening, closing, rejecting, stopping, or abandoning a preview must never require source-content rollback.

## 2. Scope

This design applies to:

- existing files whether their source document is already open or not;
- local, medium, whole-document, and separated multi-hunk changes;
- additions, deletions, replacements, blank-line changes, CRLF, and missing final newlines;
- missing targets represented as new-file previews;
- the lifecycle of preview open, reopen, approve, reject, feedback, Stop, session disposal, and extension disposal.

The implementation must preserve:

- the current tight red-old/green-new ordering and Diff colors;
- the existing approval popup and its Yes, session approval, No, and feedback behavior;
- Agent Working, Action, final-answer, Queue, Stop, and Run Settings behavior;
- the current ACP permission contract and Hermes runtime compatibility.

## 3. Non-goals

- Do not switch to VS Code's native side-by-side Diff layout.
- Do not redesign Diff colors, typography, line ordering, approval controls, or confirmation copy.
- Do not make the temporary preview an editable candidate editor.
- Do not merge user changes made after preview creation into the Agent candidate.
- Do not bundle or require a modified Hermes CLI or ACP Adapter.
- Do not change unrelated new-session, model, title, approval, rendering, or queue behavior.

## 4. Current Root Cause

The current inline Diff path temporarily inserts candidate text into the real `TextDocument` and decorates the combined content. Cleanup must later identify and remove those extension-owned insertions.

If the user edits the document during approval, the document version and content diverge from the recorded preview snapshot. The extension can no longer prove which content belongs to the preview and which belongs to the user, so safe rollback fails. This can leave preview content in the source document or keep the permission UI stuck in Pending.

The fix is to remove source mutation from preview creation entirely, rather than adding more rollback cases.

## 5. Architecture

### 5.1 Source snapshot

When Hermes requests approval for a document change, the extension reads the source exactly once:

- If the target has an open `TextDocument`, use its current in-memory text.
- Otherwise, read the file from the workspace filesystem.
- If the target does not exist and the operation is a new file, use an empty source.

Record at least:

- target URI and display path;
- source kind: open document, file, or missing;
- exact `sourceText`;
- exact `candidateText`;
- the current tight inline plan and its red/green ranges;
- owning UI session and permission request.

### 5.2 Virtual preview document

Create a temporary document with a dedicated read-only URI scheme. Its content is the same combined preview text currently produced for inline Diff: the source snapshot plus the generated candidate rows required by the tight inline plan.

Open that document in a temporary editor tab beside the Agent. Apply the existing removed-line and added-line decorations to the virtual editor using the existing tight-plan coordinates and VS Code theme colors.

The virtual document is not the source file and cannot be saved back to it. No preview operation may call `TextEditor.edit`, `WorkspaceEdit`, or `TextDocument.save` against the source URI.

### 5.3 One preview path

Use the isolated temporary tab regardless of whether the source document is already open. Local, medium, whole-document, and multi-hunk previews share the same lifecycle.

New files use the same isolation contract with an empty source snapshot and the complete candidate content. The preview styling may omit red rows when there is no original content.

### 5.4 Approval remains in the Agent UI

The temporary tab only displays the Diff. The existing Agent confirmation popup remains the sole place for Yes, session approval, No, feedback, and preview reopen actions.

Manually closing the temporary tab is not an approval decision. The permission remains Pending, and the existing preview action can reopen the same snapshot.

## 6. State and Data Flow

```text
Hermes edit permission
        |
        v
capture sourceText and candidateText
        |
        v
build current tight Diff plan
        |
        v
open read-only temporary Diff tab
        |
        +--------------------------+
        |                          |
        v                          v
 Yes / session approval       No / feedback / Stop
        |                          |
        v                          v
revalidate real source        close temporary tab
        |                      clear preview state
        |
        +-- unchanged --> close tab --> respond through existing ACP path
        |
        +-- changed ----> close tab --> cancel edit --> notify Agent
```

## 7. Decision Behavior

### 7.1 Yes or session approval with unchanged source

Immediately before responding to Hermes, compare the current real source with `sourceText`:

- An open document's current text must equal `sourceText`.
- The corresponding filesystem content must also equal `sourceText`.
- A missing target must still be missing.

Saving identical content does not constitute a conflict. Content identity, not editor version alone, controls the decision.
If the source was already dirty when the preview opened, the user may save it before approving; approval is allowed only when the saved and in-memory content both equal the captured snapshot.

When the source still matches:

1. close the temporary Diff tab;
2. clear extension-owned preview state and decorations;
3. respond to the existing Hermes permission with the user's original approval decision;
4. allow the existing Hermes edit operation to perform the real write.

The extension must send exactly one permission response and must not write the candidate independently.

### 7.2 Yes or session approval after source divergence

The source is divergent when its in-memory or filesystem content differs from `sourceText`, an existing file was removed, or a missing target was created after preview generation.

When divergence is detected:

1. do not write the source file;
2. close the temporary Diff tab immediately;
3. clear preview state and resolve the pending edit as not executed without entering the ordinary hard-denial cancellation path;
4. send one fixed feedback message through the existing active-turn feedback path:

   `The source document changed during Diff approval. Do not retry this write in the current turn. In the final response, explain that the update was not applied because the user changed the original document.`

5. keep the existing Agent Working, Action, and final-answer rendering path active so Hermes can report the reason normally.

The permission UI must not remain Pending after this transition.

### 7.3 No

Close the temporary tab, clear preview state, and use the existing rejection behavior. Since the source was never mutated, no rollback is required.

### 7.4 Feedback

Close the current temporary tab and send the user's feedback through the existing feedback path. If Hermes produces a revised candidate, open a new temporary tab using a new source snapshot and candidate snapshot.

### 7.5 Stop, session disposal, and extension disposal

Close the temporary tab, dispose its decorations and virtual-document content, clear preview ownership, and continue through the existing bounded cancellation and cleanup paths. No cleanup branch may edit or save the source file.

## 8. Error Handling

- If the source cannot be read, fail closed and do not offer an approvable Diff.
- If the Diff cannot be located or projected safely, keep the existing regeneration warning and do not create a partial preview.
- If the virtual document cannot be opened, keep the permission unresolved and show the existing safe-preview failure message.
- If the user manually closes the tab, retain enough immutable preview state to reopen it.
- If closing the temporary tab fails, clear extension-owned preview state without modifying the source, retry tab disposal asynchronously, and continue resolving the user's decision; a tab-cleanup failure must not deadlock approval.
- If source revalidation throws, treat it as a conflict: do not approve the write, close the preview, and notify Hermes of the non-update reason.

## 9. Implementation Boundary

Expected implementation areas:

- `extension.js`: preview creation, virtual document lifecycle, decoration target, reopen/close, source revalidation, and divergence feedback routing;
- `lib/diff-preview.js`: reuse the existing tight plan; change only if a virtual-document projection helper is required;
- focused contract and unit tests for preview isolation and lifecycle.

The implementation should remove the existing-file preview dependency on:

- temporary edits to the source editor;
- `inlineApplied`, `previewText`, `diskTextBefore`, `wasDirtyBefore`, and source rollback insertion records;
- rollback code that deletes candidate insertions from the real source.

Unrelated code must not be refactored.

## 10. Acceptance Criteria

### AC-01: Source isolation

Opening, reopening, manually closing, rejecting, giving feedback on, stopping, or disposing a Diff preview leaves the source document text, filesystem content, editor version, and dirty state unchanged.

### AC-02: Visual parity

The temporary tab preserves the current tight Diff ordering, red removed rows, green added rows, unchanged context, theme colors, reveal position, CRLF offsets, and missing-final-newline behavior.

### AC-03: Unified availability

The isolated preview works for open files, unopened files, new files, local edits, medium edits, whole-document edits, and separated multi-hunk edits.

### AC-04: Approval

With an unchanged source, Yes and session approval close the preview and send exactly one existing ACP allow response. The extension does not independently write the candidate.

### AC-05: Rejection and feedback

No and feedback close the preview immediately and produce no source write or rollback. Feedback regeneration creates a fresh preview snapshot.

### AC-06: Source divergence

If the real source changes after preview creation, Yes does not write, the preview closes, Pending clears, Hermes receives the fixed non-update feedback exactly once, and the Agent can produce a normal final response explaining why the update was not applied.

### AC-07: Manual tab closure

Closing the temporary tab manually does not decide the permission. The existing approval UI can reopen the same immutable preview.

### AC-08: Lifecycle cleanup

Stop, session closure, terminal ACP cleanup, and extension disposal cannot leave a temporary Diff tab, decoration, virtual-document entry, permission deadlock, or source mutation behind.

### AC-09: Regression boundary

Approval controls, permission ownership, Agent Working/Action/final-answer output, Queue, Stop, model selection, Run Settings, session title behavior, and Hermes compatibility remain unchanged.

## 11. Regression Test Matrix

Cover at minimum:

- open clean file, open dirty file, unopened file, missing/new file;
- single-line addition, deletion, replacement, blank-line change;
- medium paragraph, whole-document replacement, and separated multi-hunk change;
- CRLF and missing final newline;
- existing tight old/new interleaving and exact decoration ranges;
- source content/version/dirty-state identity before and after preview lifecycle actions;
- Yes, session approval, No, feedback, manual tab close/reopen, Stop, session disposal, and extension disposal;
- source edited in memory, source changed on disk, source deleted, and missing target created during approval;
- exactly one ACP outcome and one divergence feedback message;
- final-answer routing after divergence;
- existing approval, Queue, Agent renderer, model picker, and Run Settings contract tests.

## 12. Completion Evidence

Implementation is complete only when:

- focused unit and contract tests pass;
- the full unit suite and lint pass;
- `git diff --check` passes;
- a manual VS Code validation proves the temporary tab is read-only, visually matches the current Diff, closes on decisions, and never changes the source before approval;
- a manual source-divergence validation proves the file is not written and Hermes reports the non-update reason in its final answer.
