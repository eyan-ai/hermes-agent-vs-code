# Hermes Agent VS Code 0.2.53 全功能回归用例

基线：本机已安装 `EyanLin.hermes-agent-vscode 0.2.53`  
可复现源码：Git 标签 `v0.2.53`  
用途：后续功能修改、修复或发版前的人工与自动化回归  
自动化入口：`npm run test:regression`

如需单独核对本机已安装扩展的 manifest 和运行时文件，执行：

```bash
HERMES_EXTENSION_ROOT="$HOME/.vscode/extensions/eyanlin.hermes-agent-vscode-0.2.53" node test/package-contract.test.js
```

## 1. 使用规则

- `P0`：核心链路，冒烟和每次发版必测。
- `P1`：主要功能，功能修改或完整回归必测。
- `P2`：异常、兼容和视觉边界，发版前全量回归执行。
- “自动化”栏列出主要覆盖文件；并不表示可省略对真实 UI 的人工观察。
- 发现基线疑似缺陷时，填写第 16 节，不把错误行为固化成新断言。

## 2. 测试环境与数据

### 2.1 执行环境记录

| 项目 | 记录 |
|---|---|
| 执行日期 |  |
| 执行人 |  |
| macOS/Windows/Linux 版本 |  |
| VS Code 版本 |  |
| Hermes Agent 插件版本 |  |
| Hermes CLI 版本 |  |
| Node.js 路径与版本 |  |
| ACP 开关 |  |
| 模型/提供方 |  |
| 工作区路径 |  |
| 主题/高对比主题 |  |
| 测试提交 SHA |  |

### 2.2 建议测试数据

1. 一个可写工作区，包含 `README.md`、`src/sample.js`、含中文和空格的 `docs/测试 文档.md`。
2. `src/sample.js` 同时准备未保存修改、CRLF 副本和无文件末换行副本。
3. 一个体积小的图片或文本附件、一个文件夹附件、一个后续删除用的失效附件。
4. 可触发 Read、Search、Shell、Edit、新文件、多次编辑和 AskUserQuestion 的测试提示词。
5. 一个 2 分钟以上的 Auto 模式任务，用于后台续跑与恢复。

## 3. 安装与入口

| ID | 优先级 | 场景 | 前置与步骤 | 预期结果 | 自动化 |
|---|---|---|---|---|---|
| ENT-01 | P0 | 激活与侧边栏 | 启动 VS Code，打开 Hermes Activity Bar 图标。 | 插件无报错激活；出现 `Hermes Agent` Webview 且输入区可用。 | `test/package-contract.test.js`、`test/smoke/smoke.test.js` |
| ENT-02 | P0 | 命令面板入口 | 依次执行 `Hermes Agent: Open`、`New Session`、`New Editor Session`、`Focus Input`。 | 四个命令均已注册；分别打开界面、创建会话/编辑器会话或将焦点移到输入框。 | `test/package-contract.test.js`、`test/smoke/smoke.test.js` |
| ENT-03 | P0 | 编辑器会话布局 | 打开一个文档，连续新建两个 Editor Session。 | 文档保留在左侧；Hermes 会话在同一右侧编辑器组；不把普通文档混入 Agent 组。 | `test/smoke/smoke.test.js` |
| ENT-04 | P1 | 输入框快捷键 | 侧边栏激活时按 macOS `Cmd+Esc` 或其他平台 `Ctrl+Esc`。 | 光标进入 Hermes 输入框，不发送消息。 | `test/package-contract.test.js` + 人工焦点验证 |

## 4. 会话管理

