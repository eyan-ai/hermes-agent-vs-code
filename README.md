# Hermes Agent for VS Code

Bring [Hermes Agent](https://github.com/NousResearch/hermes-agent) into the editor where the work already lives. Hermes Agent for VS Code combines editor-aware context, visible agent execution, reusable skills, persistent memory, session continuity, and run controls in one focused workspace.

## Why Hermes Agent for VS Code

### Editor-native context

Hermes works beside your code instead of in a detached chat window. The current file or selection can travel with the prompt, while workspace search and local attachments make it easy to add the exact context a task needs.

![Hermes Agent working beside an open source file in VS Code](https://raw.githubusercontent.com/eyan-ai/hermes-agent-vs-code/main/docs/images/hermes-editor-workspace.jpeg)

### Transparent and controllable execution

Follow long-running work through structured Thinking and Action records rather than an opaque stream of text. Review sensitive edits before they are applied, stop an active turn when the direction is wrong, and use Queue or Steer to control what happens next without losing the conversation.

![Structured actions and queued follow-up messages in Hermes Agent](https://raw.githubusercontent.com/eyan-ai/hermes-agent-vs-code/main/docs/images/hermes-actions-and-queue.jpeg)

### A persistent agent workspace

Sessions preserve the flow of a project, while editable personality, memory, and reusable skills let Hermes carry stable working preferences across tasks. Model, reasoning-effort, and approval-mode controls stay close to the composer so each run can match the level of autonomy you want.

![Hermes Agent personality, memory, attachments, and skill controls](https://raw.githubusercontent.com/eyan-ai/hermes-agent-vs-code/main/docs/images/hermes-memory-and-skills.jpeg)

Start a clean session directly from the editor whenever a task needs a fresh context, then continue with the same editor-aware composer and workspace tools.

![Quick new-session entry point and editor-aware composer](https://raw.githubusercontent.com/eyan-ai/hermes-agent-vs-code/main/docs/images/hermes-quick-new-session.jpeg)

### Background session continuity

Active Auto-mode tasks can continue in a standalone background host after VS Code closes. Reopening the same workspace restores the previous Agent workspace and session, including structured Thinking, Actions, and the final response. History shows running sessions and marks completed sessions that have not yet been viewed.

This capability requires a standalone Node.js installation. The extension can detect Node.js automatically, or you can set an explicit executable with `hermesAgent.nodePath`. Closing the computer, signing out of the operating system, or terminating the standalone Node.js process stops the background session.

## Feature overview

- ACP-powered streaming conversation UI in the VS Code Activity Bar.
- Structured Thinking and Action timeline with expandable details.
- Current file and selection context, with an explicit mute control.
- `@` workspace search and `+` local file or folder attachments.
- Clickable local document references and external links.
- Slash commands, reusable skills, Queue, and Steer workflows.
- Approval, Diff, and document-review flows for sensitive changes.
- Immediate Stop controls with isolated turn cancellation.
- Session history with running and unseen-completion indicators, rename, delete, and quick new-session actions.
- Workspace and Editor Session restoration when the same VS Code workspace reopens.
- Background task continuation after VS Code closes when standalone Node.js is installed.
- Persistent personality and memory documents.
- Run settings for approval mode, model selection, and per-model reasoning effort.
- Enter to send and Shift+Enter for a new line.

## Hermes CLI Integration

The extension requires a local [Hermes Agent](https://github.com/NousResearch/hermes-agent) CLI installation. ACP is the default transport for structured Thinking, Actions, permissions, model controls, and resumable session state. Install Hermes with ACP support and keep the `hermes` command available on your `PATH`.

Background session continuity also requires a standalone Node.js installation. The extension automatically checks common Node.js locations; use `hermesAgent.nodePath` when Node.js is installed somewhere else.

The CLI fallback remains configurable through `hermesAgent.commandArgs`:

```json
{
  "hermesAgent.command": "hermes",
  "hermesAgent.commandArgs": ["chat", "-q", "{{prompt}}", "-v"]
}
```

The extension sends the user prompt, selected skill, attachments, and current editor context to Hermes. If ACP is unavailable or disabled, the configured CLI fallback streams Hermes output into the same conversation UI. If `hermesAgent.command` is empty, the extension uses a local preview response instead of starting Hermes.

## Community project notice

Hermes Agent for VS Code is an independent, unofficial community extension. It is not affiliated with, endorsed by, or connected to Nous Research. The Hermes Agent name and the Nous girl logo (`nous-girl.png`) are property of Nous Research and are used here only to identify compatibility with Hermes Agent.
