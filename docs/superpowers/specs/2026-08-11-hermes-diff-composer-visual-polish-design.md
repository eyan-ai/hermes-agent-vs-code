# Hermes Diff and Composer Visual Polish

## Goal

Improve three visual details without changing Diff placement, approval behavior, file writes, session behavior, or composer interactions.

## Scope

### 1. Line-level Diff highlighting

- Compute changed old and new lines from the localized `oldText` and `newText` using a line-level comparison.
- Highlight only lines whose content actually changed.
- Render changed original lines with the VS Code `diffEditor.removedTextBackground` theme color.
- Render corresponding proposed lines with the VS Code `diffEditor.insertedTextBackground` theme color.
- Decorations cover the complete editor line.
- Remove the strike-through decoration.
- Unchanged context lines retain the normal editor background.
- Keep the current read-only virtual preview and proposed-content placement unchanged.

### 2. Empty-session title contrast

- Render the `Hermes Agent` empty-session title with the primary editor foreground token.
- Increase its weight to `650` so it remains legible across light, dark, and high-contrast themes.
- Keep the supporting sentence on the secondary foreground token.
- Do not introduce fixed light-theme or dark-theme colors.

### 3. Composer spacing

- Change the prompt row padding from `7px 12px 5px` to `9px 12px 7px`.
- Keep action buttons at 30px square.
- Keep the action row divider removed.
- Set the action row to 36px total height with `0 8px 6px` padding, leaving a 30px content area and 6px below the buttons.
- Preserve narrow-width layout rules and dynamic conversation bottom clearance.

### 4. Selected Skill Accent

- Add a shared Hermes accent token with this fallback order:
  1. `--vscode-focusBorder`
  2. `--vscode-textLink-foreground`
  3. `--vscode-button-background`
- Use the shared accent only for the focused composer border and selected Skill name.
- Keep send buttons on `button.background` and links on `textLink.foreground`.
- Do not recolor running states, selections, warnings, errors, or other controls.

### 5. Expanded answer tables

- Remove the fixed maximum height from tables rendered in Agent answers.
- Remove horizontal and vertical overflow rules from the table wrapper.
- Let the conversation page provide the only scrolling surface.
- Preserve table width, wrapping, borders, row styling, copying, and Markdown rendering.

## Files

- `extension.js`: whole-line editor decorations.
- `lib/diff-preview.js`: line-level changed-line calculation.
- `media/styles.css`: title contrast, composer spacing, and Accent token.
- `test/diff-preview.test.js`, `test/extension-contract.test.js`, `test/webview-contract.test.js`: focused regression coverage.

## Acceptance

1. A modified line is fully red in the original block and fully green in the proposed block.
2. Unchanged lines surrounding a modification are not highlighted.
3. No modified text uses strike-through styling.
4. The empty-session `Hermes Agent` title uses primary foreground and remains readable in light, dark, and high-contrast themes.
5. The send button has visible bottom clearance while remaining 30px square.
6. The selected Skill name and focused composer border resolve to the same Accent token.
7. Approval, read-only Diff preview, document writes, and editor routing remain unchanged.
8. Agent answer tables show every row without an internal scrollbar.

## Verification

- Unit-test changed-line calculation for replacement, insertion, deletion, and unchanged context.
- Contract-test whole-line decorations and absence of strike-through.
- Contract-test Accent usage and composer spacing.
- Contract-test that answer table wrappers have no height or overflow constraints.
- Run lint and all unit tests.
- Run the VS Code Extension Host smoke suite.
- Package the next VSIX version and validate archive integrity and package metadata.
