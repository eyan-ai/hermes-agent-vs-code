# Hermes Agent Stop 会话隔离与 Action 边界设计

日期：2026-08-14  
目标基线：Hermes Agent VS Code extension `0.2.48-fix`  
状态：用户已确认，运行代码已实施并完成自动化回归

## 1. 目标

本次只修复两个回归：

1. `/stop` 和输入框右下角暂停按钮必须真正停止当前 ACP turn；停止后发送的下一条消息不得进入 Hermes 后端队列。
2. 一个 Action 后出现新的 Thinking 时，前一个 Action 必须立即完成并显示成功状态。

完成后仍保留同一个 UI session、同一个会话 section 和停止前的完整对话上下文。

## 2. 已验证根因

### 2.1 Stop 只终结了插件状态，没有隔离后端 session

`0.2.45-fix` 把发送逻辑从“停止期间按 active 状态处理”改为“等待 `_stoppingPromise` 后立即发送”。

`_stoppingPromise` 的完成条件来自插件侧 `TurnLifecycle`：当旧 `session/prompt` 请求返回时，插件就认为停止完成。但 Hermes ACP 的 `prompt()` 在同一个 session 的 `state.is_running` 仍为 `true` 时，会把新 prompt 加入 `queued_prompts`，并返回：

```text
Queued for the next turn. (N queued)
```

因此旧请求返回不等于旧 ACP session 已经 idle。当前 `/stop` 和暂停按钮都会继续复用旧 `acpSessionId`，从而把下一条消息送到仍 busy 的 session。

现场持久化状态已复现以下序列：

```text
assistant -> stopped / UI -> Interrupted
system -> /stop 已停止当前任务
next user prompt -> same acpSessionId
assistant -> Queued for the next turn
```

### 2.2 No 已隔离，普通 Stop 没有隔离

`0.2.48-fix` 只在权限确认的 hard denial 中执行 `session/fork`。普通 `/stop` 和按钮 Stop 仍调用旧 `acpStop()`，所以两个入口没有获得相同的后端隔离保证。

### 2.3 Thinking 没有结束前一个 Action

ACP renderer 目前只在 `action.started` 时调用 `finishActions("completed")`。`thinking.delta` 只创建或更新 Thinking，没有结束 `openActionIds`，所以 Action 后已经出现新的 Thinking，Action 仍保持 `running`。

## 3. 采用方案

采用“每个 UI session 独立轮换 ACP session”的方案：

- 主路径：Stop 时先 `session/fork(old)`，再取消旧 session；
- 兜底：fork 失败时，有界终止共享 ACP transport，并在新 transport 上 `session/resume(old)`；
- 禁止：Stop 后继续复用未隔离的旧 ACP session；
- 禁止：只修改 UI 状态或依赖固定等待时长。

不采用轮询 `state.is_running`。ACP 协议没有为当前插件提供可靠的 session idle 查询，延长等待也无法证明旧 session 已释放。

## 4. Stop 状态机

`/stop` 和暂停按钮必须调用同一个核心方法，按以下顺序执行：

```text
user stop
  -> open per-session cancellation barrier
  -> capture old turn, client, old acpSessionId
  -> request session/fork(old)
  -> validate replacement id is non-empty and different from old
  -> atomically remap UI session to replacement id
  -> persist session.acpSessionId = replacement id
  -> retire old acpSessionId and reject all late updates/permissions
  -> mark old lifecycle cancelled
  -> finalize old renderer as stopped
  -> send session/cancel(old)
  -> clear only the stopped turn's plugin queue and pending permissions
  -> wait for or safely detach the captured old turn
  -> release cancellation barrier
  -> report Stop success
```

### 4.1 上下文语义

Hermes ACP 只在 Agent turn 返回后把 `result.messages` 写回 `state.history`。Stop 发生时 fork 复制停止前的稳定历史，因此：

- 停止前已经完成的对话上下文保留；
- 被停止 turn 的未完成 assistant 输出不进入 replacement session 的有效上下文；
- VS Code 里被停止的 user/assistant 消息仍保留，用 `Interrupted` 表示这次尝试已中断；
- 下一条消息在同一个 UI section 中继续，但目标是 replacement ACP session。

### 4.2 入口一致性

