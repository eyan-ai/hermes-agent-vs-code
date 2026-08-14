# Interrupted、输入稳定性与 Todo 实施计划

**Spec 引用：** `docs/prds/hermes-agent-interruption-input-todo-followup/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-11 已确认设计与 HTML 原型
**目标：** 修复历史终止状态消失、流式输出打断输入和 Todo 不展示三个问题。
**架构：** ACP renderer 负责规范化原生 Plan；Webview 将完整渲染与流式局部渲染分离，保留 Composer DOM；Todo 与 Queue 使用独立辅助区域。
**技术栈：** Node.js、VS Code Webview、原生 JavaScript/CSS、Playwright Chromium
**验收：** `A1`、`A2`、`A3`、`A4`、`A5`
**执行环境：** 当前脏工作树中只修改本任务直接相关文件，不回退已有改动。

## 全局约束

- 不改变 Queue 顺序、Steer、命令、Diff、审批、Editor 分区、主题和 Thinking 最大高度。
- 不新增依赖。
- 先获得失败测试，再做最小生产修改。
- 完成后运行 lint、unit、Chromium Webview 和 Extension Host smoke。

---

## 任务 1：补充失败测试

- [ ] 在 `test/acp-render.test.js` 增加真实 `agent_plan_update.entries`、空列表清理和无 Thinking Plan 重复测试。
- [ ] 在 `test/webview-contract.test.js` 增加历史 stopped/failed 状态、Todo/Queue 顺序及局部渲染契约。
- [ ] 扩展 `test/fixtures/webview-harness.html` 与 `test/webview-visual-check.js`，验证流式 state 更新后 `#prompt` 节点、焦点、文本和选择范围不变。
- [ ] 运行目标测试并记录预期失败。

## 任务 2：修复 ACP Todo 数据

- [ ] 在 `lib/acp-render.js` 优先读取 `raw.entries` 并按全量列表替换 `assistantMessage.plan`。
- [ ] 空 `entries` 清空计划。
- [ ] 不再向 Thinking timeline 注入结构化 Plan 文本。
- [ ] 保留兼容 `items`/`plan` 的增量路径。

## 任务 3：修复终止状态与稳定 Composer

- [ ] 调整 `answerStatusLine()`，terminal 状态按各 Assistant 消息持久显示，动态 Working 只属于当前运行消息。
- [ ] 将 Conversation 和 accessory stack 设为可单独更新的 DOM 区域。
- [ ] routine state、answer chunk、thinking 和 Todo/Queue 更新走局部渲染，不替换 Composer。
- [ ] 初始加载、会话切换、审批模式及用户主动 Composer 变更继续使用完整渲染。

## 任务 4：Todo 与 Queue 视觉层级

- [ ] Todo 在 Queue 前渲染，胶囊水平居中。
- [ ] Todo 详情以胶囊中心向上展开，且不覆盖 Queue。
- [ ] 无计划或任务终止时隐藏 Todo，避免 `Todos 0/0`。
- [ ] 保持 Queue 独立折叠与五行限制。

## 任务 5：验证与复核

- [ ] 运行目标测试、`npm run lint`、`npm run test:unit` 和 `git diff --check`。
- [ ] 运行真实 Chromium 交互验证，覆盖 360px 与宽屏。
- [ ] 运行 `npm test` Extension Host smoke。
- [ ] 复核最终 Diff，只保留当前三项问题所需改动。

