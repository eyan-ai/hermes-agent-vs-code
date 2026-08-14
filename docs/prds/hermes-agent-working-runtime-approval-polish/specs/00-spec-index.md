# Hermes Working Runtime and Approval Polish Spec

Status: Confirmed on 2026-08-13 after interactive HTML review.

Target baseline: Hermes Agent VS Code extension `0.2.45` in the current working tree.

Confirmed prototype: [hermes-working-runtime-approval-prototype.html](../../../../../hermes-working-runtime-approval-prototype.html)

## 1. Goal

This follow-up fixes the confirmed, narrowly scoped presentation and approval-state problems in the existing Working experience. It must preserve the current interaction architecture and must not redesign the conversation, composer, editor routing, Diff workflow, Queue, Todo, command, Skill, or message components.

The implementation is complete only when all behaviors below pass their acceptance checks and the protected existing behaviors in section 6 remain unchanged.

## 2. Required Changes

### 2.1 Keep the final `Working...` line animated and continuously legible

Current problem:

- The final status line periodically fades the `Working...` text to low opacity.
- When the animation pauses or the window is inactive, it can appear stuck in a dim state and no longer feels active.

Required behavior:

- The running assistant response continues to show `Working...` as the final line of its body.
- The animation must remain. Do not replace it with a static label.
- The `Working` word stays at full readable opacity throughout the animation.
- The three trailing dots remain part of the visible label and animate in sequence to suggest ongoing streamed output.
- The dot sequence uses a restrained staggered brightness and/or vertical movement; it must not move or resize the surrounding layout.
- The leading status dot may retain its existing restrained pulse, scale, or halo animation.
- Even if CSS animation is paused, the leading dot, `Working`, and all three trailing dots must remain clearly visible in the Accent color.
- Existing `Interrupted` and `Tool Interrupted` terminal lines remain unchanged.
- The final status line has one running vocabulary and one terminal vocabulary only:
  - all active phases, including executing approved work, use the same literal `Working...` label and the same animation;
  - a user-rejected turn that is cancelled uses the existing literal `Interrupted` terminal label.
- Do not introduce phase-specific final-line labels such as `Applying approved edit...`, `Applying approved items...`, or `Interrupted after denial`.
- Approval progress or outcome details belong in the confirmation/Working content, not in a new final-line status vocabulary.

Minimum implementation boundary:

- Change only the `Working...` status markup, `.working-status.working`, `.working-dot`, trailing-dot styles, and related keyframe rules in `media/main.js` and `media/styles.css`.
- Do not change status ownership, message terminal status, placement, wording, or rendering conditions in `media/main.js` unless required by a regression test.

### 2.2 Auto-follow the latest output until the user manually takes control

Current problem:

- Streaming output normally follows the latest line, but subsequent live updates can pull the viewport back to the bottom after the user has manually moved upward.

Required behavior:

- When a new assistant run starts, the conversation automatically positions the latest assistant output above the composer.
- While the user remains at the bottom, new output continues following the latest line.
- The first deliberate upward scroll outside the bottom threshold disables auto-follow immediately.
- Once auto-follow is disabled, streaming chunks, Working updates, Action updates, confirmation changes, and composer resize must preserve the user's current scroll position.
- New output must never steal the viewport while the user is reviewing an earlier section.
- Auto-follow is enabled again only when:
  - the user manually scrolls back to the bottom; or
  - the user clicks the centered `回到最新输出` control shown near the bottom of the conversation.
- The control is hidden while the viewport is already following the latest output.
- The existing running Thinking detail may continue to keep its own ten-line viewport focused on its newest line; this change applies to the outer conversation scroll only.

Minimum implementation boundary:

- Consolidate the existing outer conversation scroll state in `media/main.js`; do not create a second competing follow flag.
- Add only the small `回到最新输出` control and its styles in `media/main.js` and `media/styles.css`.
- Do not replace the conversation DOM or modify the stable composer rendering boundary.

### 2.3 Simplify `Search` Action titles

Current problem:

- Search titles may expose raw regular expressions, query parameters, result counts, JSON, or other detailed execution data.

Required behavior:

- The title row after `Search` contains exactly one concise target:
  - a concrete document filename; or
  - a complete web URL; or
  - one short natural-language description of the search intent.
