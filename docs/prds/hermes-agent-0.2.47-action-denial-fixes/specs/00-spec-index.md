# Hermes Agent 0.2.47 Action 与拒绝后会话修复 Spec

状态：HTML 原型已确认，运行代码已实施
日期：2026-08-14  
目标基线：Hermes Agent VS Code extension `0.2.47-fix`  
范围：只处理 Action 状态点、文档目标展示、拒绝后的 ACP 会话释放；不重做现有 UI 和交互。

评审原型：[hermes-agent-0.2.47-three-fixes-prototype.html](../../../../../hermes-agent-0.2.47-three-fixes-prototype.html)

## 1. 完成标准

本次只有同时满足以下三项才算完成：

1. Action 执行中的状态点保持静态，不再跳动；成功仍为绿色，失败仍为红色。
2. `Read`、`Edit`、`Write`、`Create`、`Delete` 的文档目标只展示完整文件名，不展示父目录；文件名仍可点击并在 VS Code 文档编辑区打开。
3. 用户在写入确认中选择 `No` 后，旧任务真正终止并与后续输入隔离；下一条消息立即启动新 turn，不进入插件队列，也不会收到 Hermes ACP 的 `Queued for the next turn`。

## 2. 已验证根因

### 2.1 Action 跳动点是 0.2.45-fix 引入的 CSS 回归

`0.2.45-fix` 新增了 `.timeline-dot.running` 的 `actionDotPulse` 无限动画，并把未结束 Action 的 `dotClass` 固定为 `running`。因此紫色点持续缩放、变透明，看起来一直在跳动。

这不是 ACP 状态错误；是 Action 状态点的视觉规则错误。

### 2.2 Read 路径是 0.2.45-fix 引入的显示判断回归

`0.2.44` 对 Read 使用 `basenameOnly`，因此标题只显示文件名。

`0.2.45-fix` 改为 `renderActionDescription()` 后，只把以下前缀识别成文件路径：

- `file://`
- `~`
- `/`
- `./` 或 `../`
- Windows 盘符绝对路径

ACP 实际可能返回工作区相对路径，例如：

```text
3 Agent测评/Agent测评指引_备份 copy.md
```

该路径没有命中上述前缀判断，于是退回普通文本/链接渲染并展示父目录。

### 2.3 拒绝后排队发生在 Hermes ACP 后端，不是前端队列

现场持久化记录显示：

```text
20:47:32 旧 assistant turn -> stopped
20:47:45 新用户消息 -> 已创建新 assistant turn
20:47:45 Hermes 返回 -> Queued for the next turn. (1 queued)
20:48:20 Hermes 返回 -> Queued for the next turn. (2 queued)
```

该英文提示只存在于本机 Hermes 的 `acp_adapter/server.py`。当同一个 ACP session 的 `state.is_running` 仍为 `true` 时，Hermes 会把新的 `session/prompt` 加入后端 `queued_prompts` 并返回这段文字。

`0.2.47-fix` 的取消屏障只证明插件侧旧 Promise/turn 已释放，甚至允许超时后从旧 turn 脱钩；它没有证明 Hermes session 已经 idle。插件随后复用同一个 `acpSessionId`，所以新消息仍被后端排队。

## 3. 方案比较

### 方案 A：继续延长等待时间

拒绝后继续等待旧 ACP session 自行变为 idle。

不采用。等待时长无法证明真正结束；一旦 Hermes 的运行标记或执行线程未释放，延长超时只会把永久排队变成长时间卡住。

### 方案 B：拒绝后直接复用旧 ACP session

保留 `0.2.47-fix` 的本地 barrier，并在插件侧把消息状态清理得更彻底。

不采用。现场证明新 prompt 已经真实发到 Hermes；此时插件 UI 是否 idle 已经不重要，旧 ACP session 的 `state.is_running` 才是排队依据。

### 方案 C：硬拒绝时轮换 ACP session

在旧 Agent 仍阻塞于权限确认、历史处于稳定点时，先调用 ACP `session/fork` 创建一个继承历史但处于 idle 的 replacement session；随后拒绝并取消旧 session。后续 prompt 只使用 replacement session。

