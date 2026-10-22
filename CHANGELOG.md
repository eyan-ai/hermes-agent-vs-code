# Changelog

## 0.2.55 - 2026-10-22

### Conversation scrolling during streamed output

- Fixed the stutter that pulled the conversation back down while scrolling up during a streaming run; the view now stays exactly where it is left.
- Restored native trackpad and mouse wheel scrolling, including momentum and pixel-level smoothness, by letting the browser handle conversation scrolling directly instead of repositioning it from script.
- Removed a per-update scroll listener accumulation that made long runs progressively less responsive the further they streamed.
- Coalesced streamed Thinking and answer updates onto a single display frame, so rapid output no longer competes with scrolling for the main thread.
- Preserved automatic following of new output while the conversation sits at the bottom, along with the one-time jump to the latest content when a session is opened, switched, or sent a new message.
- Kept the running Thinking detail streaming inside its fixed-height viewport, pinned to its newest line with the top fade intact.

## 0.2.54 - 2026-10-19

### Custom Editor context reliability

- Added provider-based context resolution for arbitrary Custom Editors using stable VS Code tab APIs, without hardcoded editor identifiers.
- Preserved the exact selected text when focus moves from a Custom Editor into a Hermes Editor Session.
- Restored whole-document context when the user explicitly clears the Custom Editor selection, while treating temporary provider unavailability as a focus transition instead of a selection clear.
- Added race-safe context refreshes and fallbacks for selections, unsaved document text, saved files, provider errors, tab changes, and closed documents.
- Labeled embedded context as selected text or the current unsaved document so Hermes receives the intended content type.

### Agent settings and keyboard shortcuts

- Reorganized the settings page under `Agent Setting`, with `Personality & Memory` and `Keyboard Shortcuts` as separate sections.
- Added a `Send Shortcut` selector that defaults to `Enter` and offers `⌘ + Enter` on macOS or `Ctrl + Enter` on Windows and Linux.
- Made send and line-break shortcuts mutually exclusive across all modifier combinations.

### Composer and interaction improvements

- Made the active editor context and Run Settings summary shrink together instead of hiding the context first; both remain available as icon-only controls at the narrowest widths.
- Added shared line-style mode icons: a lightning bolt for Auto and a thin hand for Manual, reused consistently in the toolbar and Run Settings.
- Added immediate hover and keyboard-focus tooltips that show the context inclusion state, context type, selection range when available, and complete document name.
- Replaced delayed native attachment titles with immediate full-name tooltips for documents attached to sent messages.
- Removed the animated leading dot from the `Working for …` header while preserving its duration and disclosure behavior.
- Opened newly restored and selected historical sessions at their latest content while preserving manual upward scrolling during streamed output.

### Runtime reliability

- Allowed background Auto sessions to resolve supported approval requests even when no VS Code Extension Host is connected.
- Prevented ACP and CLI process launches from opening console windows on Windows.

## 0.2.53 - 2026-09-16

### Session continuity

- Added a standalone Node.js background host so active Auto-mode tasks can continue after VS Code closes.
- Restored structured Thinking, Actions, and final responses when the same workspace is reopened.
- Added theme-aware History indicators for running sessions and completed sessions that have not yet been viewed.
- Cleared the completed indicator only after the user explicitly opens the finished session.
- Documented the standalone Node.js requirement and the operating-system shutdown boundary for background sessions.

### Workspace and session experience

- Restored the last session associated with a workspace, including the Editor Session and Agent workspace layout.
- Preserved the existing session rename interaction while removing the visible `Edited` label.
- Improved scrolling stability while structured Thinking and task output stream into an active session.

### Model and reasoning controls

- Added per-model reasoning-effort support and a compact `Mode + Model + Effort` summary below the composer.
- Added concise effort labels, including `Med` for Medium and `XHigh` for Extra High.
- Simplified model labels by removing redundant provider prefixes from the picker and summary.
- Applied the extension-wide last selected model and effort to newly created sessions.
- Preserved the complete runtime model list across refreshes and new sessions, preventing usable models from being incorrectly shown as unavailable.
- Made Model and Effort option lists consistently open above their controls.