- Raw regex, JSON, match formatting, result counts, line matches, and long query details are not displayed in the title row.
- Detailed query and result data remain available only inside the existing expandable Action detail.
- A document target follows the filename/link behavior in section 2.5.
- A URL uses ordinary text color, one continuous hover underline, and the existing external-browser open behavior.

Minimum implementation boundary:

- Normalize Search summaries where ACP Action data becomes a Working step, primarily in `lib/acp-render.js` and the existing CLI fallback in `lib/chat-parser.js`.
- Keep raw input/result payloads in existing detail fields. Do not discard data needed by the expanded detail.
- Do not modify non-Search Action titles except for the command-execution normalization below and the common filename rendering in section 2.5.

Command-execution title rule:

- Python, Shell, Bash, Terminal, `execute_code`, and equivalent command-execution Actions are all displayed as `Run command`.
- Do not expose the execution runtime or language in the Action title. Titles such as `Run Python`, `Run Shell`, and `Terminal` are not allowed.
- The title may append one short natural-language purpose, for example `Run command · 统计章节与重复内容`.
- The complete command, script, runtime-specific source, and necessary output remain only inside the existing expandable Action detail.
- Existing IN/OUT rendering remains available only when the input/output distinction is meaningful; this change does not increase its use.

Minimum implementation boundary:

- Normalize execution labels in the existing Action label mapping in `lib/acp-render.js` and the CLI fallback in `lib/chat-parser.js`.
- Reuse the current expandable code/detail rendering. Do not add runtime badges, language labels, or a new command card component.

### 2.4 Use plain expanded text for natural language and cards only for structured content

Current problem:

- Expanded Action content is currently at risk of being rendered through one generic detail-card style.
- Applying a background, border, rounded container, fixed height, and inner scrolling to Thinking or ordinary explanations changes the previously approved natural reading flow.
- Code and structured output can also inherit a red/error-like foreground even when the Action is not failed.

Required behavior:

- The expanded-detail style is selected by content type, not merely because content is expandable.
- Plain natural-language detail uses the existing unframed Working text treatment: no filled background, border, rounded container, code font, fixed height, or nested scrolling.
- Plain detail includes:
  - Thinking explanation text;
  - natural-language Search scope or summary;
  - Read/Edit/Write/Create/Delete outcomes and reasons;
  - operation rejection reasons and custom feedback;
  - natural-language Fetch, Navigate, or tool explanations;
  - lightweight `AskUserQuestion` Q/A, preserving the `Q:` / `A:` labels without a surrounding card.
- A framed detail card is used only when formatting must be preserved, including:
  - source code, command or script bodies;
  - JSON, XML, structured tool payloads, and raw logs or stack traces;
  - explicit `IN` / `OUT` blocks;
  - Diff content;
  - fixed-column tables, terminal output, or other raw tool output whose alignment is meaningful.
- Search details use plain text when they are a natural-language summary. A card is allowed only for raw structured matches or format-dependent output.
- Source code, commands, JSON, logs, and structured output inside a card use the standard foreground color. Failure is communicated by the red Action dot and failure mark, not by painting the whole card red.
- The existing running-Thinking ten-line limit and completed-Thinking full expansion remain unchanged; only the unnecessary frame is excluded.

Minimum implementation boundary:

- Reuse or add the minimum existing detail variants in `media/styles.css` and `media/main.js`: one unframed natural-language variant and one framed structured-content variant.
- Do not change detail text, Action order, expansion state, title layout, status meaning, link behavior, Thinking height behavior, or when `IN` / `OUT` is used.

### 2.5 Render Read/Edit/Write document targets as one complete filename link

Current problem:

- Read/Edit/Write titles can display path fragments instead of only the filename.
- Link parsing can split a path into multiple linked segments, and the underline may not include the complete extension.

Required behavior:

- `Read`, `Edit`, `Write`, `Create`, and `Delete` title rows display only `path.basename(fullPath)`.
- The displayed filename includes the complete extension.
- The entire displayed filename is one anchor element and receives one continuous underline on hover, including the extension.
- Hover shows the complete original path in a compact tooltip near the pointer. This is a hover tooltip, not a persistent VS Code notification.
- Clicking opens any VS Code-supported document type in the document Editor area using the existing editor-column isolation rules.
- The title uses ordinary text color when idle; it must not use link-blue highlighting.
- Complete web URLs remain one anchor, use ordinary text color, underline continuously on hover, and open through the existing VS Code external-browser command.
- These presentation changes must reuse the existing document-open and external-link message handlers; they must not replace clickable anchors with plain text or introduce a separate navigation path.