采用此方案。它保留 ACP、保留会话上下文，同时不依赖旧 session 的取消时序。

## 4. To-Be 行为

### 4.1 Action 状态点

Action 左侧状态点保留，颜色语义不变：

- 运行中：主题 Accent 色静态点；
- 成功：绿色静态点；
- 失败、拒绝、错误：红色静态点。

Action 状态点不得使用 `animation`、周期性透明度变化或周期性缩放。

以下既有动画不在本次范围内，必须保持：

- assistant 顶部 `Working for ...` 的工作中动效；
- 回答末尾 `Working...` 的前导点和三个尾随点动效；
- Todo 等其他非 Action 组件的既有动效。

### 4.2 文件与网页目标

文档 Action：

- `Read`、`Edit`、`Write`、`Create`、`Delete` 一律按 Action 类型识别文档目标，不依赖路径是否为绝对路径。
- 标题只显示 `path.basename(fullPath)`，包含完整扩展名。
- 显示文件名是一个完整 anchor，不得拆成多段链接。
- anchor 内继续保存完整原始 `path` 或 `file:// URI`；title/tooltip 继续显示完整路径。
- 点击继续复用现有 `openDocument` / `openAttachment` 消息处理器，在 VS Code 文档 Editor 区打开。
- 不改变当前文档列隔离、预览模式和已支持文档类型。

网页目标：

- `https://` 和 `http://` URL 继续完整显示，不取 basename。
- 完整 URL 是一个 anchor。
- 点击继续复用现有外部链接消息和 `vscode.env.openExternal` 路径，在系统外部浏览器打开。
- 不把网页 URL 当成本地文件处理。

### 4.3 `No` 的业务语义

用户对 Edit/Write/Create/Delete 等具体操作选择 `No`：

- 当前操作失败，Action 变红；
- 当前 assistant turn 进入 `stopped`，显示现有 `Interrupted`；
- 不显示 `/deny`、`Deny` 或额外系统命令消息；
- 清除属于被拒绝 turn 的插件队列项和待审批项；
- 旧 ACP session 不再接收任何新 prompt；
- composer 恢复普通发送状态。

自定义反馈仍按现有语义处理：只拒绝当前提案并允许 Agent 根据反馈继续，不触发 session 轮换。

## 5. 硬拒绝状态机

### 5.1 正常路径

```text
permission pending
  -> open per-session denial barrier
  -> capture old turn + old acpSessionId
  -> while permission is still unresolved, request session/fork(old)
  -> receive replacement acpSessionId (idle, inherited history)
  -> atomically remap UI session to replacement acpSessionId
  -> mark old renderer/turn as cancelled and reject late events
  -> respond permission outcome=cancelled
  -> send session/cancel(old)
  -> record Edit failed + assistant stopped
  -> clear old prompt/permission queue
  -> release denial barrier
  -> next prompt starts on replacement session
```

必须先 fork、再返回权限结果。权限等待点保证旧 Agent 此时没有继续写 history，降低复制运行中 history 的竞态。

### 5.2 隔离规则

- `activeTurns` 中旧 turn 的任何 late update 都不得命中新 replacement renderer。
- `acpRenderers`、可用命令缓存、权限授权缓存必须按 old/new ACP session ID 分开。
- UI session 的 `session.acpSessionId` 和 `acpSessions` 映射必须同时更新，避免重载后重新连接旧 session。
- denial barrier 释放前，`sendPrompt` 只能等待，不能插入可见 PromptQueue。
- barrier 释放后，第一条新消息必须重新读取 replacement 映射并发送一次。

### 5.3 fork 失败的处理

不能回退为“继续复用旧 session”。

按顺序处理：

1. 阻止新 prompt 发送到旧 ACP session；
2. 对当前 ACP transport 做有界终止；
3. 启动新 transport 后通过 `session/resume` 恢复已持久化的旧 ACP session；恢复出的内存状态必须是 idle；
4. 如果 transport 终止或 resume 失败，保持会话 blocked 并显示明确错误，不得伪装 idle 后把消息送入未知状态。

全局 transport 重启可能影响其他并行 session，因此只作为 `session/fork` 不可用时的兜底。

## 6. 运行态判定修正

