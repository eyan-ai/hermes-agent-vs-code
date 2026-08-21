# 验收标准

- Status: confirmed
- Prerequisites: [01-background-and-goal.md](./01-background-and-goal.md)
- Evidence: 已确认的目标边界；ACP 标准字段语义；当前行为复现
- Confirmed decisions: D-01 至 D-10
- Confirmation date: 2026-08-17
- Blocking open questions: 无

## 功能验收

### AC-01 插件内预览候选

- 插件仅在识别到单文件 V4A `Update File` Permission payload 时进入兼容转换。
- 进入条件必须同时满足：工具为 `patch`、模式为 `patch`、只有一个 Diff block、Patch 只有一个 `Update File` 目标、Patch 目标与 Diff `path` 一致，且 Diff `newText` 确实是同一份原始 Patch，而不是正常候选正文。
- 预览使用 Diff block 的 `oldText` 作为审批时目标文件的完整原始内容，并从 `rawInput.arguments.patch` 取得同一次工具调用的 V4A Patch。
- 插件在内存中成功应用全部 V4A hunks，生成完整候选正文，供原文档 Diff 预览使用。
- 原始 ACP Permission request、Diff block、`rawInput` 和 `path` 不被修改。

### AC-02 用户可见 Diff

- VS Code 只将 Patch 实际删除的行显示为删除内容，只将实际新增的行显示为新增内容。
- 没有变化的标题、上下文段落和结尾不被误标为删除或新增。
- `*** Begin Patch`、`*** Update File`、`@@`、`*** End Patch` 不出现在候选正文或新增 Diff 中。

### AC-03 多 hunk 顺序

- 单文件 Patch 可以包含一个或多个 `@@` hunk。
- 多个 hunk 按 Patch 中的顺序作用于同一份内存候选正文。
- 后续 hunk 必须基于前序 hunk 的内存结果进行匹配，最终形成一份候选正文。

### AC-04 审批前不修改文件

- 生成预览候选期间不写入、删除、移动或重命名目标文件。
- 用户作出允许或拒绝决定前，磁盘上的目标文件内容保持不变。
- 生成候选正文失败时不得通过先执行再回滚的方式获取 Diff。

### AC-05 拒绝审批

- 用户拒绝后不执行原始 V4A Patch。
- 目标文件内容与审批前一致。
- 拒绝结果继续使用现有 ACP Permission 语义，不改变会话、队列或取消行为。

### AC-06 允许审批与源文件一致性

- 用户允许后，插件仍返回现有 ACP Permission allow 结果，不替换 Hermes 的真实 Patch 执行路径。
- 预览候选必须由同一 Permission payload 的 `oldText` 与原始 Patch 生成；若预览期间源文档变化，现有安全清理不得盲目覆盖用户内容。
- 在测试输入未发生外部变化时，Hermes 最终执行结果必须与插件审批时展示的候选正文一致。
- 支持范围内的单 hunk、多 hunk、中文正文和行首/行尾修改必须建立“插件候选正文 = Hermes 实际 Patch 结果”的逐字节一致性测试；不一致即视为不支持并失败关闭。

### AC-07 范围隔离

- `patch mode="replace"` 的审批数据与当前基线一致。
- `write_file` 的审批数据与当前基线一致。
- 普通“原文全文/修改后全文”的 VS Code 自动收缩结果与当前基线一致。
- Hermes Python ACP Server Adapter、Core、Desktop、CLI、Gateway 和其他 ACP 客户端不发生代码或行为修改。
- 非 V4A Permission 不进入本次兼容转换；其原文档 Diff 和审批数据与当前基线一致。

### AC-08 非目标 V4A 操作

- `Add File`、`Delete File`、`Move File` 和多文件 Patch 不进入本次单文件 Update 候选计算。
- 本次修复不为这些操作新增展示、解析或审批语义。

### AC-08A 候选生成失败

- 单文件 V4A Update 无法无歧义地生成候选正文时，不进入误导性的文档 Diff 预览。
- 该次工具执行被阻止，目标文件保持不变。
- 插件通过现有 Permission 拒绝/工具失败语义阻止该次工具执行，使 Agent 可以基于最新文件重新生成 Patch。
- 正常候选生成路径不新增 Agent 消息，也不改变 Thinking、Action、结果或回答格式。

### AC-09 中长段落紧密 Diff

- 已有文件的中长段落修改不再固定显示为“完整旧文段在上、完整新文段在下”。
- 同一连续变化 hunk 内，删除行和新增行按稳定的 Diff 顺序一一交错：旧行 1 后紧接新行 1，旧行 2 后紧接新行 2。
- 删除行多于新增行时，完成可配对行后，剩余删除行继续显示为红色。
- 新增行多于删除行时，完成可配对行后，剩余新增行紧接显示为绿色。
- 纯新增 hunk 只显示绿色行；纯删除 hunk 只显示红色行。
- 相隔的变化拆为独立 hunk；两个 hunk 之间的原文上下文只显示一次。
- 未变化上下文不得因旧块和新块各保留一份而整段重复。
- Diff 仍使用当前删除行红色、新增行绿色和未变化行普通样式。
- “行”以文档中的真实换行边界为准，不把编辑器视觉自动换行当成独立行。