| ID | 优先级 | 场景 | 前置与步骤 | 预期结果 | 自动化 |
|---|---|---|---|---|---|
| SES-01 | P0 | 新建独立会话 | 在旧会话有消息时点击 `+` 或执行 `/new`。 | 新会话为空，获得新 ID；旧会话内容可从 History 恢复。 | `test/hermes-sessions.test.js`、`test/extension-contract.test.js` |
| SES-02 | P0 | 历史切换与消息恢复 | 创建两个有不同对话的会话，从 History 反复切换。 | 每个会话的用户、Thinking、Action 和回答均恢复到正确会话，不串流。 | `test/hermes-sessions.test.js`、`test/extension-contract.test.js` |
| SES-03 | P1 | 标题自动生成与手动重命名 | 发送普通文字，观察标题；修改标题后继续对话。 | 首次文字生成有意义标题；手动标题不被后续 ACP 标题覆盖；界面不显示 `Edited`。 | `test/session-title.test.js`、`test/webview-contract.test.js` |
| SES-04 | P1 | 标题编辑焦点 | 进入标题或 History 重命名状态，移动光标，期间等待一次状态刷新。 | 光标可正常定位；状态刷新不关闭或替换当前编辑框。 | `test/webview-contract.test.js` |
| SES-05 | P1 | 删除会话 | 删除非当前会话，再删除当前会话。 | 目标项从 History 消失；非目标会话不受影响；删除当前项后切换到合法会话或新建空会话。 | `test/hermes-sessions.test.js`、`test/extension-contract.test.js` |
| SES-06 | P0 | 会话与 Editor Panel 隔离 | 同时打开侧边栏和多个 Editor Session，分别发送消息。 | 消息、Queue、权限、运行设置和状态始终绑定所属会话。 | `test/extension-contract.test.js` |
| SES-07 | P0 | 工作区恢复 | 在某工作区选中一个会话并打开 Editor Session，执行 `Developer: Reload Window`。 | 重载后恢复该工作区的上次会话和 Panel 绑定，不额外创建会话。 | `test/session-metadata.test.js`、`test/extension-contract.test.js` |
| SES-08 | P1 | 运行中与未查看完成标记 | 让会话 A 运行时切到 B；等 A 完成后打开 History，再打开 A。 | A 运行时显示运行图标；隐藏期间完成后显示未查看标记；只在显式打开 A 后清除。 | `test/session-metadata.test.js`、`test/extension-contract.test.js`、`test/webview-contract.test.js` |
| SES-09 | P1 | History 搜索 | 创建多个不同标题会话，在 History 搜索框输入并继续打字。 | 列表实时过滤；搜索框焦点和输入值不被状态刷新破坏。 | `test/webview-contract.test.js` |

## 5. 输入与上下文

| ID | 优先级 | 场景 | 前置与步骤 | 预期结果 | 自动化 |
|---|---|---|---|---|---|
| CTX-01 | P0 | 发送与多行输入 | 输入普通文字；用 `Shift+Enter` 插入换行；用 `Enter` 发送。 | `Shift+Enter` 不提交；`Enter` 只提交一次；用户气泡保留换行。 | `test/webview-contract.test.js` + 人工键盘验证 |
| CTX-02 | P0 | 当前文件上下文 | 打开 `src/sample.js`，不选中文本，发送请求。 | 编辑器上下文芯片显示正确文件；提示词包含文件上下文，用户可见标题不被文件内容替代。 | `test/hermes-sessions.test.js`、`test/extension-contract.test.js` |
| CTX-03 | P0 | 选区上下文与静音 | 选中一段代码发送；再点击上下文芯片静音后发送相同请求。 | 未静音时传递选区；静音时不传递编辑器文件/选区；静音状态有可见反馈。 | 仅人工：需验证真实 VS Code 选区 |
| CTX-04 | P1 | `@` 工作区搜索 | 输入 `@` 和文件名片段，键盘或鼠标选择结果。 | 只展示工作区匹配文件；选中后形成芯片/附件；发送后路径和内容来源正确。 | `test/webview-contract.test.js` + 人工工作区搜索 |
| CTX-05 | P1 | `+` 本地文件与文件夹 | 通过 `+` 分别选择文件和文件夹，发送。 | 附件横向单行展示；用户气泡保留附件；ACP prompt 使用资源块且附件内容不污染标题。 | `test/hermes-sessions.test.js`、`test/extension-contract.test.js`、`test/webview-contract.test.js` + 人工选择器 |
| CTX-06 | P1 | 粘贴文件/图片 | 向输入框粘贴一个文件或图片，然后发送。 | 粘贴内容成为可删除附件；只提交一次；历史中不展开庞大附件正文。 | `test/hermes-sessions.test.js` + 人工剪贴板 |
| CTX-07 | P1 | 附件打开与移除 | 在发送前移除一个附件；发送后点击留下的附件。 | 被移除附件不进入 prompt；点击可在 VS Code 打开对应资源；文件失效时显示可理解错误。 | `test/generated-document.test.js`、`test/extension-contract.test.js` + 人工文件打开 |

## 6. 命令、技能与 Memory

