# 紧密文档内 Diff 实施计划

**Spec 引用：** `docs/prds/hermes-acp-v4a-diff-contract/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-17 confirmed；D-06 至 D-08；多范围回滚确定性探针
**目标：** 原文档中按 hunk 显示旧 1/新 1/旧 2/新 2，并在所有退出路径安全清理多个临时插入段。
**架构：** 扩展纯 Diff 模块产出多范围 inline preview plan；Editor 仅按 plan 插入新行并装饰旧/新行。清理使用最终范围、文本和锚点逆序定位，不再假设只有一个连续 `insertText`。
**技术栈：** Node.js CommonJS、VS Code Extension API、`assert` 测试
**验收：** AC-09 至 AC-12
**执行环境：** 依赖 `01-v4a-preview-projection.md` 完成；当前测试基线通过

## 全局约束

- 不改变颜色、Review 阈值、新文件预览、未打开文件 Review、Permission controls、Agent renderer 或消息时序。
- 单行 Diff 结果保持“旧行后紧接新行”；真实换行是唯一行边界。
- 用户内容或临时范围无法唯一确认时不得盲目删除。

---

## 文件结构

- 修改：`lib/diff-preview.js`，新增紧密 plan 和多范围定位纯函数，保留既有单范围 API 兼容。
- 修改：`test/diff-preview.test.js`，覆盖配对、hunk、位移和回滚。
- 修改：`extension.js:openInlineDiffPreview`、`rollbackDocDiffPreview`、`diffSourceMatches`，消费多范围 plan。
- 修改：`test/extension-contract.test.js`，覆盖所有退出路径和隔离边界。

### 任务 1：生成稳定的紧密 inline preview plan

**验收：** AC-09
**依赖：** Plan 01 完成
**文件：**

- 修改：`lib/diff-preview.js`
- 修改：`test/diff-preview.test.js`

**接口：**

- 输入：`buildInlinePreviewPlan(sourceText, previewEdit)`，`previewEdit` 来自现有 `buildPreviewEdit`。
- 输出：`{ insertions, deletedRanges, addedRanges, previewText, revealStart, revealEnd }`；每个 insertion 含原始 `sourceOffset`、`text` 和应用后的 `finalStart/finalEnd`。
- 清理输入：`locateInlineInsertionsForRemoval(currentText, insertions)`。
- 清理输出：按文档位置升序的精确 ranges，或无法安全确认时返回 `null`。

**并行边界：** 先稳定纯函数，再改 Editor 生命周期。
**风险与回滚：** 保留既有 `buildPreviewEdit` 和单范围测试；若新 plan 失败可撤回新增导出而不影响其他 Review。

- [ ] 编写失败测试：2、3、10 行等量替换输出逐行交错的 `previewText`。
- [ ] 编写失败测试：3 删 1 增、1 删 3 增、纯增、纯删、两个相隔 hunk、长行视觉换行。
- [ ] 编写失败测试：多个不同长度 insertion 的最终坐标、逆序删除后严格恢复 source。
- [ ] 编写失败测试：无关位置编辑仍可唯一定位；临时文本或锚点被改、重复锚点不唯一时返回 `null`。
- [ ] 运行 `node test/diff-preview.test.js`，预期新断言 `FAIL`。
- [ ] 实现 plan 和 locator，复用现有行级 LCS，不引入第二套 Diff 算法。
- [ ] 运行 `node test/diff-preview.test.js`，预期所有旧测试和新增测试 `PASS`。

### 任务 2：Editor 使用多范围插入、装饰与逆序清理

**验收：** AC-09、AC-10
**依赖：** 任务 1 的 plan/locator
**文件：**

- 修改：`extension.js` 顶部 Diff imports
- 修改：`extension.js:openInlineDiffPreview`
- 修改：`extension.js:rollbackDocDiffPreview`
- 修改：`extension.js:diffSourceMatches`
- 修改：`test/extension-contract.test.js`

**接口：**

- 输入：`preview.inlinePlan` 和当前 VS Code document。
- 输出：一次临时 Editor edit 应用全部 source-coordinate insertions；装饰 ranges 使用应用后坐标；`preview.insertions` 保存最终安全清理记录。
- 清理：定位全部 insertion 后，WorkspaceEdit 按范围从后向前删除；全部成功后才清空 preview state。

**并行边界：** 与任务 1 串行；不得修改 Permission 响应代码。
**风险与回滚：** 任一范围不可确认即不执行部分清理；不得出现清理一半的文档。旧单范围兼容直到全部测试通过再移除调用。

- [ ] 先更新契约测试，要求 `openInlineDiffPreview` 消费多 insertion plan，`rollbackDocDiffPreview` 在一次校验后逆序删除。
- [ ] 运行 `node test/extension-contract.test.js`，预期新断言 `FAIL`。
- [ ] 替换整体 `insertText` 应用和连续新块装饰，使用 plan 的 deleted/added ranges。
- [ ] 清理前先完整解析所有 ranges；任何一个失败则不创建 WorkspaceEdit，防止部分回滚。
- [ ] 验证 Allow 清理后 Hermes 正式修改只出现一次；Deny/Stop/过期/关闭/释放后 source 逐字节恢复。
- [ ] 运行 `node test/diff-preview.test.js && node test/document-review.test.js && node test/extension-contract.test.js`，预期 `PASS`。

### 任务 3：审批和 Agent 回显保护性回归

**验收：** AC-11、AC-12
**依赖：** 任务 2
**文件：**

- 修改：`test/extension-contract.test.js`，只增加边界断言
- 复用：ACP renderer、turn lifecycle、permission、queue 和 webview 现有测试

**接口：**

- 输入：修改前已有 ACP fixture 和相同事件顺序。
- 输出：除原文档 inline Diff 文本与 ranges 外，Permission 和 Agent 快照不变。

**并行边界：** 完成 Editor 改动后执行。
**风险与回滚：** 保护性测试失败时只修复本次造成的回归；若暴露既有范围外缺陷，阻断交付并单独报告。

- [ ] 运行并记录 Allow/Deny/反馈/Pending/队列/提醒/重新打开/过期/Stop 保护测试。
- [ ] 运行并记录 Deny 屏障、兄弟 Permission、`/deny` 不泄漏、late event、已完成 Action、不同 `toolCallId` 和 `pendingText` 测试。
- [ ] 运行 `node test/acp-render.test.js && node test/prompt-queue.test.js && node test/session-cancellation-barrier.test.js && node test/turn-lifecycle.test.js && node test/webview-contract.test.js`，预期全部 `PASS`。
- [ ] 运行 `npm run test:unit`，预期全量单元与契约回归 `PASS`。
