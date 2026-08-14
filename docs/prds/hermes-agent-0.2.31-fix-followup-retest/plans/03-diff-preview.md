# Diff 临时预览实施计划

**Spec 引用：** `docs/prds/hermes-agent-0.2.31-fix-followup-retest/specs/00-spec-index.md`  
**Spec/设计修订：** 2026-08-10 confirmed，D-01、`AC-04`  
**目标：** 完整新文段临时显示在旧文段下方，并在 Accept、Deny、Stop 和异常路径正确清理。  
**架构：** 将文段定位与预览文本构造放入纯函数模块；Extension Host 负责临时文档编辑、范围 decoration、权限响应和冲突保护。Accept 先清理预览再允许正式修改。  
**技术栈：** JavaScript、VS Code TextDocument/TextEditor API  
**验收：** `AC-04`  
**执行环境：** 继承计划 02；不得整文件覆盖用户内容，不主动保存临时预览。

## 文件映射

- 新建：`lib/diff-preview.js`，文段定位、插入文本边界和安全清理定位纯函数。
- 新建：`test/diff-preview.test.js`，多行完整预览、段落边界、重复文本和冲突场景。
- 修改：`extension.js`，Diff 预览生命周期、Accept/Deny/Stop 清理与 decoration。
- 修改：`package.json`，把新增聚焦测试纳入 `test:unit` 和语法检查；保留已有脚本语义。

### 任务 1：定义并测试预览文本合同

**验收：** `AC-04`  
**依赖：** 计划 02 完成  
**接口：** `buildPreviewEdit(fullText, oldText, newText, fallbackOffset)` 返回旧文偏移、临时插入偏移、完整插入文本和绿色内容偏移；`locatePreviewForRemoval(currentText, previewRecord)` 返回唯一可安全删除范围或冲突结果。  
**并行边界：** 纯函数文件可独立编写，但接入 `extension.js` 前必须先通过测试。  
**风险与回滚：** 旧文无法唯一定位或临时文本无法安全定位时返回冲突，不猜测范围。

- [ ] 编写失败测试：单行、多行、旧文末尾无换行、文档末尾、重复新文和用户修改预览。
- [ ] 运行 `node test/diff-preview.test.js`，预期因模块不存在而失败。
- [ ] 实现最小纯函数，确保完整 `newText` 位于旧文结束后的独立行。
- [ ] 运行聚焦测试，预期通过。

### 任务 2：接入临时写入和确认生命周期

**验收：** `AC-04`、`GR-04`  
**依赖：** 任务 1 输出的纯函数合同  
**接口：** 输入为 ACP diff 与待确认权限；输出为临时文档编辑记录、红/绿 decoration，以及一次且仅一次的权限响应。  
**并行边界：** 共写 `extension.js`，必须在 Editor 路由后、Stop 生命周期前完成。  
**风险与回滚：** 清理失败时不得 Accept；Deny 不整文件恢复，不覆盖用户额外编辑。

- [ ] 使用临时文档编辑插入完整预览，记录 URI、文本、上下文和版本。
- [ ] 旧文变化字符使用红色 decoration，临时插入块使用绿色 decoration。
- [ ] Accept：安全移除预览成功后再响应 allow；失败则保留权限等待并提示冲突。
- [ ] Deny、Stop、确认关闭和扩展释放：安全移除预览并响应 cancel；冲突时保护用户内容并提示检查。
- [ ] 移除现有整文件 `writeFile` 回滚路径。
- [ ] 运行 `npm run lint`、`npm run test:unit`，预期退出码 0。