Minimum implementation boundary:

- Reuse `pathDisplayName`, `renderActionFileLink`, `renderActionDescription`, and existing click message handlers in `media/main.js`.
- Do not change assistant-answer document link parsing, composer attachments, sent-message attachments, or the editor-routing implementation in `extension.js`.

### 2.5.1 Keep every Action title on one responsive line

Required behavior:

- Every Working Action title row remains exactly one visual line at all supported editor widths.
- The row is divided into four stable regions:
  - Action name: fixed and always visible;
  - target or natural-language description: flexible and truncates with an ellipsis;
  - success/failure marker: fixed and always visible when present;
  - expand/collapse button: follows immediately after the visible description and status marker when detail exists.
- The status marker and expand button form one compact visual group with the Action content. They must not be pinned to the far edge of the row or separated from short content by unused horizontal space.
- Narrowing the Editor may compress only the middle description region. It must never push the status marker or expand button outside the visible/clickable area.
- For short content, the expand button sits directly after the Action content. For long content, the description grows only until the reserved status/button space is reached, then truncates with an ellipsis.
- Long filenames, complete URLs, Search descriptions, and command purposes use `white-space: nowrap`, `overflow: hidden`, and `text-overflow: ellipsis` in the title row.
- Truncation is presentation-only:
  - document links retain the complete path as their click target and tooltip;
  - web links retain the complete URL as their click target and tooltip;
  - expanded Action detail retains the complete command, script, query, result, or other detail.
- The expand/collapse affordance is a real button or equivalent keyboard-operable control with a stable hit area. It must remain clickable independently of the truncated description without being aligned to the container's far-right edge.
- Clicking the document/URL link performs navigation and must not also toggle the Action detail.
- Clicking the expand button toggles only the corresponding Action detail.
- Non-expandable Actions do not reserve an unnecessary caret, but their status marker remains visible.

Minimum implementation boundary:

- Adjust only the existing Action title markup and layout styles in `media/main.js` and `media/styles.css`.
- Do not change Action ordering, detail content, status meaning, link handlers, timeline spacing, or the responsive width of the surrounding conversation.

### 2.6 Standardize Action status dots

Required behavior:

- `Thinking` keeps its existing neutral gray dot and is excluded from the Action status color rule.
- Every non-Thinking Action uses:
  - animated Accent dot while running;
  - green dot when completed successfully;
  - red dot when failed, errored, cancelled by the tool, or otherwise unsuccessful.
- The existing success/failure checkmark or cross may remain; the dot is the primary status signal.
- Plain narrative notes remain neutral and are not reclassified as Actions.

Minimum implementation boundary:

- Reuse existing `step.status`, `step.done`, and `step.error` fields in `media/main.js`.
- Add no new backend status vocabulary unless an existing ACP status is currently dropped during normalization.

### 2.7 Record confirmation outcomes according to the confirmation intent

Current problem:

- Custom text entered in the confirmation component is currently classified by input method rather than by the purpose of the confirmation.
- Treating every custom response as a separate `AskUserQuestion` Action makes operation feedback appear disconnected from the Edit, Write, Delete, or Run command that the user was reviewing.

Required behavior:

- The confirmation request must first be classified by intent:
  - operation approval: permission to edit, write, create, delete, run a command, open a target, or perform another concrete Action;
  - user question: a genuine request to choose a plan, select an option, clarify scope, provide missing information, or state a preference.
- The response control does not determine the Action type. Clicking a preset option and submitting custom text are two input methods for the same underlying confirmation.
- For operation approval:
  - normal acceptance continues the original Action and records no mechanical approval text;
  - session-level acceptance may add one natural-language note such as `本会话后续同类文档修改将直接执行。` only because it changes later session behavior;
  - rejection leaves the original Action unsuccessful and records a concrete natural-language reason such as `未修改该文档：用户选择保留原内容。`;
  - custom feedback stays in the original Action detail, for example `暂未修改该文档：用户要求保留第二章，只修改其他部分。`;
  - custom feedback rejects only the current proposal, continues the current ACP turn, and allows the Agent to generate a revised Action.
