# Isolated Temporary Diff Preview Implementation Plan

**Design:** `docs/superpowers/specs/2026-08-21-isolated-temporary-diff-preview-design.md`

**Goal:** Preserve the current tight red-old/green-new Diff appearance in a temporary read-only editor tab and remove all preview-time writes and rollbacks against the real source document.

**Execution boundary:** Modify only the Diff projection, temporary preview lifecycle, source-conflict resolution, and focused regression tests. Do not change approval controls, Agent rendering, Queue, Stop semantics, Run Settings, model handling, session titles, or Hermes runtime requirements.

**Working-tree rule:** The repository already contains unrelated and earlier task changes. Stage, test, and review only the files listed by this plan. Do not reset or normalize other work.

## Planned file map

- Modify `lib/diff-preview.js`: add a pure virtual-preview projection helper built on the existing tight plan.
- Modify `extension.js`: route all document Diff previews to `hermes-diff-preview`, decorate the virtual editor, close/reopen the temporary tab, revalidate source content, and report source divergence to Hermes.
- Modify `test/diff-preview.test.js`: projection and coordinate tests.
- Modify `test/extension-contract.test.js`: isolation, permission ownership, divergence feedback, and lifecycle contracts.
- Keep `lib/document-review.js` and `test/document-review.test.js` unchanged; their pure candidate construction remains the input to the new preview path.
- Do not modify `media/main.js` or `media/styles.css` unless a failing existing contract proves the unchanged preview-action binding requires it.

## Task 1: Build a pure virtual Diff projection

**Interface:**

```js
buildInlineDiffDocument(previewRecord, sourceText) -> {
  text,
  insertions,
  deletedRanges,
  addedRanges
}
```

The helper calls the existing `buildInlineDiffPlan`, applies its insertions to a string copy in descending source-offset order, and returns the final virtual-document coordinates. It never receives or calls VS Code APIs.

### RED

- Add focused tests proving the returned virtual text exactly matches the current inline preview for:
  - one-line replacement;
  - paired multi-line replacement with tight old/new interleaving;
  - separated hunks;
  - pure addition and pure deletion;
  - blank-line insertion/deletion;
  - CRLF;
  - missing final newline;
  - new file with empty source.
- Assert that the input source string and preview record are not mutated.
- Run `node test/diff-preview.test.js`; expect failure because the helper/export does not exist.

### GREEN

- Implement the helper with the smallest addition to `lib/diff-preview.js`.
- Reuse existing insertion/range calculations; do not introduce a second Diff algorithm.
- Run `node test/diff-preview.test.js`; expect all existing and new tests to pass.

### Acceptance

- Satisfies visual-coordinate portions of `AC-01`, `AC-02`, and `AC-03` without VS Code side effects.

## Task 2: Route every document Diff to one read-only temporary tab

**Interface:**

```js
openIsolatedDiffPreview(preview, pending?) -> Promise<boolean>
closeIsolatedDiffPreview({ clearSnapshot = true } = {}) -> Promise<boolean>
```

### RED

- Replace the old contract expectation that open documents use `editor.edit` with assertions that:
  - `showDocDiff` never calls `openEditorForExistingDocument` to construct a preview;
  - existing, unopened, whole-document, and new-file branches call the same isolated preview opener;
  - preview content uses the existing `hermes-diff-preview` provider;
  - the preview URI differs from the source URI;
  - source-targeted `TextEditor.edit`, `WorkspaceEdit`, `TextDocument.save`, and `workspace.fs.writeFile` are absent from the preview lifecycle;
  - `pending.diffInConfirmation` remains false and the existing preview action opens the temporary tab.
- Run `node test/extension-contract.test.js`; expect the new isolation contract to fail.

### GREEN

- Import `buildInlineDiffDocument` and construct the immutable preview snapshot after `prepareDocumentReviewBatch` produces `sourceText` and `candidateText`.
- Generate a unique `hermes-diff-preview` URI for every candidate snapshot.
- Put the projected virtual text into `diffPreviewDocuments`, open it beside the Agent, and apply the current removed/added decoration types to returned ranges.
- Preserve the current reveal position around the first change.
- Use the same opener for open files, unopened files, large/full-document candidates, and missing/new targets.
- Retire the source-editor routing from `showDocDiff`. Keep unrelated Review helpers only if another call site still uses them; otherwise remove their routing and cleanup state without refactoring adjacent behavior.
- Run `node test/extension-contract.test.js` and `node test/diff-preview.test.js`.

### Acceptance

- Satisfies `AC-01` through `AC-04` for preview creation and visual parity.

## Task 3: Make preview closing and reopening source-independent

**State contract:** The immutable `_diffPreview` snapshot owns the source URI, virtual preview URI, projected text, decorations, and permission/session identity. Closing a tab manually removes only its visible editor; it does not resolve the permission or discard the snapshot.

### RED

- Add contract coverage proving:
  - `reopenPermissionPreview` recreates/reopens the same snapshot after manual tab closure;
  - Yes, session approval, No, feedback, Stop, session disposal, and extension disposal all attempt to close the virtual tab and clear its document-map entry;
  - cleanup never reads the virtual text back as an editable candidate;
  - a tab-close failure cannot leave permission resolution blocked;
  - ordinary cleanup contains no source edit, save, or rollback branch.
- Run `node test/extension-contract.test.js`; expect failure against the existing inline rollback implementation.

### GREEN

