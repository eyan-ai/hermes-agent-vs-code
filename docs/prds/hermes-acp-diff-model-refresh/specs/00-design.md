# Hermes VS Code Diff Recovery, Model Refresh, and Run Settings Design

Date: 2026-08-19
Status: Confirmed

## 1. Goal

Deliver three isolated corrections without changing ordinary approval, Agent rendering, queueing, stop, or final-answer behavior:

1. A user-edited inline Diff preview must never trap the permission UI.
2. Whole-document and multi-hunk inline Diff previews must align additions and deletions at their real source locations.
3. Run Settings must remain stable while refreshing and selecting models. Per-model Effort is an optional enhancement shown only when the connected Hermes ACP server advertises that capability for the selected model.

## 2. Scope and Non-goals

### In scope

- VS Code extension Diff preview projection, rendering, cleanup, and permission recovery.
- VS Code Run settings model picker and refresh interaction.
- Plugin-owned Run Settings layout, model picker, refresh behavior, and compatibility handling.
- An optional compatible Hermes ACP extension for session-scoped reasoning effort only.
- Capability detection and graceful behavior with older Hermes ACP versions.
- Regression tests covering the reported failures and existing interaction invariants.

### Out of scope

- Writing reasoning preferences to the global Hermes `config.yaml`.
- Changing Hermes Desktop, CLI, Gateway, or unrelated session behavior.
- Automatically merging arbitrary user edits into an Agent-generated candidate.
- Automatically replacing a current model that disappears from the refreshed list.
- Shipping a private or forked Hermes Python runtime inside the VSIX.
- Making Diff, model refresh, approval UI, or Agent rendering depend on a Hermes source patch.
- Restoring the complete `/Users/eyan/hermes-local-changes-backup-20260818-234128.patch` as part of this work.
- Publishing to the VS Code Marketplace.

## 3. Proven Current-state Causes

### 3.1 Edited preview permission deadlock

The inline preview temporarily inserts candidate text into the real editor document. The extension records the resulting document version and text. When the user edits that preview, both the document version and preview text diverge.

Approval correctly refuses to continue because the source is no longer the recorded preview. However, rejection and feedback currently call the same strict rollback routine. That rollback also refuses to remove content after any divergence. Every permission choice therefore returns to Pending and the user has no safe escape path.

### 3.2 Whole-document Diff misalignment

The current whole-document localization creates one large edit from the first changed character to the last changed character. The tight inline preview then pairs old and new lines by ordinal position. Insertions, deletions, blank lines, and separated hunks shift later ordinals, causing unrelated old and new lines to be paired and producing artificial blank red or green blocks.

### 3.3 Stale model choices

The extension retains process-level Hermes configuration/model caches and also persists `session.modelState`. Existing sessions prefer the persisted runtime list, so CC Switch or external Hermes configuration changes are not reflected until a new ACP session happens to return a fresh model state.

The current model list is rendered inside the Run Settings document flow, so expanding it changes the popup height. The model button's SVG also lacks a local size constraint, allowing the chevron to stretch the row.

Hermes Agent v0.20.4 already exposes model state and `session/set_model`, so Diff and model refresh do not require a Hermes source change. Its ACP session responses do not advertise `reasoning_effort`; the VSIX must therefore hide Effort while preserving all core behavior.

## 4. Diff Recovery Contract

### 4.1 Unmodified preview

When the inline preview still matches the recorded preview snapshot, existing behavior remains unchanged:

- Yes approves once.
- Always allow approves and records the existing session grant.
- No rejects.
- Tell Hermes submits feedback through the existing permission path.
- Stop and session disposal use the existing safe cleanup path.

### 4.2 Modified preview

When the editor document no longer matches the recorded inline preview:

- Yes and Always allow must not approve the original Agent change.
- The permission UI must expose `Keep my edits and cancel this change`.
- The action must preserve the current document exactly as it is.
- It must remove decorations and extension-owned preview state without attempting an unsafe content rollback.
- It must resolve the ACP permission as rejected/cancelled, clear Pending state, and release the permission queue according to existing denial rules.
- No, Stop, session close, extension disposal, and terminal ACP cleanup must also have a guaranteed escape path that cannot be blocked by the failed rollback.
- The extension must never silently delete or overwrite user-edited content.

The extension does not attempt to infer which divergent characters belong to the user versus the temporary preview. Approving or automatically merging a modified preview is explicitly unsupported.

## 5. Whole-document and Multi-hunk Diff Contract

### 5.1 Operation model

Build a line-level operation stream using LCS:

- `equal`
- `delete`
- `add`

Partition the stream into change groups separated by equal operations. Alignment and insertion records are computed independently within each change group. No pairing may cross an unchanged line or hunk boundary.

