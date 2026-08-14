# Changelog

## 0.2.50

- Action status dots are static while retaining accent, success, and failure colors; existing Working animations remain unchanged.
- Document Actions show one clickable basename for absolute, URI, and workspace-relative targets, while web URLs remain complete external links.
- Hard permission denial forks the ACP conversation before cancellation, preserving context while isolating the still-busy old session so the next prompt starts immediately.
- `/stop` and the composer pause button now fork before cancelling, so the next prompt keeps prior context without reaching the still-busy old ACP session.
- A new Thinking phase completes the preceding open Action instead of leaving it in the running state.

## 0.2.45

- Open target documents now show reversible Diff previews directly in the original editor and automatically reveal the first changed region.
- Actual changed content, rather than whole-document payload shape, determines whether unopened documents use compact Diff or full Review.
- Completed Review editors close cleanly, and custom confirmation feedback continues the current ACP turn without entering Queue or appearing as a Steer message.

## 0.2.44

- Re-publish with unofficial community extension disclaimer.

## 0.2.42

- The VS Code Marketplace publisher ID is now `EyanLin`, matching the configured Marketplace publisher account.

## 0.2.41

- Session history search now keeps the search field focused during continuous input.
- Filtering refreshes only the history result list, preserving the input DOM and existing session actions.

## 0.2.40

- Local document paths in Agent answers are clickable, including inline paths with Chinese characters and spaces.
- Generated document links resolve absolute, home-relative, workspace-relative, and slash-prefixed workspace paths before opening in the document Editor area.

## 0.2.39

- Sent messages with multiple single-row attachments no longer expand the conversation Grid beyond the available editor width.
- Narrow-width regression coverage now verifies attachment scrolling, responsive message columns, and expanded-message layout together.

## 0.2.38

- Composer and sent-message attachments stay on one row and use component-local horizontal scrolling when files exceed the available width.
- Attachment overflow no longer changes the conversation's responsive width or the existing long-message expand/collapse behavior.

## 0.2.35

- Diff previews highlight only actually changed lines with full-line removed/inserted theme backgrounds and no strike-through.
- The empty-session title uses the primary editor foreground for consistent contrast across themes.
- The focused composer border and selected Skill share one Accent token, while the prompt and action rows have improved vertical spacing.
- Tables in Agent answers expand to their full content height without nested scrolling.

## 0.2.34

- ACP approvals wait indefinitely for an explicit user choice; the optional five-minute reminder never changes the pending state.
- Confirmation UI now shows only the approval question with `Yes`, `Yes, always allow in this session`, and `No`; editor Diff previews are no longer duplicated in the popup.
- Editor Diff previews now use a read-only virtual document, preventing Auto Save conflicts before an approved edit is applied to the real file.
- Session-level approval is scoped to the active ACP session and operation type, and is cleared when the session or transport closes.
- The composer action row has no divider and matches the 30px send-button height.

## 0.2.32

- Whole-document write Diffs are localized to the actual changed lines, with the complete proposed text previewed directly below the corresponding original block.
- Expired or terminal permission requests now roll back their temporary Diff preview and close the confirmation UI without sending a stale ACP response.
- The ten-line streaming viewport applies only to the currently running Thinking detail; completed and inactive Thinking steps expand fully.
- Selecting a multiword skill removes the complete slash-command name without leaving trailing name fragments in the prompt.
- User messages use a stronger focus-border-derived fill with no visible border in standard themes; high-contrast themes retain their accessibility border.

## 0.2.31

- Skill list now shows the FULL set of skills actually installed in the Hermes CLI: the scanner walks category directories recursively (e.g. `creative/ascii-art`), so nested skills that were previously missing from the `/` popover now appear, sorted by name.
- Typing a complete skill name after `/` and pressing Space selects that skill directly (exact-name match wins; arrow-highlighted option and first result remain as fallbacks).
- Working / Interrupted status moved from below the composer to the LAST line of the agent's answer body: while running it shows an animated "Working..." in the theme accent color (pulsing dot + text); a user-initiated stop shows italic "Interrupted"; a run blocked by a tool/process failure shows italic "Tool Interrupted".

## 0.2.23

- Working section auto-collapses as soon as the answer starts streaming (round-4: thinking over → working folds), not only when the run finishes; manual toggle still wins.
- Active document surfaces as default context immediately when a new session is created.
- Composer area is fully opaque: content scrolling under the input is hidden by a solid mask (no fading text through the input).
- Empty-input guard: the send button no longer lights up from editor context alone; a prompt, attachment, or skill is required to submit.

## 0.2.6

- Model defaults now reflect the real Hermes backend (`deepseek-v4-flash` from `~/.hermes/config.yaml`); the placeholder "5.5" default and all model-unavailable warnings/fixed dialogs are gone.
- Run-settings popover closes when clicking anywhere outside it, including the prompt input.
- Fork feature removed (button, command, backend handler).
- Copy button gives feedback: turns into a ✓ for 2 seconds after copying, then reverts.
- Tool calls in the Working timeline show a natural-language summary plus the actual shell command / script / patch in a code box (raw JSON args no longer shown); results stay in their own code box.