路由锁必须以真实执行对象为准：

- ACP：存在未取消且未释放的 `activeTurns.get(sessionId)`；
- CLI：存在 `cliTurns.has(sessionId)`；
- hard denial：存在该 session 的 cancellation/denial barrier。

历史 message 的 `status: running` 只用于显示和启动时恢复清理，不得作为永久并发锁。否则一次未正确终结的展示状态会让后续消息永远进入插件队列。

加载历史时，若没有对应的真实 active turn，遗留 `assistant.status === "running"` 必须归一化为 `stopped`。

## 7. HTML 原型交互

原型包含以下评审动作：

1. 初始状态显示已完成 Read 与待确认 Edit。
2. Read 只显示 `Agent测评指引_备份 copy.md`；点击弹出“将通过 VS Code 打开”的原型提示。
3. 示例网页 URL 完整显示；点击弹出“将通过外部浏览器打开”的原型提示。
4. 所有 Action 状态点保持静态。
5. 点击 `No` 后 Edit 变红、turn 显示 `Interrupted`、composer 立即可用。
6. 输入新消息并发送后，直接出现新的 assistant turn；页面不出现 Queue 面板，也不出现 `Queued for the next turn`。
7. 原型说明区展示 old ACP session 已取消、replacement ACP session 已接管，说明该变化不是仅改 UI。

## 8. 验收测试

### 8.1 Action 展示

- 在至少 2 个 CSS 动画周期内观察 running Action，圆点的 `animation-name` 必须为 `none`，位置、尺寸和透明度不变化。
- completed Action 为绿点；failed Action 为红点。
- Working 状态和尾随三个点仍持续动画。

### 8.2 文件名与链接

以下输入均只显示 `Agent测评指引_备份 copy.md`：

```text
/Users/eyan/Desktop/My Project/Marketing Agent/3 Agent测评/Agent测评指引_备份 copy.md
file:///Users/eyan/Desktop/My%20Project/Marketing%20Agent/3%20Agent测评/Agent测评指引_备份%20copy.md
3 Agent测评/Agent测评指引_备份 copy.md
./3 Agent测评/Agent测评指引_备份 copy.md
```

- 点击每一种显示结果都携带完整原始目标并命中既有文档打开处理器。
- `https://example.com/docs/guide.html` 必须完整显示并命中外部浏览器处理器。

### 8.3 拒绝与新消息

行为测试必须使用 fake ACP server 复现后端旧 session 继续保持 `is_running=true`：

```text
old session: Edit permission pending
user: No
extension: forks replacement before resolving permission
old session: remains busy after cancel
user: sends next prompt
assert prompt targets replacement session id
assert replacement receives exactly one session/prompt
assert old receives zero new prompts
assert plugin PromptQueue is empty
assert UI has no Queued for the next turn text
```

还需覆盖：

- fork 失败后不会复用旧 session；
- late old-session updates 不改变 replacement turn；
- 插件重载后使用已保存的 replacement ACP session ID；
- rejected Edit 为红色，早先 completed Read 仍为绿色；
- `No` 不创建 `/deny`/`Deny` 系统消息。

## 9. 非目标与受保护行为

本次不得改动：

- conversation、composer、Diff、Todo、Queue、命令、Skill 的现有布局；
- 已完成的 keyed DOM 流式更新方案；
- Read/Edit/Write 文件链接的点击打开能力；
- URL 的外部浏览器打开能力；
- Answer 正文中的文档链接解析；
- Action 排序、展开详情、成功/失败颜色含义；
- `Working for ...` 与回答末尾 `Working...` 的既有动画；
- 自定义审批反馈继续当前 Agent turn 的能力。

## 10. 交付要求

用户确认本 Spec 和 HTML 后才允许修改 `0.2.47-fix` 运行代码。

正式实施完成后必须提供：

- 新版本 VSIX 的完整绝对路径；
- 文件大小与 SHA-256；
- VSIX 内 manifest 版本；
- 运行源码与 VSIX 内关键文件 hash 对比；
- focused 行为测试、完整测试和语法检查结果；
- 唯一测试版本及 VS Code 实际激活路径，避免多个安装目录混测。
