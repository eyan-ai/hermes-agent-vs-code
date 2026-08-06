# VS Code 插件复刻桌面版 Thinking / 工具卡片效果 —— 完整技术说明

> 目标：VS Code 扩展底层驱动 Hermes Agent，界面呈现与桌面版一致的
> "Thinking 折叠块 + 工具动作卡片 + 流式正文" 效果。

---

## 0. 现状诊断（你现有的扩展）

当前实现（`extension.js` + `lib/chat-parser.js`）：

```
spawn("hermes chat -q <prompt> -v")
        │ stdout
        ▼
createChatParser()  ← 正则解析 ANSI 盒子文本
  · ┌─ Reasoning ─┐  → thinking 块
  · 📞 Tool N: name() → 工具卡片
  · ╭─ ⚕ Hermes ─╮  → 正文流
```

**脆弱点**：
- 依赖 CLI 的盒式排版（`┌│╰╮` 字符、ANSI 转义码、emoji 前缀）——CLI 改版即碎
- 无结构化工具 ID，工具更新靠"按名字反查最后一个"匹配，并行工具会串
- 无编辑 diff、无审批流、无状态机（pending/running/completed/failed 靠猜）
- 历史回放（resume 旧会话）无从谈起

**正确路线：不要解析 CLI，走 Hermes 内置的 ACP 服务**（`hermes acp`）。

---

## 1. 架构总览

```
┌────────────────────────────────────────────────────────────┐
│ VS Code 扩展 (TypeScript)                                  │
│  ┌────────────┐   ┌─────────────────────────────────────┐  │
│  │ Webview UI │   │ ACP 客户端 (JSON-RPC 2.0 over stdio) │  │
│  │  Thinking  │◄──│  · spawn "hermes acp"               │  │
│  │  折叠块    │   │  · initialize → new_session → prompt│  │
│  │  工具卡片  │   │  · 收 session_update 通知           │  │
│  │  流式正文  │   │  · tool_call_id 稳定标识            │  │
│  └────────────┘   └──────────────────┬──────────────────┘  │
└──────────────────────────────────────┼─────────────────────┘
                                       │ stdin/stdout (每行一个 JSON)
┌──────────────────────────────────────┼─────────────────────┐
│ Hermes ACP Server (hermes acp)       ▼                     │
│  acp_adapter/server.py ── 把 agent 事件翻译成 ACP 事件       │
│  · reasoning_callback  → agent_thought_chunk (thinking)     │
│  · tool_progress_cb    → tool_call start (工具卡片)          │
│  · step_callback       → tool_call progress (完成/失败)      │
│  · stream_delta_cb     → agent_message_chunk (正文流)        │
└────────────────────────────────────────────────────────────┘
```

- 传输：**JSON-RPC 2.0，newline-delimited**（每行一个 JSON 对象，无 Content-Length 头）
- 日志走 stderr，**stdout 只留协议流量**
- 语言：Python 服务端（Hermes 自带，无需你写）；VS Code 侧只有客户端 + UI

---

## 2. 协议握手（VS Code 客户端要做的事）

### 2.1 启动进程

```ts
const child = spawn("hermes", ["acp"], {
  cwd: workspaceFolders?.[0]?.uri.fsPath,
  env: { ...process.env, HERMES_ACCEPT_HOOKS: "1" },
});
```

> `hermes acp` / `hermes-acp` / `python -m acp_adapter` 三者等价。
> 需要 `pip install -e '.[acp]'`（agent-client-protocol 依赖）。

### 2.2 方法调用序列

| 顺序 | 方法（线上名） | 类型 | 作用 |
|---|---|---|---|
| 1 | `initialize` | request | 握手，协商协议版本（`acp.PROTOCOL_VERSION`=1），返回模型列表、能力 |
| 2 | `session/new` | request | 建会话，返回 `sessionId`（**参数需 `mcpServers: []`，必填**） |
| 3 | `session/prompt` | request | 发消息，**返回即触发整轮 agent 循环** |
| 4 | `session/cancel` | **notification** | 中断（无响应，fire-and-forget） |
| 5 | `session/load` / `session/resume` | request | 历史回放（见 §5） |
| 6 | `session/set_model` / `session/set_mode` | request | 运行时切模型/模式 |