- Replace source rollback behavior with virtual-tab disposal and decoration cleanup.
- Close only the preview tab, not unrelated tabs in the same editor group.
- Restore the owning Agent panel after decision-driven closure using the existing session ownership.
- If close fails, clear extension ownership, schedule one best-effort retry, and allow the already-selected permission decision to continue.
- Preserve the snapshot when the user manually closes the preview; clear it only on a lifecycle decision or replacement candidate.
- Run the focused contract test.

### Acceptance

- Satisfies `AC-05`, `AC-07`, and `AC-08`.

## Task 4: Revalidate both editor and filesystem state before approval

**Interface:**

```js
diffSourceMatches(preview) -> Promise<boolean>
```

### RED

- Add contract assertions and, where practical, a pure state table covering:
  - open in-memory text equals snapshot and disk equals snapshot: allow;
  - identical content saved after preview creation: allow even if editor version changed;
  - open in-memory text changed: conflict;
  - disk text changed: conflict;
  - existing source deleted: conflict;
  - missing/new target created: conflict;
  - read/stat error: conflict/fail closed.
- Assert the check compares content identity rather than editor version alone.
- Run the focused test; expect current document-version behavior to fail the new contract.

### GREEN

- For open documents, compare current `document.getText()` with `sourceText`.
- For existing targets, also read and compare filesystem content with `sourceText`.
- For missing targets, require both no open document and no filesystem entry.
- Treat exceptions other than a proven missing target as unsafe conflicts at the permission boundary.
- Perform this validation immediately before sending the ACP allow outcome.
- Run focused tests.

### Acceptance

- Completes the source-identity portion of `AC-04` and `AC-06`.

## Task 5: Convert a conflicting Yes into one non-update feedback transition

**Fixed feedback:**

```text
The source document changed during Diff approval. Do not retry this write in the current turn. In the final response, explain that the update was not applied because the user changed the original document.
```

### RED

- Add contract tests proving that a conflicting Yes or session approval:
  - sends no allow outcome;
  - closes and clears the temporary preview;
  - responds to the pending edit exactly once as cancelled/not executed;
  - does not enter the normal hard-denial fork/cancellation barrier;
  - records the related Action outcome against the original permission ownership;
  - sends the fixed message exactly once through `continuePermissionFeedback` or an equivalently bounded existing active-turn feedback seam;
  - clears Pending and leaves the normal Agent final-answer renderer active;
  - does not queue a new ordinary user prompt or automatically retry the file modification.
- Run `node test/extension-contract.test.js`; expect failure because current divergence keeps Pending open.

### GREEN

- Extract one explicit source-divergence resolver instead of overloading ordinary rejection.
- Preserve request ID, UI session ID, ACP session ID, and Action ownership.
- Cancel the waiting edit permission, record the non-update reason, post one non-hard-denial resolved state, and call the existing feedback transport with the fixed instruction.
- Ensure the helper is idempotent against repeated clicks or late events.
- Keep the existing No and user-entered feedback flows unchanged.
- Run focused tests.

### Acceptance

- Satisfies `AC-06` and preserves `AC-09`.

## Task 6: Remove obsolete source-preview state without widening scope

### RED/inspection

- Search the Diff lifecycle for `inlineApplied`, `previewText`, `diskTextBefore`, `wasDirtyBefore`, `tightInsertions`, `locatePreviewForRemoval`, source-targeted `WorkspaceEdit`, and preview-triggered `document.save()`.
- Identify every caller of `openInlineDiffPreview`, `openDocumentReview`, `openNewFilePreview`, and `rollbackDocDiffPreview` before removal or renaming.

### GREEN

- Remove state and branches that exist only to mutate or roll back the real source.
- Remove unused imports/providers only after `rg` proves no remaining call site.
- Do not refactor permission batching, cancellation barriers, Agent routing, model settings, title handling, or Webview layout.
- Run `node --check extension.js` and the focused tests.

### Acceptance

- No existing-file preview path can modify or save the source before Hermes receives approval.

## Task 7: Full regression and manual VS Code validation

### Automated

- Run `npm run lint`.
- Run `npm run test:unit`.
- Run `git diff --check`.
- Review `git diff -- extension.js lib/diff-preview.js test/diff-preview.test.js test/extension-contract.test.js` and confirm no unrelated behavior changed.

### Manual VS Code scenarios

1. Open clean file, small replacement: verify the source stays byte-identical and clean while the temporary tab shows the current tight Diff.
2. Unopened file, medium paragraph: verify the same temporary-tab style and approval popup.
3. Whole-document and separated hunks: verify red/green rows remain correctly positioned.
4. New file: verify an empty-source preview and that the real file appears only after approval.
5. Manually close preview: verify Pending remains and the preview action reopens the same snapshot.
6. Yes with unchanged source: verify the tab closes and Hermes performs one write.
7. No and feedback: verify the tab closes and the source remains unchanged.
8. Edit the real source during Pending, then Yes: verify no write, immediate tab closure, cleared Pending, and a normal Agent final response explaining the conflict.
9. Stop and close the session during Pending: verify no orphan tab, decoration, permission, or source mutation.
10. Exercise one ordinary non-edit approval, Queue/Stop, Working/Action output, model selection, Run Settings, and session-title edit as regression guards.

### Delivery evidence

- Record automated command results and manual scenario results separately.
- Do not claim manual VS Code or live Hermes proof from static/unit tests.
- Package a VSIX only when the user requests packaging; apply the user's stored explicit-version versus `-fixn` rule at that time.