- 右下角暂停按钮发送 `{ type: "stop" }`，调用统一 Stop 隔离方法；
- `/stop` 先调用同一方法，只有方法成功后才追加“已停止当前任务”提示；
- Stop 失败不得显示成功提示；
- 重复 Stop 共享同一个 per-session 操作，不得重复 fork 或重复取消。

### 4.3 队列处理

- Stop 开始后，新提交通过 cancellation barrier 等待，不能进入可见 PromptQueue；
- Stop 成功后，第一条新消息重新读取 `acpSessions.get(uiSessionId)`，只发送给 replacement session；
- 被停止 turn 已存在的插件队列项清除，不自动 drain 到旧 session；
- old session 收到的新 prompt 数必须为零。

## 5. fork 失败兜底

fork 失败时不能释放 barrier 后继续复用 old session。按以下顺序处理：

1. retire old session，并拒绝 late events；
2. 发送 `session/cancel(old)`；
3. 有界终止当前 ACP transport；
4. 启动新 transport；
5. 用 `session/resume(old)` 恢复持久化历史；
6. resume 成功后重新绑定 UI session，并释放 barrier；
7. terminate 或 resume 失败时保持该 UI session blocked，显示明确错误和 reload 建议。

共享 transport 重启会影响其他并行会话，所以只用于 fork 不可用的异常路径。

## 6. Action 状态边界

renderer 收到 `thinking.delta` 时，顺序改为：

```text
flush pending text
finishActions("completed")
append/update Thinking
publish Thinking state
```

规则如下：

- 只终结 `openActionIds` 中仍未完成的 Action；
- 已明确 failed、denied、cancelled 的 Action 不得变绿；
- 后续 Thinking 表示控制流已离开前一个 Action，因此前一个 Action 推断为 completed；
- 既有的 `action.started` 边界继续保留；
- Action 点仍保持静态：running 为主题色、completed 为绿色、failed 为红色。

## 7. 错误处理

- fork 返回空 ID 或旧 ID：视为失败，进入 transport restart 兜底；
- replacement 安装前映射已变化：停止并报错，避免覆盖更新后的 session；
- old late session update：直接忽略；
- old late permission request：立即响应 cancelled；
- Stop 隔离失败：不追加成功 notice，不发送后续 prompt，不伪装 idle。

## 8. 验收测试

### 8.1 Stop 行为测试

fake ACP server 保持 old session `is_running=true`：

```text
old session receives prompt and remains busy
user clicks Stop or sends /stop
extension forks replacement before session/cancel(old)
old remains busy after cancel
user sends next prompt
assert prompt targets replacement exactly once
assert old receives zero new prompts
assert plugin PromptQueue is empty
assert no Queued for the next turn text exists
```

按钮和 `/stop` 必须各覆盖一次，并断言两者调用同一隔离方法。

### 8.2 Stop 失败测试

- fork 失败后不会复用 old session；
- transport restart + resume 成功后可继续；
- transport terminate 或 resume 失败时 barrier 保持 blocked；
- 失败时不显示“已停止当前任务”。

### 8.3 上下文测试

- replacement session 继承停止前的 history；
- 被停止 turn 的未完成 assistant 内容不作为 replacement history；
- UI section、已有消息和附件上下文不变；
- extension reload 后从已持久化 replacement `acpSessionId` 恢复。

### 8.4 Action 边界测试

```text
action.started(Read)
thinking.delta(next reasoning)
assert Read.done === true
assert Read.status === completed
assert Read.error === false
```

另需覆盖：明确失败的 Action 后出现 Thinking 时仍保持 failed/red。

## 9. 非目标

本次不修改：

- conversation、composer、Diff、Todo、Queue 的布局；
- Working 和尾随三点动画；
- `/save`、模型、Skill 或其他命令语义；
- Hermes ACP 后端源码；
- hard denial 已确认的业务语义；
- 文档文件名链接与网页链接行为。

## 10. 完成标准

以下条件必须同时成立：

1. `/stop` 和暂停按钮后发送新消息，均不出现 backend Queue 文案；
2. old ACP session 即使仍 busy，也收不到新 prompt；
3. 同一 UI section 的停止前上下文保持连贯；
4. Action 后出现 Thinking，Action 立即变为 completed/绿色；
5. lint、unit、contract、fake ACP 行为测试通过；
6. 新 VSIX 内的版本、代码和测试产物核验一致。