| ID | 优先级 | 场景 | 前置与步骤 | 预期结果 | 自动化 |
|---|---|---|---|---|---|
| CMD-01 | P1 | 斜杠菜单与过滤 | 输入 `/`，再输入多词命令片段并用键盘选择。 | 命令按 Session、Configuration、Hermes ACP、Tools & Skills、Info 等分组；过滤与 Space 选择正确；选中项显示为单个 token。 | `test/command-catalog.test.js`、`test/webview-contract.test.js` |
| CMD-02 | P0 | Session 本地命令 | 依次验证 `/new`、`/title`、`/sessions`、`/resume`、`/status`。 | 新建、查看/修改标题、列出/恢复会话和查看状态均由本地执行；结果以 notice 显示，不伪装成 assistant 回答。 | `test/command-catalog.test.js`、`test/extension-contract.test.js`、`test/webview-contract.test.js` |
| CMD-03 | P0 | 控制命令 | 在空闲和运行中分别使用 `/queue`、`/steer`、`/stop`。 | Queue 只在活动任务时排队；Steer 定向当前轮；Stop 与暂停按钮使用同一安全停止路径。 | `test/prompt-queue.test.js`、`test/extension-contract.test.js` |
| CMD-04 | P1 | 配置与信息命令 | 依次执行 `/model`、`/save`、`/help`、`/usage`、`/debug`。 | Model 显示/更改当前模型；Save 生成可打开的会话文档；Help/Usage/Debug 输出对应本地信息且不进入普通 prompt。 | `test/extension-contract.test.js`、`test/generated-document.test.js` |
| CMD-05 | P1 | ACP 发现命令 | 在 ACP 可用时打开斜杠菜单，执行 `/tools`、`/context`、`/reset`、`/compact`、`/version`。 | 菜单以 ACP 运行时返回列表为准；命令结果作为 notice；不可用命令不被宣传。 | `test/command-catalog.test.js`、`test/extension-contract.test.js` + 人工真实 ACP |
| CMD-06 | P1 | 别名与 Quick Command | 执行 `/compress`；配置一个指向现有命令的 alias 和一个 exec Quick Command。 | `/compress` 转到 `/compact`；只展示可执行 alias；无目标 alias 和 exec 项不误显示为可执行斜杠命令。 | `test/command-catalog.test.js` |
| CMD-07 | P1 | Skill 选择与提示组合 | 选择默认 Skill，输入提示并附加文件后发送。 | Skill 显示为单个 token；进入组合 prompt；不破坏附件和编辑器上下文。 | `test/command-catalog.test.js`、`test/webview-contract.test.js` |
| MEM-01 | P1 | 打开 Personality 与 Memory | 打开 Memory 菜单，分别选择 Personality 和 Memory 文档。 | 对应本地文档在 VS Code 打开；错误路径不导致 Webview 崩溃。 | 仅人工：需验证真实本地 Hermes 配置文档 |
| MEM-02 | P1 | Memory/Personality 持久化 | 编辑并保存文档，新建会话后要求 Agent 复述测试偏好。 | 新会话使用已保存偏好；旧会话和原文档不丢失。 | 仅人工：依赖真实 Hermes runtime |

## 7. 执行与内容展示

