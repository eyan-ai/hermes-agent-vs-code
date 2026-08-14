# Hermes Agent 审阅、确认、Working 与 Model 实施计划

**Spec 引用：** `docs/prds/hermes-agent-review-confirmation-workflow/specs/00-spec-index.md`  
**Spec/设计修订：** 2026-08-13 confirmed，D-01 至 D-19  
**目标：** 在不回退既有会话能力的前提下，实现真实 Model 选择、Working 动作规范、通用确认输入以及分级文档审阅。  
**架构：** 纯状态和格式转换进入 `lib/` 并由单元测试覆盖；Extension 负责 ACP、Editor 和持久化；Webview 只负责渲染与用户事件。优先复用现有 `.permission-panel`、Working 时间线、文档 Editor 路由和主题变量。  
**技术栈：** JavaScript、VS Code Extension API、ACP JSON-RPC、Node.js tests、Playwright/Webview harness  
**验收：** AC-01 至 AC-23  
**执行环境：** `main`，基线 `113bc56` / `0.2.44`；保留现有未跟踪 Spec，不重置工作树，不自动提交或发布。

## 全局约束

- 只修改本 Spec 覆盖的行为。
- 确认组件复用现有 `.permission-panel` 的位置、外框和 UI 规范。
- Mode 行为不变；Run Settings 不提供 Reset。
- 原文在最终明确应用前不得被正式覆盖。
- 自由输入不得映射为 Allow。
- 已修复的宽度、附件、长消息、输入焦点、Queue、Steer、Todo、Thinking、Interrupted、历史搜索和标题编辑必须保持。

---

## Task 1：Model 状态和 Run Settings

**修改：** `lib/model-settings.js`、`extension.js`、`media/main.js`、`media/styles.css`、`test/model-settings.test.js`、`test/extension-contract.test.js`、`test/webview-contract.test.js`、`package.json`

- [x] RED：覆盖 ACP `availableModels/currentModelId` 归一化、无效继承回退、会话独立值、Webview 无 Reset、Model 上下布局。
- [x] GREEN：将 ACP `session/new` 返回的模型状态保存到 UI 会话；建立会话前使用当前 Hermes provider 配置；成功选择后调用 `session/set_model` 并保存 `hermesAgent.lastModel`。
- [x] GREEN：新会话继承上次成功模型；切换失败恢复旧值并重新推送状态。
- [x] 验证：`node test/model-settings.test.js && node test/extension-contract.test.js && node test/webview-contract.test.js` 全部通过。

## Task 2：Working 动作渲染

**修改：** `lib/acp-render.js`、`media/main.js`、`media/styles.css`、`test/acp-render.test.js`、`test/webview-contract.test.js`

- [x] RED：本地动作只显示文件名、URL 单一链接、普通颜色和连续 hover 下划线；代码 Action 标题不含源码。
- [x] GREEN：代码标题仅使用动作类型和可信自然语言目的；源码与结果进入现有展开区。
- [x] GREEN：仅输入输出均明确且有意义时使用 `IN/OUT`；单侧内容使用单一代码/结果块。
- [x] 验证：`node test/acp-render.test.js && node test/webview-contract.test.js` 全部通过。

## Task 3：通用确认自由输入

**修改：** `extension.js`、`media/main.js`、`media/styles.css`、`test/extension-contract.test.js`、`test/webview-contract.test.js`

- [x] RED：现有确认区出现可选自由输入；按钮点击即提交；Enter 提交、Shift+Enter 换行、IME 不误提交；同请求只提交一次。
- [x] GREEN：预设 Permission 仍返回 ACP `optionId`；自由意见先拒绝当前待执行操作，再作为同会话用户反馈发送，不允许当前操作。
- [x] GREEN：问题和最终回答写入 Working 结构；失败恢复输入，不新增确认框架。
- [x] 验证：确认契约测试和 Webview 真实交互检查通过。

## Task 4：Diff、文件预览与 Review

**修改：** `lib/diff-preview.js`、新增审阅状态模块、`extension.js`、`media/main.js`、`media/styles.css`、对应单元与 Extension Host 测试

- [x] RED：局部 Diff 只高亮真实变化行；文档未打开时只在确认区显示紧凑 Diff。
- [x] RED：新增文件进入完整内容预览，不展示 Diff，拒绝时不创建文件。
- [x] RED：已打开文档无论变化大小都进入原文档内联 Diff；未打开文档只有实际变化达到阈值才进入 Result/Changes Review。
- [x] GREEN：Review Editor 位于 Agent 右侧并自动聚焦；Result 默认完整候选，Changes 按最终顺序展示单栏 Unified Diff。
- [x] GREEN：关闭临时 Editor 保持 Pending并允许重新打开；原文冲突阻止迟到允许。
- [x] GREEN：确认自由意见拒绝当前候选并续入当前 ACP 轮次，不经过 Queue 或可见 Steer；同路径下一版候选复用原 Review Editor。
- [x] GREEN：新增文件允许后由 Agent 真实创建，插件检测到批准内容后切换到真实文件。
- [x] 纯状态、Extension/Webview 契约测试已通过；完整 Extension Host 和视觉回归在 Task 5 执行。

### 协议边界

Hermes ACP 当前没有结构化“大修改”或 Plan 审批生命周期。因此插件不接管 Plan，也不保证把多个局部 Permission 合并为整篇候选。本实现只在现有写入 Permission 已包含可计算候选内容时选择预览 UI：目标不存在为新增文件预览；目标已打开为原文档内联 Diff；目标未打开且实际变化达到阈值为完整 Review；其余为确认区紧凑 Diff。最终写入始终由 Agent 在收到 ACP Allow 后执行。

## Task 5：完整回归和制品

- [ ] 运行 `npm run lint`，预期无语法错误。
- [ ] 运行 `npm run test:unit`，预期全部通过。
- [ ] 运行 `npm test`，预期单元与 smoke 全部通过。
- [ ] 运行 Webview 360px、900px 视觉检查，确认无横向溢出且现有功能未回退。
- [ ] 运行 `git diff --check` 并审阅最终 Diff。
- [ ] 用户单独要求打包后才更新版本号并运行 `npm run package`；本计划不自动发布。

## 恢复策略

- 每个 Task 独立保持测试绿色；若后续 Task 失败，只撤销本 Task 新增代码，不回退用户已有修改。
- ACP Model 切换失败不持久化新值。
- 审阅写入失败保留候选稿和 Pending 状态，不覆盖原文。
- 审阅阈值只影响 UI；如分类或 Review 创建失败，保持 Permission Pending，不替代 Agent 写入或自动允许。
