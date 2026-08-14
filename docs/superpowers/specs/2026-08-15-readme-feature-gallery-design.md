# README Feature Gallery Design

## Goal

Turn the extension README and Marketplace description into a concise, capability-led introduction to Hermes Agent for VS Code. The four supplied screenshots will be packaged with the extension and used as supporting illustrations, not as the structure that determines the product story.

## Scope

This change is documentation-only:

- copy four supplied JPEG screenshots into `docs/images/`;
- rewrite and reorder `README.md`;
- rebuild the existing `0.2.49` VSIX;
- verify that the README and all four images are present in the package.

No extension runtime, Stop, denial, ACP, queue, rendering, or interaction logic will change.

## README structure

The README will use this order:

1. `Hermes Agent for VS Code` title;
2. one short product-positioning paragraph;
3. `Why Hermes Agent for VS Code` capability story;
4. concise `Feature overview` list;
5. `Hermes CLI Integration` and configuration example;
6. `Community project notice`;
7. `Development`;
8. `Publishing`.

The unofficial-extension notice will no longer appear in the opening paragraph. It will be presented later as a normal informational section without a warning emoji or alert-style lead-in. It must still state that the project is an independent unofficial community extension, is not affiliated with or endorsed by Nous Research, and uses the Hermes Agent name and Nous girl logo only for compatibility identification.

## Capability narrative

The main narrative will explain the product through three coherent capability pillars rather than deriving one feature from each screenshot:

1. **Editor-native context** — current files, selections, attachments, and workspace references keep the agent grounded in the work already open in VS Code.
2. **Transparent and controllable execution** — Thinking and Action records, approval flows, Stop, Queue, and Steer make long-running work visible and interruptible.
3. **A persistent agent workspace** — sessions, memory, reusable skills, models, and run modes support ongoing work instead of one-off chat prompts.

The concise `Feature overview` that follows will enumerate concrete capabilities so the main narrative does not need to stretch or omit facts to fit the available screenshots.

## Screenshot placement

Screenshots are visual evidence for the surrounding narrative. They may illustrate several nearby capabilities and will not each receive an artificial standalone feature story. Each image will be rendered full-width on its own row; images will never be placed side by side or in a table.

The broad editor-and-agent workspace image will establish the overall experience near the start of the capability narrative. The action timeline and Queue image will support controllable execution. The memory and skills image will support persistent workspace configuration. The quick-session image will close the capability section as an illustration of everyday navigation and session flow.

## Image assets

The supplied files will be copied without visual alteration and renamed for stable README references:

- `docs/images/hermes-editor-workspace.jpeg`;
- `docs/images/hermes-actions-and-queue.jpeg`;
- `docs/images/hermes-memory-and-skills.jpeg`;
- `docs/images/hermes-quick-new-session.jpeg`.

Markdown image alt text will describe the visible product capability rather than repeat the filename.

## Verification

Before packaging:

- confirm every README image path resolves to an existing file;
- confirm the README remains English and contains no opening disclaimer;
- confirm the attribution notice retains all required meaning;
- run the existing lint and unit suites to ensure the documentation-only change did not disturb the extension;
- package version `0.2.49`;
- inspect the VSIX to confirm `extension/readme.md` and all four `extension/docs/images/*.jpeg` files are included;
- verify the archive integrity and report the absolute VSIX path and SHA-256 checksum.