| ID | 优先级 | 场景 | 前置与步骤 | 预期结果 | 自动化 |
|---|---|---|---|---|---|
| RND-01 | P0 | 结构化 ACP 流 | 执行一个包含 Thinking、Read/Search/Shell/Edit 和最终回答的任务。 | Thinking、Working、Action 和 Answer 顺序正确；流式更新不重复；过程文本不与最终回答重复。 | `test/acp-render.test.js`、`test/fixtures/hermes-stream-events.json` |
| RND-02 | P0 | Action 状态与详情 | 分别触发成功、失败、拒绝和取消的 Action，展开详情。 | 终态准确；失败不被后续事件改成成功；代码/输出只在详情显示；Action 点为静态。 | `test/acp-render.test.js`、`test/webview-contract.test.js` |
| RND-03 | P1 | Todo 计划 | 运行能产生 ACP plan/Todo 的任务，切换展开状态。 | Todo 在 Queue 上方；计划更新替换旧状态而不重复 Thinking plan；活动指示正确。 | `test/acp-render.test.js`、`test/webview-contract.test.js` |
| RND-04 | P1 | Markdown、代码块与表格 | 请求返回标题、列表、代码块、行内代码和宽表格。 | Markdown 渲染正确；普通行内代码不被误识别为文档；表格完整展开且不产生嵌套滚动。 | `test/markdown.test.js`、`test/webview-contract.test.js` |
| RND-05 | P1 | 本地文档与外部链接 | 返回带中文/空格的本地路径、普通文件路径和 HTTPS 链接，分别点击。 | 本地文档在 VS Code 内打开；外部链接走安全外部打开路径；普通文字不被误转链接。 | `test/markdown.test.js`、`test/generated-document.test.js`、`test/extension-contract.test.js` |
| RND-06 | P1 | 复制回答 | 对有 Markdown 和多行内容的最终回答点击 Copy，粘贴到文本文档。 | 剪贴板内容与回答源文本一致；不包含 UI 按钮文案或重复内容。 | 仅人工：需验证系统剪贴板 |
| RND-07 | P1 | 流式滚动与返回最新 | 运行长任务；在底部和手动上滚两种状态观察；点击返回最新。 | 底部时跟随新内容；手动上滚后停止抢滚动；按钮恢复到最新内容；提交时只执行一次底部过渡。 | `test/webview-contract.test.js` |
| RND-08 | P2 | 响应式、主题与高对比 | 切换深色/浅色/高对比主题；把侧边栏缩至约 360px，展示长 URL、表格和附件。 | 颜色使用 VS Code 语义变量；高对比有边框；内容不撑宽页面；工具栏可用。 | `test/webview-contract.test.js`、`test/webview-visual-check.js` + 人工视觉 |

## 8. Queue、Steer 与 Stop

| ID | 优先级 | 场景 | 前置与步骤 | 预期结果 | 自动化 |
|---|---|---|---|---|---|
| CTL-01 | P0 | 运行中排队与自动续跑 | 在活动任务中连续发送三条普通后续消息。 | 消息按提交顺序进入 Queue；当前轮完成后一次只取一条；不绕过正在执行的取消 barrier。 | `test/prompt-queue.test.js`、`test/extension-contract.test.js` |
| CTL-02 | P1 | Queue 编辑、删除、折叠与上限 | 排六条消息，编辑中间项，删除另一项，切换折叠。 | 编辑后原位置不变；删除不影响其他项；默认最多显示五行并可折叠；流式更新不重绑操作。 | `test/prompt-queue.test.js`、`test/webview-contract.test.js` |
| CTL-03 | P0 | Steer 当前轮 | 任务执行中对一条 Queue 项点击 Steer，再发送一条定向指令。 | 指令立即发给当前 ACP 轮而不结束它；输出时间顺序正确；工具完成仍更新原分段；不显示伪成功 toast。 | `test/prompt-queue.test.js`、`test/acp-render.test.js`、`test/extension-contract.test.js`、`test/webview-contract.test.js` |
| CTL-04 | P0 | Stop 即时停止 | 在 ACP 初始化、Thinking、Action 和 CLI fallback 输出阶段分别点击 Stop/使用 `/stop`。 | 活动轮进入 stopped；流式输出停止；按钮与命令走同一安全路径；无未处理异常。 | `test/turn-lifecycle.test.js`、`test/session-cancellation-barrier.test.js`、`test/extension-contract.test.js` |
| CTL-05 | P0 | Stop 后隔离迟到事件 | 停止一个正在输出的会话，立即发送新提示并等待旧事件到达。 | 旧 answer/thinking/action/permission 不写入新轮；ACP session 完成 fork/remap 后才取消旧轮；新轮正常完成。 | `test/acp-render.test.js`、`test/acp-session-handoff.test.js`、`test/extension-contract.test.js` |

## 9. 权限、Diff 与文档 Review