### AC-10 紧密 Diff 安全边界

- 调整排列后，审批前仍不得将候选修改正式写入磁盘。
- Allow、Deny、Stop、关闭确认和扩展释放继续遵循现有安全清理语义。
- 用户在预览期间编辑文档时，不得通过盲目回滚覆盖用户内容。
- 小范围单行或短段落 Diff 的当前结果不得因中长段落优化而退化。

### AC-11 审批交互隔离

- 紧密 Diff 不改变确认区域出现的时机、位置和关闭方式。
- Allow、Deny、预设选项、自由反馈输入、提醒和重新打开预览入口与当前基线一致。
- Permission request 的所有权、Pending 状态、请求队列、允许/拒绝结果和反馈提交语义保持不变。
- 不增加逐行或逐 hunk 接受、拒绝控件。

### AC-12 Agent 回显隔离

- 紧密 Diff 不新增、删除、重排或改写 Agent 会话中的消息。
- Thinking、Action 标题、Action 详情、工具输入、工具结果、状态点、Working 时间线和最终回答与当前基线一致。
- 不把文档内 Diff hunk 作为新的 Agent 回答、系统消息或 Working 记录发布。
- 不改变 Agent 工具调用、审批等待、继续执行、停止、队列和完成时序。

### AC-13 版本与 VSIX 产物

- 扩展 `package.json` 和对应锁文件中的版本更新为 `0.2.52`。
- 生成新的 `hermes-agent-vscode-0.2.52.vsix`，不得覆盖、重命名或删除现有 `0.2.51` 产物。
- VSIX 内 `extension/package.json` 的版本必须为 `0.2.52`。
- VSIX 内插件代码必须同时包含 V4A 预览兼容和紧密 Diff 修改，并与打包时工作区源码一致。
- 包完整性检查必须通过，并报告稳定的绝对产物路径和 SHA-256。
- 本次未授权发布到 Marketplace；生成本地 VSIX 不等于发布完成。

### AC-14 单包交付边界

- 两项修复必须完整包含在 `hermes-agent-vscode-0.2.52.vsix` 中，不依赖修改 `/Users/eyan/.hermes/hermes-agent`。
- 使用保持当前行为的 Hermes `0.18.2` 时，安装该 VSIX 即可获得本 Spec 定义的 V4A 原文档预览兼容和紧密 Diff。
- 不宣称该 VSIX 改变了 Hermes Python ACP Server Adapter、其他 ACP 客户端或 ACP 协议本身。

## 保护条件

- GR-01：不得修改 Hermes Python checkout、Hermes Core 的实际 Patch 算法或 Desktop/Gateway 共用执行路径。
- GR-02：不得把原始 V4A Patch 控制文本伪装成 ACP `newText` 候选正文。
- GR-03：不得因候选计算失败而自动允许编辑。
- GR-04：不得覆盖当前未提交的权限等待、取消、会话隔离和消息持久化修改。
- GR-05：不得改变现有 VS Code Diff 颜色、Review 阈值和确认交互。
- GR-06：紧密 Diff 只调整已有文件的文档内排列，不得影响新文件预览或未打开文件的 Review 流程。
- GR-07：原文档 Editor 之外的 Webview DOM、审批数据模型和 Agent 消息模型不得因紧密 Diff 发生行为变化。
- GR-08：不得为兼容 V4A 预览而复制、内嵌或分叉 Hermes Python 运行时。

## 验证证据

- 自动验证：单文件单 hunk、多 hunk、中文路径与中文正文、上下文不匹配、非 V4A payload 和源文档预览期间变化的插件测试。
- 隔离验证：对同一原始 Permission request 比较转换前后，证明 request、`rawInput`、Permission response 和 Agent 事件保持一致，只有原文档预览输入发生变化。
- 回归验证：现有 VS Code ACP Permission、Diff、审批生命周期、消息路由单元测试与扩展语法检查全部通过。
- 集成验证：使用真实 `hermes acp` 的单文件 V4A Permission payload，确认插件生成真实候选正文，同时保留原始 request。
- UI 验证：使用打包后的 VSIX 复现中文 Markdown 修改，确认只显示实际红绿行且不出现 Patch 控制文本。
- 紧密 Diff 验证：使用包含多处修改和未变化中间段落的中文 Markdown，确认相关删除/新增内容就近、上下文不整段重复且所有退出路径可安全清理。
- 交互隔离验证：在相同审批输入下对比修改前后确认区域的选项、反馈、Pending、Allow/Deny 和重新打开行为，结果必须一致。
- 回显隔离验证：对同一 ACP 事件序列比较修改前后的 Thinking、Action、结果、Working 和最终回答数据，除原文档 Diff 呈现外不得出现差异。
- 打包验证：检查版本元数据、包内源码身份、README 与资源完整性、`unzip -t` 和 SHA-256，并提供 `0.2.52` VSIX 的稳定绝对路径。

## 已确认失败策略

当单文件 V4A Update 无法无歧义地生成候选正文时，不展示误导性的原文档 Diff，保持文件不变，并通过现有 Permission 拒绝/工具失败语义阻止该次工具执行，使 Agent 可以基于最新文件重新生成 Patch。不得退回原文全文对比原始 Patch 指令。