- Operation feedback must not create a separate `AskUserQuestion`, normal user bubble, Queue item, Steer message, toast, or assistant continuation.
- Only a genuine user-question confirmation is represented as an Action named `AskUserQuestion`.
- Its expanded content contains exactly:

  ```text
  Q: <the confirmation question>
  A: <the user's submitted feedback>
  ```

- A genuine user question records the actual selected option or custom answer after `A:` and remains at its original position in the Working sequence.
- A plan or option choice is recorded in natural language, for example `用户选择：方案 B，保留现有目录层级。`; it is never normalized to `Approval: Yes` or `Approval: No`.
- Every plugin-generated natural-language Action detail must follow the active user's conversation language. A Chinese conversation produces Chinese explanations; an English conversation produces English explanations.
- Determine the output language from the active conversation/current user turn rather than hardcoding Chinese or English in the renderer. If the current turn is language-neutral, preserve the established conversation language.
- Preserve user feedback verbatim. Do not translate filenames, URLs, option labels supplied by ACP, commands, code, or raw tool output merely to match the surrounding language.
- Canonical Action names such as `Read`, `Edit`, `Write`, `Run command`, and `AskUserQuestion` are not changed by this rule; only generated natural-language summaries, reasons, outcomes, and pending descriptions are localized.
- The existing same-turn feedback transport remains. This change affects Working representation and decision semantics, not prompt Queue or Steer routing.

Minimum implementation boundary:

- Add the minimum confirmation-intent metadata needed in `extension.js` and update the existing Working renderer in `media/main.js`.
- Reuse the current `thinkingUpdate` persistence and transport path. Do not introduce a second feedback channel.

### 2.8 Make non-document confirmation questions explicit

Document mutation confirmations:

- Document create/edit/write/delete confirmations keep the current concise file-oriented question, such as `Make this edit to report.md?` or `Create report.md?`.
- The filename is sufficient because the document preview or Diff supplies the content being reviewed.

Other confirmation types:

- Every non-document confirmation must state the concrete action and target being approved; generic copy such as `Allow this action?`, `Request permission`, or a raw tool identifier is not acceptable.
- The question should be a short natural-language sentence derived from the normalized Action summary, for example:
  - `Run command to validate the generated document?`
  - `Open https://example.com in your external browser?`
  - `Install the requested dependency?`
  - `Delete the selected workspace resource?`
- For `Run command`, the confirmation question shows only the natural-language purpose. The full command or script stays in the expandable Working Action detail and must not be copied into the popup title.
- If a safe, concrete target cannot be derived, the popup must use the clearest available normalized action description rather than exposing raw JSON, regex, code, or an internal tool name.
- Existing ACP-provided option labels remain unchanged; this rule changes only the question/context shown above the options.
- The existing custom-feedback input remains available for document and non-document confirmations. `Enter` submits the feedback and `Shift+Enter` inserts a newline, using the current confirmation ownership and same-turn feedback path.

Minimum implementation boundary:

- Extend the existing `permissionQuestion()` and pending permission metadata in `extension.js` to use the already-normalized Action and target information.
- Do not redesign the confirmation frame, button order, custom input, reminder, ownership, or infinite-wait behavior.

### 2.9 Make `No` stop a single rejected task while preserving multi-confirmation review

Current problem:

- With one pending confirmation, selecting `No` rejects that operation but the Agent may continue reasoning in the same turn with no remaining approved work.

Required state model:

- Confirmation decisions are evaluated as a batch within the same active ACP turn.
- The batch contains the currently displayed request plus queued confirmation requests that belong to the same UI session and ACP session.
- Each request records one terminal decision: accepted, session-accepted, rejected, or feedback-rejected.

Single-confirmation behavior:

- When the only request in the batch receives `No`, respond to that permission request as cancelled/rejected.
- After safely rolling back the preview, cancel the current ACP turn.
- The current assistant response ends with the existing `Interrupted` terminal status.
- Do not allow further Thinking, Actions, or final answer text from that rejected turn.

Multiple-confirmation behavior:

- When one request receives `No` and more requests in the same batch remain, reject only that request and immediately present the next confirmation.
- Do not cancel the ACP turn while sibling confirmations remain unresolved.
- Rejected items are never executed.
- Accepted items remain eligible for execution.
- After the final request is resolved:
  - if at least one request was accepted, allow the turn to continue only for accepted work;
  - if every request was rejected, cancel the current ACP turn and end with `Interrupted`.