| ID | 优先级 | 场景 | 前置与步骤 | 预期结果 | 自动化 |
|---|---|---|---|---|---|
| APR-01 | P0 | Manual 普通操作审批 | 切到 Manual，触发非编辑敏感操作。 | 出现所属会话的确认弹层；显示 ACP 支持的选项；选择后只解决对应 request。 | `test/extension-contract.test.js`、`test/webview-contract.test.js` |
| APR-02 | P1 | 单次与会话允许 | 对同一操作类型分别选择 allow once 和 allow for session，再次触发。 | 单次允许只生效一次；会话允许只对同 ACP session 和操作类型复用；其他会话仍询问。 | `test/extension-contract.test.js` |
| APR-03 | P0 | 拒绝与队列清理 | 一个轮中触发多个权限请求并排队后续提示，选择硬拒绝。 | 当前轮取消；同轮其他权限被清理；该轮 Queue 不被自动续跑；Action 显示失败，不产生伪造 `/deny` 历史。 | `test/acp-render.test.js`、`test/extension-contract.test.js` |
| APR-04 | P1 | AskUserQuestion | 触发真实问题，展开并选择/输入回答。 | 显示为可展开 AskUserQuestion Action，不误当成操作审批；回答绑定原请求。 | `test/extension-contract.test.js`、`test/webview-contract.test.js` |
| APR-05 | P1 | 自定义反馈 | 在编辑或普通确认中输入自定义修改意见并提交。 | 反馈附着原 Action；关闭当前临时 Diff；Agent 继续同一轮，不通过 Queue 重新发送。 | `test/extension-contract.test.js`、`test/webview-contract.test.js` |
| APR-06 | P2 | 权限提醒 | 设置短的 `permissionReminderMinutes`，保持权限未回答至少一个周期；再设为 0。 | 按配置间隔提醒；提醒不会自动允许/拒绝；0 禁用提醒。 | `test/extension-contract.test.js`、`test/webview-contract.test.js` + 人工时间验证 |
| APR-07 | P0 | 小范围 Diff 预览与接受 | 在 Manual 模式请求小范围修改已打开文件，查看预览后接受。 | 只读临时 Diff 不修改源文件；红/绿只标注真实变更；接受前校验源状态；成功后关闭自己的临时页并恢复 Agent。 | `test/diff-preview.test.js`、`test/document-review.test.js`、`test/extension-contract.test.js` |
| APR-08 | P0 | Diff 拒绝、放弃与重开 | 打开 Diff，分别测试 reject、保留请求的 abandon/cancel，以及重开 preview。 | Reject 不写入文件；Abandon 关闭预览但保留待处理审批；可从弹层重开同一预览。 | `test/extension-contract.test.js`、`test/webview-contract.test.js` |
| APR-09 | P0 | 源文件冲突保护 | 审批期间修改源文件，然后接受 Diff；另测试只保存未改内容。 | 内容变化时不覆盖用户修改，改为一次非硬拒绝反馈；仅保存且内容一致不被误判冲突。 | `test/diff-preview.test.js`、`test/extension-contract.test.js` |
| APR-10 | P1 | 大范围全文档 Review | 请求大幅重写文档，再请求全文本但只小范围变更。 | 真正大修改使用全文 Review；小实际变更仍使用局部 Diff；不以 payload 长度误判。 | `test/document-review.test.js` |
| APR-11 | P1 | 新文件审查 | 请求创建新文件，查看全内容并接受。 | 审批前目标不存在；预览展示完整内容且不显示伪 Diff；批准后才创建并打开真实文件。 | `test/document-review.test.js`、`test/extension-contract.test.js` |
| APR-12 | P1 | 多次编辑聚合与 V4A | 同一权限请求对一文档执行多次编辑，再用单文件多 hunk V4A update 测试。 | 同文档编辑原子聚合；V4A 仅投影支持范围；歧义、缺失 hunk 或路径不匹配时安全失败。 | `test/document-review.test.js`、`test/v4a-preview.test.js`、`test/extension-contract.test.js` |
| APR-13 | P2 | Diff 换行与边界 | 对 CRLF、无末尾换行、纯新增、纯删除、空行和分隔 hunk 执行预览。 | 字节与行范围对齐；不添加占位行；未变上下文不被标红/绿；源换行风格保留。 | `test/diff-preview.test.js`、`test/v4a-preview.test.js` |

## 10. 模型与运行设置

