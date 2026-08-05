# Hermes Agent for VS Code

Hermes Agent is a VS Code sidebar chat extension prototype packaged as a publishable extension. It provides a Codex/Claude-Code-like conversation UI, editor-aware context, workspace file references, slash skills, session history, and run settings.

## Features

- Sidebar chat view in the Activity Bar.
- Current editor file or selection is automatically available as context unless muted.
- `@` workspace search for files and folders.
- `+` local file/folder picker.
- `/` skill picker from `hermesAgent.skills`.
- Enter to send, Shift+Enter for a new line.
- Session history with rename and delete.
- Session title rename from the top bar.
- Run settings for approval mode, model, and effort.
- Streaming assistant output.
- Optional Hermes CLI integration through `hermesAgent.command`.

## Hermes CLI Integration

By default, the extension uses a local mock streaming response so the UI can be installed and tested immediately.

To connect a real Hermes Agent runtime, configure:

```json
{
  "hermesAgent.command": "hermes",
  "hermesAgent.commandArgs": ["agent", "run"]
}
```

The extension sends a JSON payload to stdin:

```json
{
  "prompt": "user prompt",
  "skill": "optional skill",
  "attachments": [],
  "editorContext": {}
}
```

Anything written to stdout is streamed into the assistant message.

## Development

```bash
npm install
npm run lint
npm run package
```

Press `F5` in VS Code to launch an Extension Development Host.

## Publishing

1. Update `publisher`, `repository`, and version in `package.json`.
2. Run `npm run package`.
3. Publish the generated `.vsix` with `vsce publish`.

## Notes

This implementation is independent of Claude Code. The Claude Code extension directory was only used as a structural reference for VS Code packaging concepts.