## 0.2.5

- Context chip matches the UI spec: no border, transparent until hover; clicking toggles mute for the current document (name turns faint with an eye-off icon, chip stays); switching documents shows the new document normally; empty when no document is open — "Editor context off" placeholder removed.
- The agent column never hosts documents: every document open (attachments, SOUL/USER/MEMORY.md) goes to the document column, creating one if needed.
- Run settings reduced to Mode only (Model/Effort removed from the popover and from the toolbar echo).
- Working timeline is now readable: tool calls show a natural-language summary (e.g. "Reading /tmp/t.txt"), a status dot (grey = thinking, green = success, red = failure) and a ✓/✗ marker; code/args/results still render in monospace boxes. The running label has a spinner animation.
- Working section auto-expands while running, auto-collapses as soon as the answer starts streaming; manual toggle always wins.

## 0.2.4

- `@` workspace picker shows only files inside the opened folder (the folder itself is not listed), names only — no duplicated path line — with ellipsis on long names (path remains in the tooltip).
- Selected-file pills in the composer follow the UI spec: the remove button is hidden until hover, floats over the name with a gradient mask, and takes no layout space.
- SOUL.md / USER.md / MEMORY.md open as tabs in the document column (a group holding text editors), never in the agent/webview column.
- Context continues to follow the last active document across editor groups (kept from 0.2.3).
- Agent-column reuse kept from 0.2.3: new sessions land in an existing agent column (any plugin) instead of creating another one.

## 0.2.3

- Thinking timeline now shows the real reasoning and execution: natural-language reasoning as text steps, tool calls as steps with their Args in a monospace code box, and tool results (`Result: ...`) in their own code box with a ✓ when completed. Tool-outcome lines no longer pollute the thinking text.
- Model selection echoes immediately: the run-settings popover and the toolbar button now show the model/effort actually picked in the session (previously `postState` always fell back to defaults, so the selection never stuck).
- Context follows the last active document instead of the focused one: clicking into the Agent input no longer loses the editor context, and with multiple editor groups the last-clicked document's group wins.
- Editor-title button reuses an existing agent column (Hermes panels or another agent webview) and adds a tab there; only creates a new column when no agent column exists.
- Run-settings popover closes on outside click (existing behavior, kept).

## 0.2.2

- Editor-title agent button opens a Hermes panel in a new editor group beside the current one (same window, side by side).
- Run settings popover redesigned to match the UI spec: Mode title with current-value echo, Manual/Auto options with descriptions ("Always ask for approval before making each edit." / "Only ask for approval when actions detected as potentially unsafe."), separate Model and Effort rows.
- Model list stays in sync with the real Hermes CLI; the "model unavailable" warning now appears only when a send is attempted with an unknown model, and is dismissible.
- Reasoning and tool calls now stream live: the default command is `hermes chat -q "{{prompt}}" -v`, and a stream parser turns reasoning blocks into timeline steps, `Tool N` calls into tool steps, and the Hermes answer block into the response text (plain `--oneshot` output still works as a fallback).
- Running label changed "Thinking" → "Working", smaller and not bold.
- Thinking timeline matches the UI spec: connected dots on a vertical line, expand/collapse caret, collapsed after the run.
- Typography pass: non-title text (file list empty state, run-settings echo, skill labels, etc.) is no longer bolded.
- Chat output parser extracted to `lib/chat-parser.js` with unit tests in the smoke suite.

## 0.2.1

- Assistant answers are now rendered as Markdown: heading hierarchy (h1-h6), bold/italic/strikethrough, ordered and unordered lists, blockquotes, inline and fenced code blocks, and external links (opened via the system browser). Rendering is whitelist-only — raw HTML in answers is escaped.

## 0.2.0

- Fix: title editing no longer loses input (IME-safe), commits on Enter or click-outside, Escape cancels.
- Fix: history / settings / mode popovers close on outside click.
- Fix: run-settings popover anchors above the composer instead of the top of the sidebar.
- Fix: model list now reflects the real Hermes CLI model catalog (config provider first), default from `~/.hermes/config.yaml`.
- Fix: send button activates as soon as there is input, attachment, skill, or context.
- Fix: Fork now carries the full conversation history up to the fork point.
- Fix: editor-title agent button opens a new workbench window (with the Hermes panel) instead of a tab.
- Fix: settings memory rows open the real Hermes docs (`~/.hermes/SOUL.md`, `~/.hermes/memories/USER.md`, `~/.hermes/memories/MEMORY.md`).
- Fix: "Editor context is enabled" notice has a dismiss button.
- Fix: thinking steps show a vertical timeline connecting dots; toggle expands/collapses and defaults to collapsed after a run; no pulse dot on the running label.
- Add `npm test` E2E smoke harness (`test/smoke`) that runs the extension in the machine's real VS Code.

## 0.1.0

- Initial Hermes Agent VS Code sidebar.
- Added editor-aware context, attachments, skills, sessions, run settings, and streaming output.
