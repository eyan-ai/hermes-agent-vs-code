# 全文 Diff 对齐实施计划

**Spec 引用：** `docs/prds/hermes-acp-diff-model-refresh/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-18 confirmed；LCS change group，不跨 equal 行配对
**目标：** 全文、多 hunk、不等量和空行修改在真实位置紧密呈现
**架构：** 在 `lib/diff-preview.js` 从现有 `diffLineOperations` 派生独立变化组与插入计划。`extension.js` 仅消费最终插入坐标和装饰范围，不再按 old/new 行序号机械配对。
**技术栈：** Node.js、VS Code Extension API
**验收：** `AC-DIFF-ALIGN-01`、`AC-DIFF-SAFETY-01`
**执行环境：** 依赖计划 01 的结构化回滚结果

## 全局约束

- 小范围既有 Diff 行为保持不变。
- 相等空行不着色；纯删除不插入占位；纯新增使用稳定锚点。
- 任何歧义或用户编辑均 fail closed。

---

## 文件映射

- 修改：`lib/diff-preview.js`
- 修改：`extension.js`，`openInlineDiffPreview` 与回滚记录消费
- 测试：`test/diff-preview.test.js`
- 测试：`test/document-review.test.js`

### 任务 1：生成 change-group 插入计划

**接口：** `buildInlineDiffPlan(sourceText, previewEdit) -> { insertions, deletedLineOffsets, addedRanges } | null`；每个 insertion 为 `{ offset, text, groupIndex }`
**风险与回滚：** 若生成坐标不能重放得到预期预览文本则返回 null，不回退到序号配对

- [ ] 添加 RED fixtures：等量两行、删除多于新增、新增多于删除、纯增、纯删、两 hunk、中文空行、CRLF、无末尾换行、重复段落。
- [ ] 运行 `node test/diff-preview.test.js`，预期缺少 `buildInlineDiffPlan` 失败。
- [ ] 用现有 `diffLineOperations` 实现变化组和坐标计划；删除 `buildTightPreviewInsertions` 的序号配对职责。
- [ ] 运行聚焦测试，预期所有 fixture PASS。

### 任务 2：接入编辑器并验证逆序清理

**接口：** `preview.inlinePlan` 保存最终 preview 坐标；WorkspaceEdit 删除按 start 降序执行
**风险与回滚：** 文档版本或文本漂移时不得使用记录坐标，转计划 01 逃生路径

- [ ] 添加 RED：多个 insertion 的最终坐标、逆序清理后精确恢复 sourceText、漂移后拒绝清理。
- [ ] 修改 `extension.js` 消费 `inlinePlan`，added decoration 只覆盖真实新增范围，deleted decoration 只覆盖真实删除行。
- [ ] 运行 `node test/diff-preview.test.js && node test/extension-contract.test.js`，预期 PASS。
- [ ] 运行 `npm run test:unit`，预期全部 PASS。

