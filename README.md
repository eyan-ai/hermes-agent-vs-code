# Hermes Agent for VS Code

Bring [Hermes Agent](https://github.com/NousResearch/hermes-agent) into the editor where the work already lives. Hermes Agent for VS Code combines editor-aware context, visible agent execution, reusable skills, persistent memory, and session controls in one focused workspace.

## Why Hermes Agent for VS Code

### Editor-native context

Hermes works beside your code instead of in a detached chat window. The current file or selection can travel with the prompt, while workspace search and local attachments make it easy to add the exact context a task needs.

![Hermes Agent working beside an open source file in VS Code](https://raw.githubusercontent.com/eyan-ai/hermes-agent-vs-code/main/docs/images/hermes-editor-workspace.jpeg)

### Transparent and controllable execution

Follow long-running work through structured Thinking and Action records rather than an opaque stream of text. Review sensitive edits before they are applied, stop an active turn when the direction is wrong, and use Queue or Steer to control what happens next without losing the conversation.

![Structured actions and queued follow-up messages in Hermes Agent](https://raw.githubusercontent.com/eyan-ai/hermes-agent-vs-code/main/docs/images/hermes-actions-and-queue.jpeg)

### A persistent agent workspace

Sessions preserve the flow of a project, while editable personality, memory, and reusable skills let Hermes carry stable working preferences across tasks. Model and approval-mode controls stay close to the composer so each run can match the level of autonomy you want.

![Hermes Agent personality, memory, attachments, and skill controls](https://raw.githubusercontent.com/eyan-ai/hermes-agent-vs-code/main/docs/images/hermes-memory-and-skills.jpeg)

Start a clean session directly from the editor whenever a task needs a fresh context, then continue with the same editor-aware composer and workspace tools.

![Quick new-session entry point and editor-aware composer](https://raw.githubusercontent.com/eyan-ai/hermes-agent-vs-code/main/docs/images/hermes-quick-new-session.jpeg)

## Feature overview

- ACP-powered streaming conversation UI in the VS Code Activity Bar.
- Structured Thinking and Action timeline with expandable details.
- Current file and selection context, with an explicit mute control.
- `@` workspace search and `+` local file or folder attachments.
- Clickable local document references and external links.
- Slash commands, reusable skills, Queue, and Steer workflows.
- Approval, Diff, and document-review flows for sensitive changes.
- Immediate Stop controls with isolated turn cancellation.
- Session history with rename, delete, and quick new-session actions.
- Persistent personality and memory documents.
- Run settings for approval mode and model selection.
- Enter to send and Shift+Enter for a new line.

## Hermes CLI Integration

By default, the extension calls the local Hermes CLI:

```json
{
  "hermesAgent.command": "hermes",
  "hermesAgent.commandArgs": ["--oneshot", "{{prompt}}"]
}
```

The extension composes the user prompt, selected skill, attachments, and current editor context into one text prompt, then replaces `{{prompt}}` in `hermesAgent.commandArgs`.

Anything written to stdout is appended into the assistant message. If `hermesAgent.command` is empty, the extension falls back to a local preview response.

## Community project notice

Hermes Agent for VS Code is an independent, unofficial community extension. It is not affiliated with, endorsed by, or connected to Nous Research. The Hermes Agent name and the Nous girl logo (`nous-girl.png`) are property of Nous Research and are used here only to identify compatibility with Hermes Agent.
