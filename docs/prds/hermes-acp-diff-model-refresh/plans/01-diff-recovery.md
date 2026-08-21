# Diff 预览逃生实施计划

**Spec 引用：** `docs/prds/hermes-acp-diff-model-refresh/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-18 confirmed；用户编辑预览后保留当前文档并取消本次修改
**目标：** 用户修改 inline Diff 后，批准被阻止，但取消、No、Stop 和销毁路径一定能退出 Permission
**架构：** 将“安全回滚”和“放弃扩展所有权但保留当前文档”拆成两个显式结果。只有未修改预览执行范围删除；发生漂移时由用户确认后清除装饰与 Pending，并向 ACP 返回拒绝。
**技术栈：** Node.js、VS Code Extension API、现有零依赖测试
**验收：** `AC-DIFF-RECOVERY-01`、`AC-DIFF-SAFETY-01`
**执行环境：** 插件仓库现有 dirty working tree；不得覆盖 `0.2.52` 相关改动；不自动提交

## 全局约束

- 保留用户当前文档的每一个字节，不猜测或删除已漂移的 preview 内容。
- 未修改预览的 Yes、Always allow、No、Tell Hermes 文案和行为不变。
- 原始 request/session/toolCall/options/rawInput 不改写。

---

## 文件映射

- 修改：`extension.js`，`rollbackDocDiffPreview`、`resolveDiffPermission`、消息路由
- 修改：`media/main.js`，Permission 异常状态和逃生操作
- 修改：`media/styles.css`，复用现有 confirmation 样式增加逃生按钮状态
- 测试：`test/diff-preview.test.js`
- 测试：`test/extension-contract.test.js`
- 测试：`test/webview-contract.test.js`

### 任务 1：用行为状态表达回滚结果

**接口：** `rollbackDocDiffPreview(options) -> { status: "cleaned" | "diverged" | "failed" }`；`abandonDivergedDiffPreview()` 只释放扩展状态，不写文档
**风险与回滚：** 任一已有清理调用未适配新返回值即回退本任务；不改变 ACP 响应路径

- [ ] 在 `test/extension-contract.test.js` 添加 RED：漂移结果不得等同普通失败，且必须存在无文档写入的 abandon 分支。
- [ ] 运行 `node test/extension-contract.test.js`，预期因缺少结构化结果失败。
- [ ] 最小修改 `extension.js`，让普通清理、漂移和真正 API 失败可区分，并逐一适配调用方。
- [ ] 运行聚焦测试，预期 PASS。

### 任务 2：实现用户可达的取消路径

**接口：** webview 消息 `abandonDiffPreview` 携带 `sessionId`、`requestId`；后端调用 `resolveDiffPermission("deny", { abandonUnsafePreview: true, ... })`
**风险与回滚：** 只在当前 Permission 的 request/session 匹配时执行；错误所有权必须返回 false

- [ ] 在 `test/webview-contract.test.js` 和 `test/extension-contract.test.js` 添加 RED：漂移后展示 `Keep my edits and cancel this change`，Yes 不批准，逃生消息绑定原 request/session。
- [ ] 运行两个测试，预期因缺少消息与 UI 失败。
- [ ] 修改 `media/main.js`、`media/styles.css`、`extension.js`，加入漂移状态、按钮和既有 denial/stop barrier 复用。
- [ ] 运行聚焦测试，预期 PASS。
- [ ] 运行 `npm run test:unit`，预期审批、Queue、Stop、Working 路由全部 PASS。
