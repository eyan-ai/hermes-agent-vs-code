# 当前状态

- Status: confirmed
- Prerequisites: [02-acceptance-criteria.md](./02-acceptance-criteria.md)
- Evidence: `0.2.44` 源码、测试和当前原型
- Confirmed decisions: D-01 至 D-19
- Blocking open questions: 无新增

## 基线

- Extension ID: `EyanLin.hermes-agent-vscode`
- Version: `0.2.44`
- Git revision: `113bc56`
- Worktree: 本次核对开始时无未提交生产代码修改

## AS-01 当前确认区域

当前 Webview 的 `renderPermissionInside()` 在既有 `.permission-panel` 中渲染：

- 一行问题标题。
- 一个 `.permission-actions` 按钮列表。
- 每个按钮携带 `decision` 和可选 `optionId`。

当前没有自由输入框。契约测试还明确要求该区域不包含 `<input>` 或 `<textarea>`。

证据：

- `media/main.js:952-960`
- `media/main.js:1336-1342`
- `media/styles.css:263-279`
- `test/webview-contract.test.js:36-48`

## AS-02 当前 ACP Permission 边界

扩展接收 `session/request_permission`，将请求放入按会话归属的队列，并最终向 ACP 返回：

- `selected + optionId`，或
- `cancelled`。

当前协议响应没有自由文本字段。Edit 使用固定 `Yes / Yes, always allow in this session / No`，其他权限可展示 ACP 请求自带选项。

证据：

- `extension.js:1091-1129`
- `extension.js:1230-1281`
- `extension.js:1645-1708`
- `lib/acp-client.js:124-132`
- `test/extension-contract.test.js:141-180`

结论：自由意见不能直接伪装成 Permission Allow，必须进入独立反馈语义。

## AS-03 当前无限等待

当前确认提醒使用可配置定时器，但提醒不会调用 Permission 响应或 Diff 解析逻辑。请求继续保持 Pending。

证据：

- `extension.js:1284` 起的提醒逻辑
- `test/extension-contract.test.js:154-161`

该行为必须保留。

## AS-04 当前 Diff 预览

当前 `showDocDiff()`：

- 读取目标文档或文件内容。
- 构造 `hermes-diff-preview` 只读虚拟文档。
- 在文档 Editor 区打开预览。
- 对实际变化行使用 VS Code Diff ThemeColor 做整行红/绿高亮。
- 在确认前不正式覆盖原文件。

证据：

- `extension.js:1530-1605`
- `media/styles.css:24-25`

当前逻辑没有按修改规模区分小、中、大修改，也没有 Plan/Review 独立临时 Editor 生命周期。

## AS-05 当前 Working 动作展示

当前 `renderPathLinks()` 使用路径正则逐段识别链接：

- Read 动作通过 `basenameOnly` 显示文件名。
- 路径链接使用 `.action-path`。
- 正则不把完整 `http(s)` URL 作为一个独立整体处理，网址可能被拆成路径片段。
- `.action-path` 当前使用链接强调色，不符合“普通文字，hover 才下划线”的目标。
- Action 标题由 `naturalTitle()` 从 ACP `title` 拆出动作名和描述；对于 `execute_code`，当前固定描述为 `code`，无法表达该脚本的实际目的。
- 标题渲染会直接使用上游 description；当上游把代码或命令放进 title 时，代码可能进入标题行。
- 详情区当前统一通过 `renderIOTable(code, result)` 展示代码和结果，容易在只有单侧内容时仍套用 `IN/OUT` 结构。

证据：

- `media/main.js:233-263`
- `media/main.js:684-708`
- `media/main.js:719-721`
- `lib/acp-render.js:69-86`
- `lib/acp-render.js:242-254`
- `media/styles.css:193-200`

## AS-06 当前 Editor 路由

当前文档打开和 Diff 预览会通过文档列路由，与 Hermes Agent 区域分离。现有逻辑主要维护：

```text
文档 Editor 区域 | Hermes Agent Editor 区域
```

当前没有“在 Agent 右侧临时拉起一个只服务于 Plan/Review 的独立 Editor，并在结束后恢复布局”的流程。

证据：

- `extension.js` 中 `ensureDocumentColumn()`、文档打开和 `showDocDiff()` 路由
- 既有 Editor 分区 Spec：`docs/prds/hermes-agent-0.2.31-fix-followup-retest/specs/04-to-be.md`

## AS-07 Desktop Clarify 可参考能力

本机 Hermes Desktop 的 Clarify 组件已经实现：

- 预设选项和自由输入互斥。
- Enter 提交，Shift+Enter 换行。
- 自由输入作为 `answer` 返回。
- 完成后问题和回答保留在记录中。

但 Desktop Approval 仍只返回固定 choice。因此，本插件可以复用 Clarify 的交互模型，不能把自由文本直接塞入 ACP Permission outcome。

证据：

- `/Users/eyan/.hermes/hermes-agent/apps/desktop/src/components/assistant-ui/clarify-tool.tsx:185-418`
- `/Users/eyan/.hermes/hermes-agent/apps/desktop/src/components/assistant-ui/tool/approval.tsx:48-155`
- `/Users/eyan/.hermes/hermes-agent/tui_gateway/server.py:11307-11309`
- `/Users/eyan/.hermes/hermes-agent/tui_gateway/server.py:11328-11345`

## AS-08 当前 Model 设置

- `hermesModels()` 已读取 Hermes `config.yaml` 和 `cache/model_catalog.json`，但当前没有进入 `stateMessage()`，Webview 的 `state.models` 实际为空。
- Run Settings 当前只渲染 Mode，并在标题栏提供 Reset。
- `settingsChanged()` 当前只发送 Mode；新会话也只继承 `lastMode`。
- ACP `session/new` 实际返回会话级 `models.availableModels/currentModelId`，并支持 `session/set_model`，当前扩展尚未消费。

证据：

- `extension.js:107-158`
- `extension.js:297-302`
- `extension.js:581-585`
- `extension.js:967-985`
- `extension.js:1975-2009`
- `media/main.js:780-792`
- `media/main.js:1208-1221`
- `media/main.js:1429-1431`

## 已确认原型与生产差距

| 原型 | 已确认内容 | 当前生产差距 |
| --- | --- | --- |
| `hermes-working-action-link-style-prototype.html` | 普通文字、完整链接、hover 连续下划线 | 当前路径正则和强调色不满足 |
| `hermes-large-rewrite-auto-review-prototype.html` | Agent 右侧自动审阅、Plan 原位切 Review | 当前无大修改状态机和临时 Editor |
| `hermes-generic-confirmation-custom-input-prototype.html` | 选项点击即提交、输入 Enter 提交 | 当前确认区仅按钮，且 Permission 无自由文本 |

## 事实边界

- 当前源码证明 UI 和协议现状，不证明大修改分类规则已经存在。
- HTML 原型证明交互可表达并通过浏览器检查，不证明 VS Code Editor Group、Comment API 或 ACP 实际链路已经联调。
- 本 Spec 的目标状态需要后续技术设计和 Extension Host 验证。
