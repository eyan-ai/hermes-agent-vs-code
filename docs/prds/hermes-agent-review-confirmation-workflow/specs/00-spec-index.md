# Hermes Agent 修改审阅与通用确认流程 Spec

- Status: confirmed
- Prerequisites: 无
- Baseline: `EyanLin.hermes-agent-vscode` `0.2.44`，Git revision `113bc56`
- Decision owner: 用户
- Draft date: 2026-08-13

## 范围

本 Spec 汇总 2026-08-11 至 2026-08-13 已确认的修改，统一处理以下五组能力：

1. 新建文件、局部修改和完整候选稿三类插件侧审阅流程。
2. 大范围文本修改在实际 ACP 写入审批点自动进入 `Result / Changes` Review；插件不虚构或接管 Agent 的 Plan 生命周期。
3. 复用现有确认弹窗框架的“预设选项 + 自由输入”通用确认组件。
4. Working 动作标题、文档/网页入口、代码执行详情，以及任务中问答记录。
5. Run Settings 中 Model 的真实可选列表、纵向布局与跨会话继承。

不调整与上述范围无关的会话、队列、Todo、Thinking、附件、输入框、历史搜索、消息展开、自适应宽度或主题风格。

## 文档地图

| 顺序 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | [01-background-and-goal.md](./01-background-and-goal.md) | confirmed | 背景、目标、约束、非目标与修改清单 |
| 2 | [02-acceptance-criteria.md](./02-acceptance-criteria.md) | confirmed | 可观察验收标准和回归保护条件 |
| 3 | [03-as-is.md](./03-as-is.md) | confirmed | `0.2.44` 当前实现与协议边界 |
| 4 | [04-to-be.md](./04-to-be.md) | confirmed | 修改分级、审阅流程、通用确认、Working 与 Model 目标行为 |

## 已确认决策

- D-01：插件只在收到实际 ACP 写入审批请求后构造审阅，不修改 Agent 的 Plan、执行阶段或自动模式语义。
- D-02：新增文件不展示 Diff；在文档 Editor 区打开只读临时文档，完整展示待创建内容。
- D-03：已有文件只要已经打开，无论修改大小，都直接在原文档内临时插入候选内容并展示整行 Diff，自动定位第一处变化；Yes/No 前安全回滚临时内容。
- D-04：只有目标文档未打开且实际变化量超过插件审阅阈值时，才在 Hermes Agent 右侧自动拉起临时 Review Editor；ACP 传递全文本身不构成大修改。
- D-05：Review 默认打开 `Result`，并提供同一审阅工作区内的 `Changes` 单栏 Unified Diff；原文在用户允许前保持不变。
- D-06：审阅分类只决定插件 UI，不宣称识别 Agent 的真实“大修改”意图，也不改变 ACP Permission 的允许/拒绝语义。
- D-07：确认组件复用现有弹窗框架、位置和 UI 规范，只扩展内部内容与交互。
- D-08：预设选项点击后立即提交；自由输入按 `Enter` 立即提交，`Shift+Enter` 换行；不显示“继续”或二次确认按钮。
- D-09：自由输入不是 Allow。对于 Edit、Execute、Review 等待执行操作，必须先取消当前待执行操作，再将文字作为反馈交给 Agent。
- D-10：确认请求无限等待用户主动操作；提醒不得改变 Pending 状态。
- D-11：Working 的 Read/Edit 等本地文档动作只显示文件名，悬停显示完整路径，悬停下划线，点击在文档 Editor 区打开。
- D-12：Working 的网页地址使用普通正文颜色，完整地址作为单一链接，悬停显示连续下划线，点击通过 VS Code 在外部浏览器打开。
- D-13：Agent 在执行过程中提出的问题及用户回答必须作为一组问答保留在 Working 时间线。
- D-14：Diff 只高亮实际变化行；删除行整行红色、增加行整行绿色，不使用删除线。
- D-15：代码执行类 Action 的标题行只显示动作类型和自然语言目的，不直接展示代码；脚本、命令和必要结果放入现有可展开详情区，`IN/OUT` 仅在输入输出语义明确且有助于理解时使用。
- D-16：用户在预览或 Review Pending 时手动关闭临时 Editor，任务继续保持 Pending；现有确认区域提供重新打开审阅的入口，系统不反复强制拉起。
- D-17：确认自由意见先拒绝当前候选稿，再直接续入当前 ACP 轮次；不进入 Queue、不创建 Steer 消息或新的 Assistant continuation，并在当前 Working 中保存问答记录。
- D-18：Run Settings 保留现有 Mode 行为，在其下方新增纵向 Model 区块；`Model` 标题在上，下拉框独占一行，不使用左右布局，不提供 Reset 按钮。
- D-19：Model 选项优先来自 ACP 当前会话返回的真实模型状态；会话建立前使用 Hermes 当前 provider 的本地模型配置作为预备列表。选择应用到当前会话并保存为上次选择，新会话继承；失效模型回退到 Hermes 当前默认模型。

## 已确认原型

- [Working 动作链接样式原型](../../../../../hermes-working-action-link-style-prototype.html)
- [整篇改写结果优先原型](../../../../../hermes-whole-document-rewrite-flow-prototype.html)
- [大修改自动审阅原型](../../../../../hermes-large-rewrite-auto-review-prototype.html)
- [通用确认组件原型](../../../../../hermes-generic-confirmation-custom-input-prototype.html)

原型用于说明交互和信息层级，不授权复制原型中的独立视觉框架。生产实现必须遵循现有 Hermes Webview UI。

## 后续门禁

本 Spec 已获研发授权。实施必须先通过对应测试门禁；未收到单独授权前不调整版本号、不发布 Marketplace。