⚠️ **实测踩坑**：方法名是命名空间形式 `session/new`、`session/prompt`、`session/cancel`（不是 `new_session`/`prompt`/`cancel`），所有参数名用 **camelCase**（`sessionId`/`mcpServers`/`messageId`）。这些细节只有真跑一遍 `hermes acp` 才能确认——e2e 测试脚本 `test/e2e-acp-test.js` 已验证。

### 2.3 服务端推送（通知，无 id）

所有 UI 数据都来自这一个通知通道 `session_update`，`update.session_update` 字段区分类型：

| update 类型 | 对应 UI | 等价桌面事件 |
|---|---|---|
| `agent_thought_chunk` | **Thinking 折叠块**（流式） | `reasoning.delta` |
| `tool_call`（ToolCallStart） | **工具卡片**（新建，running） | `tool.start` |
| `tool_call_update`（ToolCallProgress） | **工具卡片**（completed/failed+结果） | `tool.complete` |
| `agent_message_chunk` | **正文流式渲染** | `message.delta` |
| `usage_update` | 费用/token | — |
| `session_info_update` | 标题/模型 | `session.info` |
| `agent_plan_update` | 计划列表（todo 工具驱动） | — |

⚠️ **注意**：工具开始和完成是**两个不同事件类型**（`tool_call` 与 `tool_call_update`），不是同一事件的 status 变化——渲染器必须分开处理（实测确认）。

---

## 3. 三类 UI 元素 → 数据来源映射

### 3.1 Thinking 块 ← `agent_thought_chunk`

```json
{"session_update": "agent_thought_chunk", "content": {"type": "text", "text": "…推理片段…"}}
```

- 服务端由 `reasoning_callback` 驱动（`make_thinking_cb`），逐 token 推送
- **只有模型真吐了 reasoning_content 才发**——服务端刻意把 `thinking_callback` 置 None（`agent.thinking_callback = None`），避免假 thinking（spinner 文本）
- 客户端：按 `tool_call_id`/消息顺序拼接成一个 reasoning 段落，包进折叠组件
- 折叠交互照抄桌面 `ThinkingDisclosure`：**流式时自动展开，完成后自动折叠，用户手动 toggle 后记住用户选择**

### 3.2 工具卡片 ← `tool_call` (start → progress)

**start**（`acp.start_tool_call`）：
```json
{"session_update": "tool_call",
 "tool_call_id": "uuid",
 "title": "terminal: npm test",      // build_tool_title() 生成
 "kind": "execute",                   // read|edit|search|execute|fetch|think|other
 "status": "pending",
 "content": [{"type": "text", "text": "$ npm test"}],
 "locations": [{"type": "file", "path": "/abs/foo.py"}]}
```

**progress**（`acp.update_tool_call`）：
```json
{"session_update": "tool_call",
 "tool_call_id": "uuid",
 "status": "completed",               // completed | failed
 "content": [{"type": "text"|"diff", ...}],   // 文件编辑带 diff 内容块
 "raw_output": "…完整原始结果…"}
```

- **`tool_call_id` 是稳定 ID**——并行工具不会串（对比你现在的"按名字反查"）
- `kind` 直接映射图标：read=📄 edit=✏️ search=🔍 execute=⚡ fetch=🌐 think=🧠
- `title` 服务端已生成好人类可读标题（`terminal: xxx` / `read: path` / `search: pattern`），无需客户端翻译
- 文件编辑（write_file/patch）在 auto-approve 时会带 `diff` 内容块 → 卡片内直接渲染 diff
- **审批流**：`session_request_permission` 方法，编辑/高危命令弹审批（桌面版同款能力）

### 3.3 流式正文 ← `agent_message_chunk`

```json
{"session_update": "agent_message_chunk", "content": {"type": "text", "text": "…增量…"}}
```

- 客户端逐块 append，markdown 渲染（注意：块间空白属于数据，不要 trim）

---

## 4. 客户端代码骨架（最小可用）

