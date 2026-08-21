# Hermes 会话唯一事实源 Spec

状态：superseded-by-standard-acp
设计修订：2026-08-20，用户选择方案 3：插件只依赖标准 ACP，不把 Hermes 自定义 Adapter 扩展作为安装前提。

## 目标

- 标准 ACP 是插件与 Hermes 的唯一运行时契约；插件不要求用户升级或替换 Hermes Adapter。
- VS Code 的会话历史和标题由插件 `globalState` 本地维护；Hermes Desktop 的历史不承诺与 VS Code 完整一致。
- ACP 普通请求的第一个文本块只包含用户真实输入；附件、编辑器文件和选区使用 ACP resource block，不能进入标题输入。
- 顶部和历史列表改名写入插件本地会话；标准 ACP 的 `session_info_update` 只作为非手工标题的可选更新。
- 插件自动标题只从用户正文生成，附件和编辑器资源不进入标题输入。

## 兼容与迁移

- 有 `acpSessionId` 的旧本地记录按 Hermes session ID 合并；本地手工标题优先保留。
- 尚未绑定 Hermes 的本地草稿继续保留。
- Hermes 列表暂时缺少的旧本地记录不静默删除，标记为本地缓存并保留。
- 不调用 title/snapshot/delete 自定义扩展方法；所有 Hermes 版本均通过标准 ACP 使用 Agent、审批和 Diff。

## 非目标

- 不改变审批、Diff/V4A、Working/Action/最终回答、Queue/Stop、Run Settings 和模型交互。
- 不修改已安装的 `/Users/eyan/.hermes/hermes-agent`；Adapter 修改只进入独立 Hermes 源码仓库。
- 本轮不打包、不安装、不发布。

## 验收 ID

- `AC-SESSION-AUTHORITY-01`：VS Code 历史列表使用标准 ACP `session/list`，本地标题和消息由插件维护。
- `AC-SESSION-HISTORY-01`：选择会话后使用插件本地历史恢复；新回合通过标准 ACP `session/resume` 继续。
- `AC-TITLE-INPUT-01`：标题器只接收用户非附件文字，附件不会生成 `Context: #N`。
- `AC-TITLE-RENAME-01`：顶部与历史列表改名写入同一插件本地 session，并阻止后续自动标题覆盖。
- `AC-COMPAT-01`：旧本地记录不丢失；旧 Adapter 缺少扩展方法时插件核心能力继续可用。
- `AC-ISOLATION-01`：审批、Diff、回显、Queue/Stop、Run Settings 现有回归测试保持通过。
