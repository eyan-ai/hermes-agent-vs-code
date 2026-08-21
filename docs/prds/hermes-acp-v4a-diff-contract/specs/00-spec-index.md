# Hermes ACP V4A 与文档内紧密 Diff 修复 Spec

- Status: confirmed
- Prerequisites: 无
- Baseline: Hermes Agent `0.18.2` revision `1705a440`；Hermes Agent VS Code `0.2.51` revision `05c3046`
- Decision owner: 用户
- Draft date: 2026-08-17

## 范围

本 Spec 处理两个直接相关但机制独立的 Diff 问题：

1. ACP Session 中，单文件 V4A `Update File` 审批请求把原始 Patch 指令错误放入 `newText`，导致客户端把原文整段标红、Patch 控制文本整段标绿。
2. 已有文件的中长段落修改采用“完整旧段落在上、完整新段落在下”的文档内预览，相关删除行与新增行距离过远，重复展示大量未变化上下文。

目标边界是：不修改 Hermes Core、Hermes Python ACP Server Adapter、Desktop、CLI 和 Gateway；仅由 VS Code 插件内的 ACP Client Adapter 针对单文件 V4A `Update File` 生成“原文/候选正文”的预览副本，并调整已有文件中长段落的文档内 Diff 排列。原始 ACP Permission request、审批结果、Agent 事件、颜色、审批语义和其他界面保持不变。

## 文档地图

| 顺序 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | [01-background-and-goal.md](./01-background-and-goal.md) | confirmed | 问题、目标、范围与交互隔离已确认 |
| 2 | [02-acceptance-criteria.md](./02-acceptance-criteria.md) | confirmed | 可观察结果、隔离边界与异常策略已确认 |
| 3 | [03-as-is.md](./03-as-is.md) | confirmed | 当前协议、文档预览、审批与回显边界已确认 |
| 4 | [04-to-be.md](./04-to-be.md) | confirmed | 目标行为、异常规则与完整回归矩阵已确认 |

## 已确认决策

- D-01：V4A 兼容修复限定在 VS Code 插件内的 ACP Client Adapter，不修改 Hermes Python ACP Server Adapter 或 Hermes Core 的 Patch 执行逻辑。
- D-02：Hermes Desktop、CLI、Gateway 和其他 ACP 客户端不接入本次新行为。
- D-03：插件只为原文档 Diff 预览识别并转换单文件 V4A Permission payload；原始 Permission request、`rawInput`、审批响应和 Agent 事件不得被改写。
- D-04：本次只处理单文件 V4A `Update File`；`Add File`、`Delete File`、`Move File` 和多文件 Patch 均不纳入。
- D-05：原始 V4A Patch 继续作为原始工具输入保留；插件从 Permission payload 的 `rawInput.arguments.patch` 读取 Patch，仅在内存中基于 `oldText` 生成预览候选正文。
- D-06：中长段落的紧密 Diff 布局纳入本次交付，但必须与 V4A 数据契约修复保持独立边界。
- D-07：同一变化 hunk 内，删除行和新增行按顺序一一交错；数量不一致时，剩余行紧接在最后一个配对后单独显示。
- D-08：紧密 Diff 仅改变原文档 Editor 中的临时 Diff 呈现，不改变审批交互、Agent 处理过程或 Working/回答回显内容。
- D-09：单文件 V4A Update 无法生成可靠候选正文时，不展示原文档 Diff，并通过现有 Permission 拒绝/工具失败语义阻止该次工具执行；不得把原始 Patch 当作候选正文，正常路径不新增消息或改变回显格式。
- D-10：完成代码修改和验证后，将 VS Code 扩展版本更新为 `0.2.52`，生成新的 `hermes-agent-vscode-0.2.52.vsix`；不复用或覆盖 `0.2.51` 产物。

## 证据

- ACP Schema 将 `newText` 定义为修改后的内容，而不是补丁命令。
- Hermes 当前单文件 V4A 审批请求使用原文件全文作为 `oldText`，使用原始 `*** Begin Patch ... *** End Patch` 作为 `newText`。
- VS Code 插件在收到标准“原文全文/修改后全文”时可以自动缩小到实际变化；只有收到 Patch 指令作为 `newText` 时才复现整段错误标色。
- 当前 Permission payload 同时包含 Diff block 的原始文件全文、V4A Patch 文本以及 `rawInput.arguments.patch`，插件具备生成预览候选正文所需的全部输入。
- 确定性内存探针已证明：单文件、多 hunk、中文正文的 V4A Patch 可以从现有 payload 还原候选正文，并被插件现有全文收缩逻辑定位到实际变化行，且无 Patch 控制文本泄漏。
- 紧密 Diff 探针已证明：同一 hunk 可以按旧 1/新 1/旧 2/新 2 排列；记录最终临时插入范围并按逆序清理，可精确恢复源文档。

## 确认记录

- 2026-08-17：用户确认 Background、Acceptance、As-Is，并以“实施”批准 To-Be 进入工程实施。
- 当前无未决 Spec 阻塞项。
