# Changelog

## 0.2.3

- Thinking timeline now shows the real reasoning and execution: natural-language reasoning as text steps, tool calls as steps with their Args in a monospace code box, and tool results (`Result: ...`) in their own code box with a ✓ when completed. Tool-outcome lines no longer pollute the thinking text.
- Model selection echoes immediately: the run-settings popover and the toolbar button now show the model/effort actually picked in the session (previously `postState` always fell back to defaults, so the selection never stuck).
- Context follows the last active document instead of the focused one: clicking into the Agent input no longer loses the editor context, and with multiple editor groups the last-clicked document's group wins.
- Editor-title button reuses an existing agent column (Hermes panels or any other plugin's webview, e.g. Claude Code) and adds a tab there; only creates a new column when no agent column exists.
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
