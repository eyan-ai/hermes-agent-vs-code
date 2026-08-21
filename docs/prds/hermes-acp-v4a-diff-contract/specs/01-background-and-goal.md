# 背景与目标

- Status: confirmed
- Prerequisites: [00-spec-index.md](./00-spec-index.md)
- Evidence: 用户截图与现场复现；Hermes ACP Adapter、ACP Schema、VS Code 插件当前源码
- Confirmed decisions: D-01 至 D-10
- Confirmation date: 2026-08-17
- Blocking open questions: 无

## 背景

Hermes 的 V4A `patch` 工具使用 `*** Begin Patch`、`*** Update File`、`@@` 和增删行描述修改意图。在 ACP 编辑审批路径中，当前实现为了保证补丁在用户允许前不执行，会先读取原文件作为 `oldText`，但将原始 V4A Patch 指令直接作为 `newText` 发送给 ACP 客户端。

ACP 对 `newText` 的标准含义是“修改后的新内容”。VS Code 插件按照该标准计算 Diff，因此会把原文与 Patch 指令视为两份完全不同的文档，最终表现为原文大面积标红、Patch 控制文本大面积标绿。

现场对照已确认：小范围 replace、`write_file` 以及真实的“原文全文/修改后全文”均能正常缩小到实际变化；问题不由文档长度触发，而由 V4A Patch 的非标准 ACP 投影触发。大范围修改更常使用 V4A，因而表面上更容易被观察为“全文 Diff 问题”。

现有 Permission payload 除错误投影的 Diff block 外，还保留了原始 `rawInput.arguments.patch`。因此 VS Code 插件拥有原文件正文和完整 V4A Patch，可以在不修改原始 Permission request 的前提下，仅为原文档 Diff 预览生成真实候选正文。

此外，当前插件对已有文件的文档内预览采用整体插入策略：保留完整旧文段，再将完整新文段插入旧文段末尾，最后分别装饰变化行。该策略能正确识别变化行，但在中长段落中会形成“上面一整段旧文、下面一整段新文”，使对应的删除和新增内容相距较远，并重复展示未变化上下文。

## 受影响用户

- 在 VS Code 中通过 Hermes ACP 审批单文件 V4A Update 的用户。
- 需要依据红绿 Diff 判断是否允许文件修改的用户。

Hermes Desktop、CLI、Gateway、其他 ACP 客户端和 Hermes Python 运行时不属于本次修改范围，因为兼容转换只存在于本 VS Code 插件的原文档预览入口。

## 目标

- G-01：让插件针对单文件 V4A `Update File` 生成符合 `oldText/newText` 语义的原文档预览副本，同时保留原始 ACP Permission payload。
- G-02：让 ACP 客户端只展示 Patch 实际删除和新增的正文，不展示 V4A 控制文本。
- G-03：保证审批预览生成过程不修改目标文件。
- G-04：保持 Hermes Core、Python ACP Server Adapter、Desktop、CLI、Gateway、非 V4A Permission 和 VS Code 其他 Diff 行为不变。
- G-05：保证用户允许后实际执行的修改与审批时展示的候选正文一致，不对已经变化的文件盲目执行旧候选。
- G-06：让中长段落的相关删除行和新增行紧邻展示，未变化上下文只承担定位作用，不整段重复。
- G-07：保持现有小范围 Diff、删除/新增颜色、审批与安全回滚语义不变。
- G-08：保证紧密 Diff 不改变审批弹窗、审批选项、自由反馈、Pending 生命周期、Agent Thinking/Action/结果和最终回答的回显内容。
- G-09：完成验证后交付独立的 `0.2.52` VSIX，版本元数据和包内代码与本次修改一致。

## 成功信号

- 单文件 V4A Update 在 VS Code 中只标记实际变化的行。
- `*** Begin Patch`、`*** Update File`、`@@`、`*** End Patch` 不作为新增正文出现。
- 拒绝审批后目标文件保持原样。
- 允许审批后最终文件与审批候选一致。
- 现有 replace、`write_file`、普通全文候选、非 V4A Permission 以及 Agent 回显回归验证通过。
- 中长段落不再以完整“旧块 + 新块”重复展示，相关变化能够按 hunk 就近比较。
- 除原文档 Editor 中的 Diff 排列外，审批区和 Agent 会话区与当前基线无可观察差异。
- 新产物文件名和包内扩展版本均为 `0.2.52`，且不覆盖已有 `0.2.51` 包。

## 约束

- 只在 VS Code 插件处理单文件 V4A Permission 的原文档 Diff 预览边界生效。
- 审批前只能读取文件并在内存中计算候选正文，不得执行真实文件写入。
- 原始 V4A Patch 仍由 Hermes 原有执行路径负责实际执行。
- 不修改或替换原始 Permission request、`rawInput`、tool call、Permission response 和 session/update 事件。
- 必须保留当前工作区中与权限等待、取消和会话隔离相关的既有修改，不得覆盖或顺带重构。
- 不新增依赖，不改变工具协议版本，不重做 VS Code 前端样式、确认流程或 Editor 布局。
- 紧密 Diff 不得新增、删除、重排或改写任何 Agent 消息、Thinking、Action、结果、回答或审批控件。

## 非目标

- 不修改 Hermes Core 的通用 Patch 执行器。
- 不改变 Hermes Desktop、CLI 或 Gateway 的文件编辑和审批逻辑。
- 不修改 Hermes Python ACP Server Adapter 的 V4A proposal。
- 不把 V4A 兼容转换扩展到原文档 Diff 预览之外的区域。
- 不处理 `Add File`、`Delete File`、`Move File` 或多文件 V4A Patch。
- 不修改 `patch mode="replace"` 或 `write_file`。
- 不重新设计 Diff 颜色、Review 页面、确认弹窗或文档 Editor 布局。
- 不增加逐行或逐 hunk 接受、拒绝能力。
- 不改变审批按钮、预设选项、自由输入、提醒、Pending、Allow/Deny/反馈提交和重新打开预览入口。
- 不改变 Agent 执行步骤、Working 时间线、工具标题、详情、结果或最终回答。
- 不把插件内的兼容行为描述为 ACP 协议或 Hermes Python 生产端的通用修复。