| ID | 优先级 | 场景 | 前置与步骤 | 预期结果 | 自动化 |
|---|---|---|---|---|---|
| SET-01 | P0 | Manual/Auto Mode | 在新会话切换 Manual/Auto，分别触发敏感操作。 | 模式摘要与实际一致；Manual 请求确认；Auto 按 runtime 策略执行；切换不改动模型。 | `test/extension-contract.test.js`、`test/webview-contract.test.js` |
| SET-02 | P0 | Model 搜索与选择 | 打开 Run Settings，按显示名、完整 ID 和 provider 搜索，用键盘/鼠标选择。 | 显示名去除冗余 provider 前缀；搜索不改写列表；跳过不可用项；只在确认选择后发送一次设置变更。 | `test/model-picker.test.js`、`test/model-settings.test.js`、`test/webview-contract.test.js` |
| SET-03 | P1 | Model 弹层定位与取消 | 在宽/窄窗口打开长短不同的模型列表，输入筛选后按 Escape 或点击外部。 | 列表始终在触发器上方、不越出 viewport；过滤后锨点稳定；取消不改变模型。 | `test/model-picker.test.js`、`test/webview-contract.test.js` |
| SET-04 | P1 | 刷新与不可用模型 | 打开临时列表后点击 Refresh；模拟当前模型暂时不在返回列表，再恢复。 | Refresh 先关闭临时列表；暂时不可用的当前模型保留显示且不自动切换；恢复后重新可选。 | `test/model-settings.test.js`、`test/webview-contract.test.js` |
| SET-05 | P0 | 按模型保留 Effort | 在模型 A 选 High，在模型 B 选 Low，反复切换，然后重建 ACP agent。 | 每个完整模型 ID 恢复自己的 Effort；标签/wire value 正确；Hermes config 更新不破坏其他模型的值。 | `test/model-settings.test.js`、`test/reasoning-config.test.js`、`test/extension-contract.test.js` |
| SET-06 | P1 | 新会话继承上次设置 | 选择非默认 Model/Effort/Mode，新建会话并重载窗口。 | 新会话继承扩展范围内上次选择；保留完整 runtime 模型列表；不受单个损坏刷新列表影响。 | `test/model-settings.test.js`、`test/extension-contract.test.js` |

## 11. 传输与后台连续性

| ID | 优先级 | 场景 | 前置与步骤 | 预期结果 | 自动化 |
|---|---|---|---|---|---|
| TRN-01 | P0 | ACP 标准传输 | 启用 `hermesAgent.useAcp`，发送包含文字和附件的提示。 | 使用 `hermes acp`；文字与 resource block 分离；结构化事件、权限、模型和会话映射可用。 | `test/acp-client.test.js`、`test/hermes-sessions.test.js`、`test/extension-contract.test.js` |
| TRN-02 | P1 | CLI fallback | 关闭 ACP，确保 `command` 和 `commandArgs` 有效，执行一个任务。 | 运行配置的 CLI；`{{prompt}}` 替换一次；verbose 输出解析成 thinking/tool/answer；普通 oneshot 仍可回退显示。 | `lib/chat-parser.js` 由 `test/smoke/smoke.test.js` 覆盖 + 人工 CLI |
| TRN-03 | P1 | 空 command 本地预览 | 将 `hermesAgent.command` 设为空，发送普通提示。 | 不启动 Hermes；以本地模拟流式响应展示；可 Stop；无外部进程错误。 | 仅人工：验证实际 Webview 预览 |
| TRN-04 | P0 | 独立 Node 发现 | 分别使用自动检测和显式 `hermesAgent.nodePath`，再测试无效路径。 | 使用独立 Node 而不是 VS Code Electron；有效路径可启动背景 host；无效路径提供明确错误且不假装后台续跑。 | `test/node-runtime.test.js`、`test/extension-contract.test.js` |
| TRN-05 | P0 | VS Code 退出后 Auto 任务续跑 | 在 Auto 模式启动 2 分钟任务，完全退出 VS Code，等待任务继续。 | 独立 host 保持运行；扩展 deactivate 只断开连接而不终止任务；不丢失可恢复运行元数据。 | `test/background-client.test.js`、`test/background-host.test.js`、`test/extension-contract.test.js` + 真实生命周期 |
| TRN-06 | P0 | 重开后恢复后台任务 | 在 TRN-05 任务运行中或完成后重开同工作区。 | 激活时即恢复，不等待打开侧边栏；Thinking/Action/Answer 和 Queue 结构正确；隐藏期间完成项保持未查看标记。 | `test/background-protocol.test.js`、`test/background-client.test.js`、`test/background-host.test.js`、`test/extension-contract.test.js` + 真实重开 |
| TRN-07 | P1 | 后台协议与并发恢复 | 同时触发激活恢复和 Webview 刷新，两个 client 窗口连接同一 host。 | 恢复和刷新共享一个合法 client；帧协议、错误、订阅与快照有效；不创建冲突运行所有者。 | `test/background-protocol.test.js`、`test/background-client.test.js`、`test/background-host.test.js` |
| TRN-08 | P2 | 操作系统边界 | 在 macOS、Windows、Linux 分别执行退出/重开；再测试锁屏、注销、关机。 | 普通 VS Code 退出符合后台续跑定义；关机、注销或 Node 进程终止被明确视为停止边界，不宣称跨该边界持续。 | 仅人工：跨操作系统生命周期 |

