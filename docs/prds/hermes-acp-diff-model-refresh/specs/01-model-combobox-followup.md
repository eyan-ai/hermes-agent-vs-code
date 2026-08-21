# Hermes Run Settings Model Combobox Follow-up Spec

Date: 2026-08-20
Status: Confirmed
Parent Spec: `00-design.md`
Visual reference: `/Users/eyan/.codex/visualizations/2026/08/17/01a00f41-69db-7520-81a9-e49356c0ec72/.superpowers/brainstorm/20260820-model-picker-boundary/content/model-picker-boundary-v2.html`

## 1. Goal

Correct only the Run Settings Model picker layout and search interaction reported after `0.2.54`:

1. The Model control itself is an editable combobox that filters choices while the user types.
2. The Model list is a Webview-root floating layer anchored directly to the Model control's upper or lower edge.
3. Run Settings height adapts to whether Effort is present and does not reserve empty Effort space.

The change must not alter model refresh semantics, ACP capability rules, approval interactions, Diff behavior, Agent rendering, Queue, Stop, or final-answer routing.

The existing Mode control is outside the behavioral change. Manual and Auto options, labels, descriptions, selection styling, ordering, and click behavior remain byte-for-byte or behaviorally equivalent to the current production implementation.

## 2. Proven Current-state Causes

### 2.1 List positioning is relative to Run Settings, not Model

The current Model list uses one fixed position inside `#modePopover`:

```css
bottom: 50px;
```

With few choices, the short list appears close to Refresh and far below Model. With many choices, the list grows upward and covers Mode and Model. No runtime measurement anchors it to the Model control or compares available space above and below.

### 2.2 Run Settings clips the list

The Model list is a child of containers using `overflow: hidden`. Increasing `z-index` cannot escape an ancestor's clipping boundary. A list that may extend outside the Run Settings frame must be rendered at the Webview overlay root rather than inside the clipped settings panel.

### 2.3 Fixed outer height creates false Effort space

Run Settings currently has a fixed height of up to `468px`. When `reasoning_effort` is absent and the Effort field is correctly not rendered, the fixed outer height still leaves a large blank area below Model.

### 2.4 Effort is absent for the current installed Hermes

The installed Hermes Agent v0.20.4 ACP Adapter does not advertise a `reasoning_effort` session config option. The VSIX therefore correctly hides Effort. The blank space is a layout defect, not an Effort placeholder and not evidence that the field was partially rendered.

The extension must not display a non-functional Effort control when capability is absent.

## 3. Technical Boundary

### 3.1 Allowed overlay area

The Model list may extend beyond the Run Settings frame by rendering at the Webview root. It may not extend beyond the VS Code Webview viewport or cover native VS Code UI outside that viewport.

### 3.2 Positioning reference

Positioning uses the Model combobox control's current `getBoundingClientRect()` result. The list is not positioned relative to Refresh, the Run Settings frame, the model count alone, or a hard-coded top/bottom coordinate.

### 3.3 No native Quick Pick substitution

The interaction remains an anchored Run Settings combobox. It must not be replaced by VS Code Quick Pick or Command Palette UI.

## 4. Model Combobox Contract

### 4.1 One control

Model is one editable combobox. There is no separate search box inside the floating list.

The control must expose equivalent accessible semantics to:

```text
input role="combobox"
aria-autocomplete="list"
aria-controls="model list id"
aria-expanded="true | false"
```

### 4.2 Opening and editing

- Clicking or focusing Model opens the list.
- The currently selected model remains the committed value until another option is selected.
- On open, the control displays the committed model, selects its text, and shows the complete model list with the committed model highlighted.
- The first printable input replaces the selected model text and becomes the filter query without committing a model change.
- Subsequent input edits the filter query normally.
- Typing filters choices in real time.
- Filtering matches model display name, full model ID, and provider/description case-insensitively.
- Filtering does not call `session/set_model`, write settings, or refresh the Hermes catalog.
- If no model matches, show a non-selectable `No matching models` state.