- Requests belonging to another UI session or ACP session are not part of the batch and must not affect this decision.
- Operation feedback follows section 2.7 and is not treated as a plain `No`; it rejects the current proposal but continues the current turn so the Agent can regenerate or adjust it.

Approval result recording:

- The confirmation popup is not the history surface for completed decisions. Meaningful outcomes are written to the corresponding Working Action according to the request intent.
- While awaiting a decision, the Action remains running/pending and its detail may show a localized equivalent of `Waiting for confirmation`, such as `等待用户确认` in a Chinese conversation.
- Normal acceptance does not create an approval-result line. The Action proceeds and ultimately records its real execution outcome.
- `Yes, always allow in this session` also proceeds normally; if the session policy change is shown, it uses one concise natural-language note rather than an approval label.
- `No` leaves the proposed Action unsuccessful and records why the concrete operation was not performed in natural language.
- Custom feedback on an operation stays under that original Action and records the user's instruction in natural language. It does not append `AskUserQuestion`.
- Preset or custom answers to a genuine plan/choice question remain inside the existing `AskUserQuestion` Action as exact `Q:` / `A:` content.
- Do not expose internal decision vocabulary such as `accepted`, `feedback-rejected`, `Approval: Yes`, `Approval: No`, or `Revision requested` in the Working UI.

Confirmation popup lifecycle:

- A completed single confirmation closes immediately after the decision is submitted.
- For multiple pending confirmations, the popup directly replaces its question and context with the next request. It does not show a result banner for the previous decision.
- After the final pending confirmation is resolved, the popup closes.
- Do not add popup result messages such as `Accepted`, `Rejected`, `First item rejected`, or `Applying approved items`.
- The original Action's semantic outcome, or the existing `AskUserQuestion` Q/A when the confirmation was a genuine question, is the durable representation of what happened.

Minimum implementation boundary:

- Extend the existing `pendingPermission`, `permissionQueue`, `resolveDiffPermission`, and turn lifecycle handling in `extension.js`.
- Track only the minimum per-turn decision summary needed to know whether sibling confirmations remain and whether any item was accepted.
- Do not create a new global task queue, change prompt Queue behavior, or modify ACP protocol messages beyond the existing permission response and turn cancellation calls.

### 2.10 Slightly deepen Diff backgrounds without changing Diff behavior

Current problem:

- The current red and green whole-line backgrounds are too pale in common light themes.

Required behavior:

- Deleted lines remain whole-line red backgrounds with no strike-through.
- Added lines remain whole-line green backgrounds.
- Increase background intensity modestly relative to `0.2.45`; keep text readable in light and dark themes.
- High-contrast themes continue using VS Code contrast semantics and must not lose boundaries.
- The changed-line calculation, temporary inline insertion, automatic reveal, rollback, approval, Review fallback, and overview ruler behavior remain unchanged.

Minimum implementation boundary:

- Adjust only the decoration color configuration in `extension.js` and the compact confirmation Diff tokens in `media/styles.css`.
- Do not modify `lib/diff-preview.js`, `lib/document-review.js`, Diff range calculation, preview placement, or approval flow for this visual change.

### 2.11 Combine multiple changes to one document into one atomic full-document Diff

Scope boundary:

- This rule applies only when one ACP permission request already contains multiple Diff blocks for the same normalized document URI.
- It does not collect, delay, or merge separate permission requests that arrive later, even when they target the same document.
- It does not change the Agent's generation order or introduce a cross-request candidate cache.

Current problem:

- The current permission extraction can select only the first Diff block from `toolCall.content`.
- Multiple changes to different locations in the same document can therefore be previewed or confirmed in batches instead of as one document-level proposal.

Required behavior:

- Collect every Diff block in the permission request that targets the same normalized document URI.
- Build one candidate document from one captured source snapshot.
- Independent edits must resolve to unique, non-overlapping source ranges. Apply them as one atomic candidate, using range ordering that prevents earlier replacements from shifting later locations.
- Render one combined Diff containing every changed region in final document order.
- Only actually changed lines receive red or green highlighting; unchanged text remains ordinary document content.
- The user sees one confirmation question for the document, not one confirmation per changed region.
- `Yes` approves the complete candidate represented by that permission request.
- `No` or custom feedback rolls back the complete temporary candidate; no individual region remains applied.
- If the target document is already open, keep the existing behavior: show all changed regions directly in the original document Editor and initially reveal the first changed region. Do not open a separate Review Editor merely because the document has several change regions.
- If the target document is not open, classify the one aggregated candidate using the existing actual-change thresholds and show one compact Diff or one Review workspace accordingly.
- A whole-document replacement block remains one candidate and must not be split into paragraph-level confirmations.
- If Diff blocks overlap, are ambiguous, target inconsistent source snapshots, or cannot be safely combined, do not fall back to partial or sequential confirmations. Reject preview creation and ask the Agent to regenerate one coherent candidate.

Minimum implementation boundary:

- Replace the current first-Diff-only extraction in `extension.js` with same-document Diff collection and one aggregated preview descriptor.
- A small pure aggregation helper may be added to `lib/document-review.js` so the range validation and candidate construction can be unit-tested independently.
- Keep `lib/diff-preview.js` unchanged unless a failing test proves that its existing changed-line calculation cannot render the aggregated candidate.
- Do not add a second approval queue, per-hunk buttons, selective hunk acceptance, or cross-request accumulation.

## 3. Approved Visual and Interaction Reference

The confirmed HTML prototype demonstrates:

- continuously legible animated `Working...`;
- sequential streaming motion across the three trailing dots;
- manual scroll ownership plus `回到最新输出`;
- concise Search titles;
- unified `Run command` titles with scripts only in expanded detail;
- ordinary-color code details;
- basename-only document links with full-path tooltip;
- single-line responsive Action titles with an always-accessible, content-adjacent expand button;
- neutral Thinking, Accent running, green success, and red failure dots;
- expandable `AskUserQuestion` with `Q:` / `A:`;
- explicit non-document confirmation questions;
- different `No` behavior for single and multiple confirmations;
- semantic operation outcomes recorded on their original Working Actions, while genuine plan or choice questions remain `AskUserQuestion` Q/A records;
- slightly stronger red/green Diff backgrounds.
- one atomic document-level Diff when a single approval request contains multiple changes to the same document.

The prototype is an interaction reference only. Production implementation must reuse the current Hermes component structure, typography, spacing, confirmation frame, timeline layout, and VS Code semantic theme variables.

## 4. Allowed Modification Surface

Production changes are limited to:

| File | Allowed changes |
| --- | --- |
| `media/styles.css` | Working dot animation, jump-to-latest control, single-line Action title layout, unframed natural-language detail and framed structured-detail variants, structured-detail foreground, Action dot states, AskUserQuestion detail styling, modest compact Diff intensity |
| `media/main.js` | Outer conversation follow state, jump control, concise Action target rendering, content-adjacent expand-button markup, single-anchor filename rendering, content-type detail variant selection, semantic operation-outcome rendering, AskUserQuestion rendering, status dot mapping |
| `lib/acp-render.js` | ACP Search summary and `Run command` label normalization while preserving raw detail |
| `lib/chat-parser.js` | Equivalent Search and `Run command` normalization for CLI fallback only if needed |
| `extension.js` | Confirmation-intent metadata, operation-feedback record shape, AskUserQuestion record shape for genuine questions, explicit non-document confirmation questions, same-turn confirmation batch decision tracking, single/all-denied turn cancellation, same-request Diff collection, editor Diff decoration intensity |
| `lib/document-review.js` | Optional pure helper for validating and aggregating multiple same-document Diff blocks from one permission request |
| Existing tests under `test/` | Focused behavior and regression coverage only |
| `CHANGELOG.md`, `package.json`, `package-lock.json` | Only after implementation is complete and a new package version is explicitly requested |

No other production file is in scope unless a failing regression test proves that it is directly required for one of the accepted behaviors.

## 5. Explicit Non-goals

