# 背景与目标

- Status: confirmed
- Prerequisites: [00-spec-index.md](./00-spec-index.md)
- Evidence: 用户复测反馈；当前扩展源码
- Confirmed decisions: D-01 至 D-05
- Blocking open questions: 无

## 背景

`v0.2.31-fix-followup` 已覆盖前一轮部分交互问题，但复测显示若干修复只完成了界面表现或局部路径，没有形成完整行为闭环。主要表现为：编辑输入状态被重渲染干扰、Hermes Agent 与文档 Tab 仍可能混列、Diff 新内容无法完整定位、Stop 未终止后端轮次、窄窗口内容被裁切，以及 Thinking 运行态的信息聚焦仍不清晰。

## 受影响用户

- 在 VS Code Editor 区域使用 Hermes Agent 多会话的用户。
- 同时阅读或编辑代码、Markdown、图片、PDF、Notebook 等文档的用户。
- 在长任务中依赖 Thinking、Read action、Diff 确认和 Stop 控制任务的用户。

## 目标

- G-01：让输入、标题编辑、滚动和 Thinking 在当前交互状态下稳定可控。
- G-02：建立文档与 Hermes Agent 两类 Editor 区域的稳定路由规则。
- G-03：让 Diff 预览完整、位置正确、可回滚，并保持确认语义一致。
- G-04：让 Stop 从界面状态延伸到后端执行终止，避免后续问题进入旧任务队列。
- G-05：在 VS Code Editor Group 最小可用宽度下保持会话内容可读。

## 成功信号

- [02-acceptance-criteria.md](./02-acceptance-criteria.md) 中 AC-01 至 AC-10 全部通过。
- Stop 后不再产生旧轮次输出，也不再出现 `Queued for next turn`。
- 文档和 Hermes Agent Tab 在典型打开路径中不发生交叉。
- Diff 的完整新文段显示在旧文段下方，并能在两种确认结果下正确清理。

## 约束

- 仅修改本次 10 项问题直接涉及的行为。
- 复用 VS Code 原生 Editor Group、Tab、文档打开与主题能力。
- 不因修复窄宽度问题而增加页面级横向滚动。
- Diff 临时预览不得主动保存；所有离开确认流程的路径都必须清理预览。
- 强制停止 ACP 进程只能作为取消未生效时的兜底，不应成为正常取消的唯一方式。

## 非目标

- 不重做聊天界面信息架构。
- 不改变 Skill 数据来源、Skill 执行语义或空问题发送规则。
- 不改变 Auto/Manual Mode 含义。
- 不合并或关闭用户创建的无关 Editor Group。
- 不新增 Diff 的逐项接受、逐项拒绝能力。
- 不修改未在本次复测清单中的样式和交互。