### 4.3 Selection and cancellation

- Clicking a selectable choice commits that model and closes the list.
- `Enter` commits the highlighted choice.
- `ArrowUp` and `ArrowDown` move the active choice and keep it visible.
- `Escape` closes the list and restores the last committed model without sending a settings change.
- Clicking outside closes the list and restores the last committed model unless a choice was selected.
- Unavailable models remain visible according to the existing refresh contract but cannot be selected.

After selection, the combobox shows the normalized selected model name and its provider/description. Existing `session/set_model`, persistence, and error recovery behavior remains unchanged.

## 5. Floating List Contract

### 5.1 Portal ownership

The Model list renders under one Webview-root overlay host outside the clipped Run Settings content. Run Settings owns open/closed/filter/highlight state, but the overlay host owns visual placement.

The list must not participate in Run Settings layout or change its outer dimensions when opened.

When a large list opens upward, it may temporarily overlay the unchanged Mode area. This visual overlap is allowed only while the Model list is open. It must not clip or cover the Model control, mutate Mode state, intercept Mode behavior after dismissal, or remove either Manual or Auto from the underlying Run Settings DOM.

### 5.2 Edge attachment

- Downward placement: list top edge is flush with the Model control bottom edge.
- Upward placement: list bottom edge is flush with the Model control top edge.
- The visual gap is `0px`.
- Adjacent borders and corner radii form one connected combobox surface.
- The floating list width equals the Model control width unless constrained by the Webview viewport.

### 5.3 Direction selection

Direction is based on measured space, not a fixed option-count threshold:

1. Calculate desired list height from the filtered result count, row height, borders, and maximum allowed height.
2. Measure available Webview space above and below the Model control with a small viewport safety margin.
3. Prefer below when the desired height fits below.
4. Otherwise prefer above when the desired height fits above.
5. If neither side fits, use the side with more space and cap list height to that space.

This naturally places most one- or two-item lists below and most large lists above without encoding those outcomes as special cases.

### 5.4 Repositioning

While open, recalculate placement when:

- the filtered result height changes;
- the Webview resizes;
- Run Settings moves because its adaptive height changes;
- its scroll container moves the Model control.

The list scrolls internally only when its capped height is smaller than its content.

## 6. Adaptive Run Settings Height

Run Settings must not use a fixed `height` that reserves future fields.

### 6.1 Effort absent

The vertical structure is:

```text
Header
Mode
Model
Refresh models
```

Model is followed by only the normal field/footer spacing. No blank Effort row or fixed filler area remains.

### 6.2 Effort present

The vertical structure is:

```text
Header
Mode
Model
Effort
Refresh models
```

The outer frame increases only by the actual Effort field height and its defined spacing.

### 6.3 Small viewport

Run Settings uses a viewport-relative `max-height`, not a fixed normal height. When its content exceeds the available viewport:

- Header and Refresh remain visible.
- The central settings content becomes scrollable.
- Model and Effort floating lists remain outside that scrollable clipped content and are positioned from the current control rectangle.

## 7. Effort Compatibility Contract

This follow-up does not broaden Effort support.

- Render Effort only when the active ACP session advertises `reasoning_effort`.
- Hide the entire Effort field and its layout space when capability is absent.
- Do not infer capability from model names or Hermes versions.
- Do not display a disabled or upgrade placeholder.
- Do not send `session/set_config_option` when capability is absent.
- Do not bundle or install a Hermes runtime or modify the installed Hermes Agent as part of this UI follow-up.

## 8. Scope

### In scope

- Model combobox render and state in `media/main.js`.
- Run Settings and overlay styling in `media/styles.css`.
- Webview contract and behavior-focused tests for filtering, placement direction, edge attachment, cancellation, selection, and adaptive height.

### Out of scope

