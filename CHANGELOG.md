# Changelog

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