- No redesign of the Working timeline, confirmation frame, composer, message bubbles, Todo, Queue, or settings.
- No approval-result banner, toast, or completed-state message inside the confirmation popup.
- No change to Thinking's running ten-line limit, completed expansion behavior, or inner latest-line focus.
- No change to command/Skill catalog, selection tokens, slash filtering, multiword Skill handling, or CLI command routing.
- No change to runtime Queue ordering, Steer behavior, queue editing, deletion, collapse, or five-row limit.
- No change to model selection, Mode behavior, last-model persistence, or Run Settings layout.
- No change to title editing, history search, session naming, or session persistence.
- No change to Markdown rendering, answer tables, generated-document links, or external links in final answers.
- No change to automatic approval rules, session-level grant scope, reminder interval, or infinite confirmation waiting.
- No new Plan workflow, large-rewrite intelligence, or Agent-side behavior.
- No aggregation across separate ACP permission requests, even when they target the same document.
- No per-hunk accept/reject controls or partial application inside one document permission request.
- No Marketplace metadata, publisher, extension name, repository, README, or package content changes in this implementation step.

## 6. Protected Existing Behaviors

The following existing behaviors are regression-protected and must remain unchanged:

1. Open target documents show reversible inline Diff directly in the original editor and reveal the changed region.
2. Unopened small edits use compact confirmation Diff; unopened large actual changes use Review; new files use full-content preview without Diff.
3. Diff previews are safely rolled back before Yes/No/feedback resolution and remain safe with Auto Save.
4. Completed Review closes its dedicated Editor group and restores the Agent view.
5. Confirmation requests wait indefinitely and retain the ACP-provided choices, their order, and the existing custom input interaction.
6. Custom feedback does not enter prompt Queue and does not render as a Steer message.
7. Action document links remain clickable and open through the existing document Editor routing; supported files never open in the Hermes Agent Editor area.
8. Action web URLs remain clickable and open through the existing VS Code external-browser command.
9. The confirmation custom-feedback input remains visible and functional for every supported confirmation type; Enter submits, Shift+Enter adds a newline, and the feedback continues the current ACP turn.
10. Documents remain in the document Editor area and Hermes sessions remain in the Agent Editor area.
11. Conversation content remains responsive at the VS Code minimum editor width.
12. Multiple attachments stay on one horizontally scrollable row without widening the conversation.
13. Long sent user messages preserve their expand-and-explicit-collapse behavior.
14. Streaming updates do not replace the focused composer DOM, move the caret, or interrupt IME composition.
15. Running Thinking alone is capped to about ten lines; completed Thinking expands fully.
16. Tables in Agent answers expand fully without nested table scrolling.
17. Interrupted and Tool Interrupted lines remain attached to every corresponding assistant response.
18. Todo remains centered above Queue, uses the thin aligned chevron, and preserves current expansion behavior.
19. Slash commands and Skills keep the current grouped, two-line list and inline selected-token behavior.
20. History search retains focus during continuous input.
21. Run Settings preserves the current Mode and full-width Model selector without Reset.

## 7. Acceptance Criteria

### Working and scrolling

- During a 10-second running-state observation, `Working` never becomes dim; the leading dot remains visibly animated and the three trailing dots animate sequentially without changing line width or height.
- With reduced motion or a paused animation, the complete literal label `Working...` remains visible.
- Before approval, after approval, and while approved work executes, the final running line uses identical `Working...` markup, color, and animation.
- A rejected and cancelled turn ends with exactly `Interrupted`; no `after denial` suffix or running animation is shown.
- While at the bottom, five streamed updates keep the newest line visible.
- After manually scrolling upward, five streamed updates and one composer resize preserve the manual scroll position within a small rendering tolerance.
- Clicking `回到最新输出` returns to the bottom, hides the control, and resumes auto-follow.
- No horizontal overflow appears at a 360px webview width.

### Action presentation

- Search title tests cover filename, URL, and natural-language targets and reject raw regex/JSON/count output in the title.
- Python, Shell, Bash, Terminal, and execute-code Actions all render `Run command`; their complete command or script appears only in expanded detail.
- Read/Edit/Write render one filename anchor including the extension; hover exposes the full path and the underline is continuous.
- Clicking each document anchor sends exactly one existing document-open action and opens the file in the document Editor area.
- Clicking each complete web URL sends exactly one existing external-open action and opens it in the system browser.
- At wide and 360px widths, every Action title remains one line; long middle descriptions show an ellipsis while the Action name, status marker, and expand button remain visible.
- With a short Action description, the expand button is positioned immediately after the content/status group rather than at the far-right edge of the row.
- With a long Action description, the expand button remains adjacent to the truncated description and stays inside the visible row.
- Clicking a truncated document or URL target still performs exactly one navigation action and does not toggle detail.
- The expand button remains keyboard-focusable and toggles the correct detail after the middle description has been truncated.
- Thinking, natural-language Search summaries, operation outcomes/reasons, custom feedback, and lightweight AskUserQuestion Q/A expand without a background, border, rounded frame, code font, fixed height, or nested scrolling.
- Command/script, code, JSON, raw logs, Diff, IN/OUT, fixed-column tables, and format-dependent raw output retain a structured detail card.
- Structured cards use ordinary foreground color in success, running, and failed Actions.
- Non-Thinking Action dot tests cover running Accent, completed green, and failed red.

