# Hermes Interrupted、输入稳定性与 Todo Follow-up

状态：已确认，允许实施。

## 目标

- 每个被手动终止的 Assistant 回复永久保留 `Interrupted`。
- Agent 流式输出不替换正在输入的 Composer DOM，不打断焦点、光标和输入法组合状态。
- 正确消费 Hermes ACP `agent_plan_update.entries`，在 Queue 上方居中展示 Todo 胶囊。

## 设计来源

- `docs/superpowers/specs/2026-08-11-hermes-interruption-input-todo-followup-design.md`
- 已确认交互原型：`outputs/hermes-interruption-input-todo-followup-prototype.html`

## 验收

- `A1`：后续新消息不会隐藏历史 stopped/failed 状态行。
- `A2`：常规 state、answer chunk、thinking 和 Todo 更新不会替换聚焦中的 `#prompt`。
- `A3`：真实 ACP `entries` 全量更新 Todo，空数组清空 Todo，Thinking 不重复渲染结构化 Plan 文本。
- `A4`：底部顺序为 Todo、Queue、Composer；Todo 居中并向上展开，不覆盖 Queue。
- `A5`：Queue、Steer、命令、Diff、审批、主题和 Thinking 高度规则无回归。