## 12. 容错与安全边界

| ID | 优先级 | 场景 | 前置与步骤 | 预期结果 | 自动化 |
|---|---|---|---|---|---|
| ERR-01 | P1 | Hermes/ACP 不可用 | 配置不存在的 Hermes command；另在 ACP extra 不可用时启用 ACP。 | 任务终止并显示可操作错误；不永久停在 running；其他会话可用。 | `test/acp-client.test.js`、`test/turn-lifecycle.test.js` + 人工进程失败 |
| ERR-02 | P1 | 异常退出与空回答 | 模拟 ACP/CLI 中途失败、取消、无 final answer 和 silence marker。 | 失败/取消不把过程文本提升成回答；成功但空回答时只请求一次补全；silence marker 不当作用户可见答案。 | `test/acp-render.test.js`、`test/turn-lifecycle.test.js` |
| ERR-03 | P1 | 过期/重复权限事件 | 让轮先进入 terminal，再发送迟到权限；对同 request 重复回答。 | 过期 UI 被清理，不发迟到响应；同一请求只解决一次；不波及其他会话。 | `test/extension-contract.test.js` |
| ERR-04 | P1 | 无工作区 | 用空 VS Code 窗口打开 Hermes，新建会话、发送文字、尝试 `@` 搜索和打开 Memory。 | 基本对话可用；依赖工作区的操作明确提示无工作区；不抛未捕获异常。 | 仅人工：真实 VS Code 空窗口 |
| ERR-05 | P2 | 附件与文档在使用前失效 | 添加附件或生成文档链接后，从磁盘删除/移动目标，再发送或打开。 | 不打开错误文件；按绝对、工作区相对和 cwd 候选安全解析；无候选时显示错误而不崩溃。 | `test/generated-document.test.js` + 人工失效文件 |
| ERR-06 | P2 | 多窗口与同工作区 | 用两个 VS Code 窗口打开同一工作区，分别打开会话并观察后台任务。 | 不重复抢占运行权；快照和未查看状态收敛；一个窗口关闭不误杀独立 host。 | `test/background-client.test.js`、`test/background-host.test.js` + 人工多窗口 |

## 13. 自动化覆盖索引

| 测试文件 | 主要回归范围 |
|---|---|
| `test/package-contract.test.js` | 激活事件、公开命令、菜单、快捷键、配置默认值、运行时必需文件 |
| `test/smoke/smoke.test.js` | Extension Host 激活、命令注册、侧边栏、编辑器路由、会话写入、CLI parser |
| `test/acp-client.test.js` | ACP 请求/通知、进程与错误路径 |
| `test/acp-render.test.js` | Thinking/Working/Action/Answer/Todo 归一化、分流与终态 |
| `test/acp-session-handoff.test.js` | Stop 后 ACP session fork、替换和隔离 |
| `test/background-protocol.test.js` | 背景 host 帧、命令、事件、错误契约 |
| `test/background-client.test.js` | client 连接、恢复、订阅、并发与独立 endpoint |
| `test/background-host.test.js` | 持久 run、snapshot、permission、断开与空闲生命周期 |
| `test/node-runtime.test.js` | 独立 Node 发现、路径校验与启动参数 |
| `test/command-catalog.test.js` | 本地/ACP/alias/Quick Command/Skill 目录 |
| `test/diff-preview.test.js` | Diff 计算、行范围、换行、冲突快照与虚拟文档 |
| `test/document-review.test.js` | 小修改、大重写、新文件和多编辑聚合 |
| `test/v4a-preview.test.js` | V4A 单文件多 hunk 投影与安全失败 |
| `test/extension-contract.test.js` | Extension 路由、会话、Stop/Queue/Steer、权限、Diff、恢复、后台、设置 |
| `test/webview-contract.test.js` | Composer、菜单、Queue、渲染、滚动、主题、History、Run Settings |
| `test/model-picker.test.js` | 模型搜索、焦点、弹层定位与 viewport |
| `test/model-settings.test.js` | 模型列表、不可用状态、新会话继承、每模型 Effort |
| `test/reasoning-config.test.js` | Hermes 每模型 reasoning effort 配置 |
| `test/prompt-queue.test.js` | Queue 次序、编辑、清空、快照和 Steer 条件 |
| `test/hermes-sessions.test.js` | Hermes 会话列表/快照合并、附件、并发保护 |
| `test/session-title.test.js` | 自动/手动标题和旧数据迁移 |
| `test/session-metadata.test.js` | 工作区恢复、运行与未查看派生状态 |
| `test/session-cancellation-barrier.test.js` | 取消 barrier 和后续提示序列 |
| `test/turn-lifecycle.test.js` | 轮终态、取消错误和迟到事件 |
| `test/markdown.test.js` | 本地文档链接、外部链接与误识别保护 |
| `test/generated-document.test.js` | 生成文档的绝对/相对/home 路径解析 |