### AskUserQuestion

- A genuine plan, option, clarification, or missing-information question remains one `AskUserQuestion` step in the current running assistant message.
- Preset and custom answers both remain inside that same Action; expanded detail shows the exact question after `Q:` and the exact selected option or custom answer after `A:`.
- Custom feedback submitted while approving an Edit, Write, Create, Delete, Run command, or other concrete operation does not create `AskUserQuestion`; it updates the original Action detail in natural language.
- No normal user bubble, Queue item, visible Steer item, duplicate record, or new assistant message is created.

### Confirmation question content

- Document mutation confirmations retain concise filename-oriented questions.
- Each non-document confirmation displays a concrete normalized action and target or purpose.
- Command confirmation questions never include the complete command, script body, raw JSON, or runtime-specific `Python`/`Shell` label.
- Existing option labels, order, custom input, and confirmation frame styling remain unchanged.
- Custom input remains available after the question-copy changes; Enter submits once, Shift+Enter adds a newline, and the submitted opinion follows the existing same-turn feedback behavior.

### Confirmation batch behavior

- One pending confirmation + `No`: preview rolls back, request is rejected, current turn is cancelled, and no late Working/answer event is accepted.
- Two same-turn confirmations + first `No`: first request is rejected, second confirmation is presented, and the turn is not cancelled yet.
- Two same-turn confirmations + one accepted and one rejected: only the accepted operation may execute.
- Two same-turn confirmations + both rejected: current turn is cancelled after the second decision.
- Confirmation requests from another session are unaffected.
- Feedback input rejects the candidate and continues the current turn rather than applying the plain-No cancellation rule.
- A normal operation acceptance records no approval label and proceeds to the real Action outcome.
- A rejected operation remains on its original Action with a concrete natural-language explanation of why it was not performed.
- Custom operation feedback remains on the original Action, preserves the user's exact instruction, and creates no separate `AskUserQuestion` record.
- A genuine plan or option question records the selected preset or custom answer inside its existing `AskUserQuestion` Q/A detail.
- Chinese and English conversation fixtures verify that plugin-generated Action reasons and outcomes follow the active conversation language while user text, paths, commands, code, URLs, and raw tool output remain unchanged.
- After a single decision the popup closes; during a multi-confirmation batch it advances directly to the next question without displaying the previous result.
- No completed approval result remains inside the popup after the batch ends.

### Diff color and regression

- Visual snapshots show a modestly stronger red/green line background than `0.2.45` in representative light and dark themes.
- Only actually changed lines remain highlighted.
- Existing inline Diff location, reveal, rollback, Auto Save protection, Review selection, and confirmation behavior pass unchanged.

### Same-request multi-region Diff

- One permission request with three non-overlapping Diff blocks for one document produces one candidate, one preview, and one confirmation.
- The preview shows all three changed regions in final document order and initially reveals the first region.
- Accepting applies the request as one unit; rejecting or providing feedback removes the complete temporary preview.
- Multiple blocks with overlapping or ambiguous source ranges fail safely and never show only a subset of the requested changes.
- Two separate permission requests for the same document remain two requests and are not delayed or merged by this feature.

## 8. Verification Gate Before Packaging

Implementation must pass all of the following before a new VSIX is produced:

1. `npm run lint`
2. `npm run test:unit`
3. Focused confirmation-batch and Action-summary unit tests
4. Webview contract tests for rendering and protected DOM boundaries
5. Browser visual/interaction checks at 360px and a wide desktop viewport
6. Extension-host smoke tests
7. `git diff --check`
8. A final changed-file review proving the implementation stayed inside section 4, or documenting why an additional file was strictly necessary

Packaging and version changes require a separate explicit user instruction after the implementation and verification results are reported.
