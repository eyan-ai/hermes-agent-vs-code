# Editor 区域路由实施计划

**Spec 引用：** `docs/prds/hermes-agent-0.2.31-fix-followup-retest/specs/00-spec-index.md`  
**Spec/设计修订：** 2026-08-10 confirmed，D-04、`AC-03`、`AC-05`  
**目标：** 文档始终进入左侧文档区域，Hermes 会话始终进入右侧 Agent 区域。  
**架构：** 用 Hermes 自有 Webview 类型识别 Agent Tab，以统一路由方法查找或创建两类目标 Editor Group。Tab 变化监听只纠正错误归组，并使用迁移锁阻止循环。  
**技术栈：** VS Code Extension API、JavaScript  
**验收：** `AC-03`、`AC-05`  
**执行环境：** 继承计划 01 的工作树；不移动其他扩展 Webview，不合并用户无关 Editor Group。

## 文件映射

- 修改：`extension.js`，`openEditorSession`、Agent/文档区域识别、Tab 监听、附件与文档打开入口。
- 修改：`media/main.js`，Read action 文件名显示和完整 URI 传递。
- 修改：`media/styles.css`，Read 链接 hover 样式。
- 测试：`test/smoke/smoke.test.js`，双区域位置、重复 Agent Tab 与通用文档打开路径。

### 任务 1：建立双区域路由

**验收：** `AC-03`  
**依赖：** 计划 01 完成  
**接口：** 输入为当前 `tabGroups` 和 Hermes 自有 WebviewPanel 集；输出为文档目标 `ViewColumn`、Agent 目标 `ViewColumn` 和完成迁移的 Tab。  
**并行边界：** `extension.js` 与后续 Diff、Stop 计划共享，按计划编号串行。  
**风险与回滚：** 发现焦点循环、重复 Tab 或误迁移其他 Webview 时，停用自动纠正监听并保留显式打开路由。

- [ ] 扩展 smoke 断言：首个 Agent 在文档右侧，第二个 Agent 与首个 Agent 同组，文档不留在 Agent 组。
- [ ] 运行 smoke，确认当前 `openEditorSession` 使用文档列而失败；若环境仍 `SIGABRT`，记录为环境证据并继续静态验证。
- [ ] 只以 `hermesAgent.editorSession` 识别 Hermes Agent Tab。
- [ ] 新 Agent 复用 Agent 区域；无 Agent 区域时在文档区域右侧创建。
- [ ] 新文档复用文档区域；只有 Agent 区域时在其左侧创建文档区域。
- [ ] Tab 进入错误区域时先在目标区域恢复，再关闭错误区域中的原 Tab，并使用迁移锁。
- [ ] 运行 smoke 或等价 Extension Host 验证，预期路由断言通过。

### 任务 2：Read 文件名与通用打开

**验收：** `AC-05`  
**依赖：** 任务 1 输出的文档路由  
**接口：** 输入为 Read action 的完整 URI/path；输出为 basename 标签、完整 tooltip 和交给 VS Code 默认编辑器的打开请求。  
**并行边界：** 先完成统一文档路由，避免新增入口绕过分区。  
**风险与回滚：** 通用打开失败时显示错误，不回退到 Agent 区域或仅文本入口。

- [ ] 添加 Read action 仅显示 basename、保留完整 URI 的聚焦断言。
- [ ] 运行聚焦测试，确认当前显示完整路径并使用文本编辑器入口。
- [ ] Read action 显示文件名，默认无下划线，hover 出现下划线，tooltip 显示完整路径。
- [ ] 文件点击统一使用 VS Code 通用打开命令，并传入文档目标区域。
- [ ] 运行 `npm run lint`、聚焦测试和 smoke，预期除已知环境问题外通过。
