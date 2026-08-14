# Webview 交互修复实施计划

**Spec 引用：** `docs/prds/hermes-agent-0.2.31-fix-followup-retest/specs/00-spec-index.md`  
**Spec/设计修订：** 2026-08-10 confirmed，D-02、D-03 及 `AC-01`、`AC-02`、`AC-07` 至 `AC-10`  
**目标：** Skill、标题、响应式布局、滚动、Thinking 和确认按钮符合复测验收。  
**架构：** 保留现有 Webview 单页渲染结构，只补充状态类、滚动锚点和窄宽度约束。生成态 Thinking 使用独立运行态视口，结束态恢复自然高度。  
**技术栈：** JavaScript、HTML 模板、CSS、VS Code Webview  
**验收：** `AC-01`、`AC-02`、`AC-07`、`AC-08`、`AC-09`、`AC-10`  
**执行环境：** `main@c7e5ea0` 的脏工作树；保留现有未提交修改，不切换分支、不提交。

## 全局约束

- 不改变 Skill 选择与发送语义。
- 不重构聊天页面信息架构。
- 不使用页面级横向滚动掩盖布局问题。
- Thinking 限高只在 `running` 状态生效。

## 文件映射

- 修改：`media/main.js`，`renderPromptLine`、标题绑定、`renderAssistant`、`render` 后滚动同步、确认按钮。
- 修改：`media/styles.css`，响应式容器、运行态 Thinking、确认按钮和窄宽度媒体规则。
- 测试：`test/smoke/smoke.test.js`，扩展激活后的静态页面合同和 Editor 最小宽度手工入口。

### 任务 1：修复 Skill placeholder 与标题光标

**验收：** `AC-01`、`AC-02`  
**依赖：** 无  
**接口：** 输入为 `state.skill`、`state.titleEditing` 和原生点击事件；输出为动态 placeholder 与稳定输入光标。  
**并行边界：** 与任务 2、3 共写 `media/main.js`，必须串行。  
**风险与回滚：** 标题点击处理失效时仅回退本任务的事件分支，不改保存协议。

- [ ] 添加能证明 Skill 已选中时 placeholder 为空、编辑态点击不触发重新渲染的聚焦断言。
- [ ] 运行聚焦测试，确认因当前固定 placeholder 和父级点击处理而失败。
- [ ] 仅在展示态执行标题首次点击计算；编辑态输入点击使用原生行为。
- [ ] 根据 `state.skill` 输出空 placeholder 或默认提示。
- [ ] 运行聚焦测试，预期通过。

### 任务 2：修复新轮次定位与运行态 Thinking

**验收：** `AC-08`、`AC-09`  
**依赖：** 任务 1  
**接口：** 输入为消息 `status`、新问题发送意图和 Thinking 容器尺寸；输出为最新消息锚点、`running` 状态类、内部滚动位置和渐隐状态。  
**并行边界：** 共写 `render` 和 `renderAssistant`，与任务 1、3 串行。  
**风险与回滚：** 生成结束后仍限高或手动折叠被覆盖时，回退状态类切换和自动滚动函数。

- [ ] 添加运行态与结束态 class、限高和滚动规则的聚焦断言。
- [ ] 运行聚焦测试，确认当前仅单段文本限高且没有最新轮次锚点。
- [ ] 新问题发送时记录一次性最新轮次定位意图，并在渲染后定位最新 Assistant 输出。
- [ ] 只为展开且 `running` 的 Thinking 容器增加约 10 行限高、内部滚动、底部跟随和条件渐隐。
- [ ] 在 `done`、`stopped`、`failed` 时移除运行态限制，保留手动折叠状态。
- [ ] 运行聚焦测试，预期通过。

### 任务 3：修复最小宽度与确认按钮

**验收：** `AC-07`、`AC-10`  
**依赖：** 任务 2  
**接口：** 输入为当前 Webview 宽度；输出为容器内换行、收缩后的工具栏，以及 `Deny | Accept` 动作顺序。  
**并行边界：** 共写 `media/styles.css` 和确认区域模板，必须在任务 2 后执行。  
**风险与回滚：** 只回退窄宽度媒体规则和按钮 DOM 顺序，不恢复裁切式布局。

- [ ] 添加按钮文案与顺序、运行态 Thinking CSS、关键容器无固定最小宽度的合同断言。
- [ ] 运行聚焦测试，确认当前 `Accept All | Reject All` 与单段限高规则导致失败。
- [ ] 将确认按钮改为左 `Deny`、右 `Accept`，保持既有消息语义。
- [ ] 让正文、代码、表格、附件、action 和输入工具栏在最小宽度内换行或收缩。
- [ ] 运行 `npm run lint` 和聚焦测试，预期退出码 0。
- [ ] 在 VS Code 中把 Agent Editor Group 缩到最小宽度，预期无页面级横向滚动或内容裁切。