- Changing model catalog sources or Refresh behavior.
- Changing Hermes configuration files.
- Adding Effort support to an unsupported Hermes installation.
- Changing approval UI, permission ownership, Diff presentation, Working/Action rendering, Queue, Stop, commands, or final answers.
- Redesigning Mode or Refresh copy and styling beyond spacing required by adaptive height.
- Changing, simplifying, hiding, clipping, reordering, or replacing the existing Manual and Auto Mode options or their interaction.
- Replacing the combobox with native Quick Pick.

## 9. Acceptance Criteria

### AC-MODEL-COMBOBOX-01: Inline filtering

Given Run Settings is open and Model is focused, when the user types, the same Model control displays the filter text and the visible choices update immediately by model name, full ID, and provider. No second search input exists.

### AC-MODEL-ANCHOR-01: Few results

Given the filtered list's desired height fits below Model, the list appears directly below Model with a `0px` gap and does not move or resize Run Settings.

### AC-MODEL-ANCHOR-02: Many results

Given the list does not fit below but more space is available above, the list appears directly above Model with a `0px` gap, has a bounded height, and scrolls internally without covering the Model control.

### AC-MODEL-ANCHOR-03: Viewport boundary

Given neither side fits the full list, the list uses the side with more available Webview space and remains fully inside the Webview viewport.

### AC-MODEL-SELECT-01: Commit

Given filtered choices are visible, when the user clicks or presses Enter on a selectable model, the existing model-setting flow runs once, the list closes, and the selected model and provider are displayed.

### AC-MODEL-CANCEL-01: Restore

Given filter text differs from the committed model, when the user presses Escape or dismisses without selection, the prior committed model is restored and no settings change is sent.

### AC-RUN-HEIGHT-01: Effort absent

Given the active session does not advertise `reasoning_effort`, Run Settings renders no Effort field or reserved blank space and ends naturally after Model plus the Refresh footer.

### AC-RUN-HEIGHT-02: Effort present

Given the active session advertises `reasoning_effort`, Run Settings inserts Effort below Model and grows only by the Effort field's actual height.

### AC-ISOLATION-01: Existing interactions

Approval, Diff, Working, Action, Queue, Stop, command, model Refresh, and final-answer contract tests remain unchanged and pass.

### AC-MODE-ISOLATION-01: Mode remains unchanged

Given Run Settings is open, Manual and Auto render with the same order, labels, descriptions, selected styling, and click behavior as `0.2.54`. Opening, filtering, selecting, or dismissing Model must not mutate Mode state or remove either option.

When a large Model list opens upward, temporary visual overlap over Mode is allowed. The Model control remains fully visible and attached to the list, and Mode returns unchanged when the list closes.

## 10. Required Regression Coverage

- One and two matching choices place below when space permits.
- Many matching choices place above when below is insufficient.
- Direction changes when filtering reduces desired list height.
- The list stays flush to the Model control after Webview resize.
- Filtering matches display name, full model ID, and provider case-insensitively.
- No-match state is non-selectable.
- Escape and outside dismissal restore the committed model without a request.
- Clicking and Enter selection send one existing settings change.
- Unavailable choices cannot be committed.
- Effort absent produces no Effort DOM and no reserved layout height.
- Effort present adds exactly the Effort field to the natural layout.
- Refresh closes the Model list and clears transient filter state before refreshing.
- Existing approval, Diff, Agent rendering, Queue, Stop, and final-answer suites pass.
- Existing Manual/Auto render and selection contract tests pass without weakened assertions.

## 11. Non-regression Invariants

- No changes to ACP event routing or renderer ownership.
- No changes to Mode options, copy, ordering, styling semantics, or selection behavior.
- No changes to permission request or response flow.
- No changes to Diff projection, cleanup, or approval semantics.
- No automatic model change from typing or filtering.
- No global Hermes configuration writes.
- No fake Effort control for unsupported Hermes versions.
- No production dependency addition or toolchain change.