## 14. 建议执行集

### 14.1 冒烟回归（每次修改）

1. 执行 `npm run lint` 和受影响测试文件。
2. 人工执行 `ENT-01`、`ENT-02`、`SES-01`、`CTX-01`、`RND-01`、`CTL-04`、`APR-07`、`SET-01`、`TRN-01`。

### 14.2 核心回归（功能合并前）

1. 执行 `npm run test:unit`。
2. 执行所有 P0 和受影响模块的 P1 人工用例。
3. 如修改后台、会话或运行时，额外执行 `TRN-05`、`TRN-06`、`ERR-06`。

### 14.3 全量回归（发版前）

1. 执行 `npm run test:regression`。
2. 执行本文档全部人工用例。
3. 至少在一个主要发布平台执行完整退出/重开生命周期；其他平台的未执行项必须在发布记录中明示。

## 15. 执行结果记录

状态使用 `PASS`、`FAIL`、`BLOCKED`、`NOT RUN`。一条用例若在多平台执行，每个平台单独增加一行。

| 用例 ID | 平台/环境 | 状态 | 实际结果 | 证据路径/链接 | 问题 ID/备注 |
|---|---|---|---|---|---|
|  |  | NOT RUN |  |  |  |

### 15.1 自动化结果

| 命令 | 开始/结束时间 | 状态 | 通过/失败数 | 日志或证据 |
|---|---|---|---|---|
| `npm run lint` |  | NOT RUN |  |  |
| `npm run test:unit` |  | NOT RUN |  |  |
| `node test/smoke/run-smoke.js` |  | NOT RUN |  |  |
| `npm run test:regression` |  | NOT RUN |  |  |

### 15.2 套件编写时验证（2026-10-15）

| 项目 | 结果 |
|---|---|
| 新增 manifest/入口契约 | PASS，4/4 |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS，308 条自动化断言 |
| Extension Host smoke | FAIL，12/13；详见 `REG-001` |
| `npm run test:regression` | FAIL；lint 和 308 条 unit/Webview 断言通过，smoke 在 `REG-001` 停止 |
| 真实模型、完整退出/重开、多平台人工用例 | NOT RUN，保留给发版回归执行 |

## 16. 已知问题与阻断项

编写本套件时未把任何疑似缺陷固化为自动化通过条件。执行时按下表记录。

| 问题 ID | 类型 | 环境 | 关联用例 | 复现步骤 | 期望 | 实际 | 证据 | 处理结论 |
|---|---|---|---|---|---|---|---|---|
| REG-001 | 当前工作区回归 | macOS，VS Code Extension Host | ENT-01 | 在当前工作区执行 `node test/smoke/run-smoke.js` | 扩展成功激活 | 激活失败：`vscode.window.onDidChangeActiveCustomEditor is not a function`；其余 12 项 smoke 通过 | smoke 命令输出；当前 `extension.js:199` | 该 API 调用来自当前未提交修改；已安装 `0.2.53` 与 `v0.2.53` 无此调用。按任务边界只记录，不修改业务代码。 |
|  | 已知缺陷/待产品确认/环境阻断 |  |  |  |  |  |  |  |

## 17. 放行结论

| 项目 | 结果 |
|---|---|
| P0 通过率 |  |
| P1 通过率 |  |
| P2 通过率 |  |
| 自动化回归 |  |
| 未解决缺陷 |  |
| 环境阻断 |  |
| 未执行平台/用例 |  |
| 结论 | 可发布/有条件发布/不可发布 |
| 审批人/日期 |  |