### 5.2 Rendering rules

For an equal-size replacement:

```text
old line 1
new line 1
old line 2
new line 2
```

For unequal replacements:

- Pair only lines in the same change group.
- Render surplus additions after the last paired or anchored line in that group.
- Render surplus deletions as deleted lines without creating empty addition placeholders.

For pure additions:

- Render only added lines at the nearest stable source anchor.

For pure deletions:

- Decorate only the deleted source lines and insert no candidate text.

Blank lines are decorated only when they are real add/delete operations. Equal blank lines and unchanged paragraphs remain untouched.

### 5.3 Reversibility

- Record every temporary insertion using final preview-document coordinates.
- Clean insertion ranges in reverse order.
- Validate the preview snapshot before ordinary rollback.
- If validation fails, use the modified-preview recovery contract instead of guessing ranges.
- Small localized Diff behavior must remain unchanged unless it enters the same proven multi-line alignment path.

## 6. Model Refresh Contract

Run Settings has a stable outer frame containing:

- Mode;
- Model;
- Effort only when supported for the selected model;
- a bottom Refresh models action.

Model and Effort choices open as independent floating listboxes. Opening or closing either listbox must not change the Run Settings outer dimensions. The model chevron has an explicit fixed size and cannot stretch its row.

Run settings adds a bottom action:

```text
Refresh models
```

On activation:

- Prevent duplicate concurrent refreshes.
- Close every open Model or Effort listbox before refresh work starts.
- Clear the extension's process-level Hermes config/model caches.
- Clear the active UI session's stale model options.
- Re-read the current Hermes/CC Switch configuration and model catalog.
- Update the displayed choices from the freshly read local catalog while retaining existing `session/set_model` behavior.
- Preserve the previous list if refresh fails.
- Show explicit `Refreshing`, `Refreshed`, or `Failed` feedback.
- Finish with Run Settings still open and no child listbox expanded, matching the initial-open state.

Refresh must not automatically change the selected model. If the current model is absent from the refreshed options, it remains visible as `Unavailable` until the user explicitly selects another model.

Refresh preserves the selected Mode, Model, and per-model Effort memory. It must not interrupt an active turn, permission, Working stream, queue item, or final-answer rendering.

## 7. Model Picker and Per-model Reasoning

Replace the native model `select` with a keyboard-accessible custom list. Each option displays model name and provider/description. The list is a floating layer and does not participate in Run Settings layout.

After model selection, capability state controls the Effort field:

- if the selected model's ACP session state advertises `reasoning_effort`, show an independent Effort field below Model;
- if capability is absent, hide the Effort label, trigger, listbox, and layout space;
- do not show an update prompt or disabled placeholder;
- do not send `session/set_config_option` when capability is absent.

Clicking the Effort trigger opens a separate floating listbox with these exact user-facing labels:

- Low
- Medium
- High
- Extra High
- Max
- Ultra

The labels above must retain their capitalization everywhere in the UI. Lowercase values are internal ACP wire values only and must never replace the user-facing labels.

The UI labels map to internal Hermes ACP values as follows:

```text
Low        -> low
Medium     -> medium
High       -> high
Extra High -> xhigh
Max        -> max
Ultra      -> ultra
```

Reasoning memory is keyed by full model ID inside each VS Code UI session. For example:

```text
anthropic:claude-sonnet-4.6 -> high
deepseek:deepseek-v4-flash -> medium
```

Switching back to a model restores that model's last choice. The memory does not propagate to other VS Code UI sessions and is not written to global Hermes configuration.

The Model and Effort listboxes must support mouse, keyboard focus, arrow navigation, Enter/Space selection, and Escape dismissal. Model selection closes its listbox before capability state is rendered. Effort selection closes its listbox after persisting the model-specific value.

## 8. Hermes ACP Compatibility Contract

### 8.1 Capability advertisement

The compatible Hermes ACP Adapter may advertise a standard ACP session config option with ID `reasoning_effort` in session responses for clients that explicitly identify support, including `hermes-agent-vscode`. It advertises the option only when the active model supports Thinking/Reasoning. Existing clients such as Zed that can replace their model picker when config options are present must retain their current response shape. The option choices use these exact user-facing labels and internal values:

```text
Low        -> low
Medium     -> medium
High       -> high
Extra High -> xhigh
Max        -> max
Ultra      -> ultra
```

The presence of this advertised config option is the sole capability signal. The VSIX must not infer support from Hermes version strings or maintain its own model-name allowlist. Hermes records the connected `clientInfo.name` during initialize and advertises the option only to opted-in compatible clients and reasoning-capable active models.

### 8.2 Standard ACP request

```text
session/set_config_option
```

The VSIX sends:

```json
{
  "sessionId": "mapped ACP session",
  "configId": "reasoning_effort",
  "value": "high"
}
```

The Adapter must:

- validate session ownership;
- validate the effort value;
- store the current effort within that ACP session;
- update only that session's runtime reasoning configuration;
- avoid writes to global config;
- avoid changes to other ACP sessions, Desktop, CLI, or Gateway behavior;
- return refreshed standard `configOptions` state to the client.

Per-model memory remains owned by the VSIX UI session. After `session/set_model`, the VSIX refreshes standard session state. It shows Effort only if the refreshed response contains `reasoning_effort`, then sends the remembered value for the newly selected model. If the option is absent, no effort request is sent.

### 8.3 Older Hermes

When the capability is absent:

- local model refresh and existing model selection remain available;
- the entire Effort field is hidden without reserving layout space;
- no update message or disabled reasoning control is displayed;
- no unsupported request is sent;
- Diff, approval UI, Agent rendering, queueing, Stop, and final-answer behavior remain available;
- no UI success state is shown for an operation that did not reach Hermes.

If a supported Adapter rejects an effort change, the VSIX restores the previous displayed value and surfaces the error.

## 9. Isolation Invariants

The implementation must not change:

- original ACP permission request IDs, session IDs, tool-call IDs, options, or raw input;
- approval wording and choices for an unmodified preview;
- permission ownership and queue ordering;
- hard-denial barriers and turn cancellation behavior;
- Stop behavior outside the new guaranteed preview escape path;
- Thinking, Action, Working, Todo, Queue, command result, or final-answer routing;
- ordinary small Diff rendering that does not use the faulty whole-document alignment path;
- new-file and unopened-file review behavior;
- Hermes global model or reasoning configuration.
- Hermes Desktop, CLI, Gateway, memory loading, and permission timeout behavior.

## 10. Acceptance and Regression Coverage

### Diff recovery

- Delete one generated line and attempt Yes.
- Delete two generated blank lines and attempt Yes.
- Edit inserted candidate text and attempt Always allow.
- After divergence, `Keep my edits and cancel this change` exits and preserves byte-for-byte document content.
- After divergence, No, Stop, session close, and extension disposal cannot remain blocked.
- Permission, Pending, queue, and turn ownership settle correctly after escape.

### Diff alignment

- Existing small two-paragraph Diff behavior remains green.
- Whole-document single change.
- Whole-document separated multi-hunk changes.
- Equal and unequal replacements.
- Pure addition and pure deletion.
- Chinese long paragraphs and blank lines.
- CRLF and missing final newline.
- Repeated lines and repeated paragraphs fail closed when an anchor is ambiguous.
- User edits prevent guessed rollback.

### Models

- Run Settings outer dimensions do not change when Model or Effort is opened.
- Mode and Model remain visible; Refresh models remains fixed in the bottom footer.
- The model chevron remains within its fixed icon bounds.
- Old session refreshes to the latest CC Switch model list.
- New session and old session converge on the same refreshed source.
- Refresh failure preserves the old list.
- An unavailable current model remains visible and is not silently replaced.
- Model choice continues to call existing `session/set_model`.
- Selecting a reasoning-capable model displays Effort below Model.
- Selecting a model without advertised capability removes the complete Effort field and its layout space.
- Clicking Effort opens a separate six-option listbox; no hover submenu is used.
- Each model remembers its own Low/Medium/High/Extra High/Max/Ultra choice in the same UI session.
- A compatible ACP applies, rejects, and reports effort changes correctly.
- An older ACP hides Effort without an update prompt and without breaking model refresh.
- Clicking Refresh while Model or Effort is open closes both child listboxes before refreshing and finishes in the initial-open Run Settings state.

### Existing behavior

- Full lint and unit suite pass.
- Approval, denial, feedback, Stop, permission queue, ACP routing, Working, Action, and final-answer contract tests pass unchanged except for explicit new recovery assertions.
- Packaging validation confirms the intended version, source files, README hash, archive integrity, and retention of the previous VSIX.

## 11. Delivery Boundary

The VSIX is the complete delivery for Diff recovery, Diff alignment, Run Settings layout, model selection, model refresh, and refresh-state handling. These core features must work with the user's unchanged Hermes installation through its existing ACP model interface.

Compatible Hermes ACP Adapter changes are an optional, separate source deliverable governed only by the standard ACP config-option contract. They enable Effort but are not a prerequisite for any core plugin capability. A VSIX-only installation on an older Hermes receives every core correction and simply does not render Effort.

Implementation must not modify the user's installed Hermes checkout as an installation mechanism. Adapter work must be delivered through the appropriate Hermes source/release path, not as an untracked local patch.

This design does not assign the next package version. Version selection requires explicit confirmation before packaging and does not change the behavior contract above.
