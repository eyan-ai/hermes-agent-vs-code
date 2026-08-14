# Hermes Agent 0.2.31 Fix Follow-up 复测修复 Spec

- Status: confirmed
- Prerequisites: 无
- Baseline: `v0.2.31-fix-followup` 当前源码与复测反馈
- Decision owner: 用户
- Confirmation date: 2026-08-10

## 范围

本 Spec 仅处理 `v0.2.31-fix-followup` 复测确认的 10 项问题：Skill 选中后的提示文字、顶部标题光标、Editor 区域分离、文档 Diff 完整预览、Read 文件链接、真实停止、最小宽度适配、新问题滚动定位、生成中 Thinking 限高、确认按钮文案与顺序。

不处理其他产品功能、视觉重构、模型或 Mode 语义、会话数据结构升级以及与上述问题无关的缺陷。

## 文档地图

| 顺序 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | [01-background-and-goal.md](./01-background-and-goal.md) | confirmed | 背景、目标、约束与非目标 |
| 2 | [02-acceptance-criteria.md](./02-acceptance-criteria.md) | confirmed | 10 项可观察验收标准与保护条件 |
| 3 | [03-as-is.md](./03-as-is.md) | confirmed | 当前实现证据与问题边界 |
| 4 | [04-to-be.md](./04-to-be.md) | confirmed | 目标行为、状态规则和异常处理 |

## 已确认决策

- D-01：Diff 确认前允许向当前文档临时写入完整预览；`Accept` 前先移除预览再执行正式修改，`Deny` 时回滚预览。
- D-02：Thinking 最大约 10 行、内部滚动、自动聚焦最新行和顶部渐隐，仅适用于正在生成的状态。
- D-03：Thinking 在 `done`、`stopped` 或 `failed` 后，展开时完整铺开，不限制最大行数。
- D-04：窗口目标布局为左侧文档 Editor 区域、右侧 Hermes Agent Editor 区域，两类 Tab 不交叉。
- D-05：Stop 必须结束后端当前轮次；只改变前端状态不算停止成功。

## 证据

- 用户于 2026-08-10 提交 10 项复测问题，并补充确认 D-01、D-02、D-03。
- 当前实现证据见 [03-as-is.md](./03-as-is.md)。

## 阻塞项

无。该 Spec 已具备进入实施计划的产品前提，但本轮不实施代码修改。
