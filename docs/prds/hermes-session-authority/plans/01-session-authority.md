# Hermes 会话唯一事实源实施计划

**Spec 引用：** `docs/prds/hermes-session-authority/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-20 confirmed
**目标：** VS Code 与 Hermes Desktop 读取和修改同一份会话历史及标题
**架构：** 标准 ACP `session/list` 提供统一历史索引；Hermes ACP extension method 提供 snapshot、改名和删除；插件将远端会话投影到现有 UI 数据结构。普通 Agent 流式、审批与取消路径保持原样。
**技术栈：** Node.js、VS Code Extension API、ACP JSON-RPC、Python、pytest
**验收：** `AC-SESSION-AUTHORITY-01` 至 `AC-ISOLATION-01`
**执行环境：** 插件 dirty worktree 与 Hermes Adapter dirty worktree；仅叠加当前会话相关修改，不覆盖已有改动

## 全局约束

- 不直接修改已安装 Hermes。
- 不新增依赖，不改变工具链。
- Adapter 新能力必须通过 ACP extension method 暴露；旧 Adapter 失败时降级。
- 不触碰审批、Diff、回显、Queue/Stop 和 Run Settings 的行为分支。

### 任务 1：Adapter 统一会话读取与标题写入

- [x] 测试 `session/list` 包含 Desktop/CLI/ACP 人类会话并排除内部 worker。
- [x] 测试 ACP 可恢复非 ACP 来源会话且不改写其 source。
- [x] 测试 `hermes/session/snapshot` 返回权威标题与消息。
- [x] 测试 `hermes/session/set_title` 在新版 SessionDB 写入 `title_source=user`，并发送 `session_info_update`；旧版保留非空手工标题优先级。
- [x] 测试资源块不会进入标题输入。

### 任务 2：插件投影 Hermes 会话

- [x] 为远端列表合并、旧记录保留和 snapshot 转换编写测试。
- [x] 启动/打开历史时读取 `session/list`；选择会话时读取 snapshot，并防止迟到 snapshot 覆盖新回合。
- [x] 远端标题作为新 Adapter 权威值；`globalState` 降级为缓存。
- [x] 改名和删除优先写 Hermes；旧 Adapter 使用本地标题覆盖和删除 tombstone 保持兼容结果。

### 任务 3：隔离标题输入

- [x] 为 ACP prompt blocks 编写测试。
- [x] 用户真实文字使用 text block；附件和编辑器上下文使用 resource block。
- [x] 附件-only 请求不制造占位标题文本，也不触发自动标题。

### 任务 4：验证

- [x] 运行插件聚焦测试、`npm run lint`、`npm run test:unit`、`git diff --check`。
- [ ] Hermes ACP pytest：当前 Hermes venv 缺少 pytest；已改用 py_compile 和临时 SQLite/标题行为探针验证。
- [x] 审读两个仓库最终 Diff，确认没有撤销既有 Effort/Diff 改动。
- [x] 独立代码审查并处理竞态、旧 Adapter 兼容和删除失败隔离发现。