```ts
// acp-client.ts —— JSON-RPC over stdio 迷你客户端
class AcpClient {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  private buf = "";

  constructor(private proc: ChildProcess) {
    proc.stdout.on("data", d => this.onData(d.toString()));
  }
  private onData(chunk: string) {
    this.buf += chunk;
    let idx;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx); this.buf = this.buf.slice(idx + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined) {           // 请求响应
        const cb = this.pending.get(msg.id); if (cb) { cb(msg.result); this.pending.delete(msg.id); }
      } else {                               // 服务端通知 → UI store
        this.onNotification(msg);
      }
    }
  }
  request(method: string, params: any) {
    const id = ++this.id;
    return new Promise(res => { this.pending.set(id, res);
      this.proc.stdin.write(JSON.stringify({jsonrpc:"2.0", id, method, params}) + "\n");
    });
  }
}

// 会话流程
await client.request("initialize", {protocolVersion: 1, clientCapabilities: {}});
const { session_id } = await client.request("new_session", { cwd });
await client.request("prompt", { session_id, text: userPrompt });
```

通知分发 → 更新 UI store（三个 reducer：appendThought / upsertToolCall / appendMessageDelta），
Webview 里用 React 渲染，折叠组件直接复用桌面版的交互逻辑（open 默认值 =
`streaming ? true : false`，首次手动 toggle 后记忆）。

---

## 5. 历史回放（resume 旧会话）

`load_session` / `resume_session` 后，服务端自动重放历史
（`_replay_session_history`，acp_adapter/server.py:1023）：

- 从 state.db 读出每条 assistant 消息的 `reasoning_content` / `reasoning` 字段
  → 重放为 `agent_thought_chunk`（**thinking 块回来了**）
- 工具调用记录 → 重放为 `tool_call` start+progress
- 正文 → `agent_message_chunk`

**客户端零成本获得历史 thinking/工具视图**——这是解析 CLI 方案根本做不到的。

---

## 6. 与桌面版的对照

| 能力 | 桌面版 | ACP 插件 |
|---|---|---|
| Thinking 流式 | reasoning.delta WS 事件 | agent_thought_chunk 通知 |
| 工具卡片 | tool.start/complete | tool_call start/progress |
| 工具标题 | `_TOOL_VERBS` 表翻译 | `build_tool_title()` 服务端生成 |
| 稳定工具 ID | tool_id | tool_call_id |
| 编辑 diff | inline_diff | content 里的 diff 内容块 |
| 审批 | approval WS 请求 | session_request_permission |
| 历史回放 | 本地 state.db | 服务端自动重放 |
| 并行工具隔离 | 按 id | 按 id（同源同构） |

数据流同源（都是 agent 内部 callbacks），只是"翻译器"不同：
桌面用 `tui_gateway/server.py`（WebSocket JSON-RPC），
插件用 `acp_adapter/`（stdio JSON-RPC）。

---

## 7. 关键坑位

1. **不要 trim thinking 分片**——推理按 token 流，trim 会把相邻词粘一起（服务端已留空白，客户端别画蛇添足）。
2. **stdout 只留给协议**——任何 `console.log` 都会污染 JSON 流；调试走 stderr/输出通道。
3. **`thinking.delta` ≠ 真推理**——桌面版的 `thinking.delta` 是 spinner 文本（被桌面端忽略）；ACP 侧服务端已把 thinking_callback 置 None，收到的 thought chunk 一定是真推理，放心渲染。
4. **prompt 返回即整轮结束**——`prompt` 的 JSON-RPC 响应在 agent 循环完成后才返回；中途所有进度都走通知。UI 不要等响应，靠通知刷新。
5. **进程生命周期**——VS Code 关闭时 kill 子进程；长会话注意 `cancel` 而不是直接 kill（保证状态落库）。
6. **协议版本**——initialize 时协商 `protocol_version`，服务端兼容旧版本（server.py:872 resolved_protocol_version）。

---

## 8. 参考实现

- 服务端：`~/.hermes/hermes-agent/acp_adapter/`（server.py / events.py / tools.py）
- 协议库（Python）：`agent-client-protocol` 0.9.0（Zed Industries 官方）
- JS 客户端：npm `@zed-industries/acp`（0.6.1，含 ClientSideConnection 现成实现）
- VS Code 现成客户端参考：marketplace 搜 "ACP Client"（formulahendry.acp-client）
- 官方文档：`website/docs/user-guide/features/acp.md`
