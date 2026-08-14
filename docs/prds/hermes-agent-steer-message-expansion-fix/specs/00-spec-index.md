# Hermes Agent Steer 与长消息展开修复 Spec

状态：`confirmed`

确认日期：2026-08-11

设计来源：`docs/superpowers/specs/2026-08-11-hermes-steer-message-expansion-fix-design.md`

目标版本基线：`0.2.36`

## 范围

- Queue Steer 一次点击只发送一次，后端同一 Queue 项并发请求只消费一次。
- 溢出的用户消息可点击展开，跨流式刷新保持展开，并通过右下角按钮主动收起。
- Todo 胶囊使用 `1.25` 线宽的专用细线箭头，箭头和 Todo 文字在同一行垂直居中。
- 未打开的已有文档和尚不存在的新文档均可安全生成只读 Diff 预览。
- 已发送命令和 Todo 运行指示使用与输入框聚焦边框一致的 `--ha-accent`。

## 验收 ID

- `AC-01`：至少三次流式状态更新后，单击一个 Queue Steer 按钮仅发布一条 `queueSteer` Webview 消息。
- `AC-02`：同一 `sessionId + queueItemId` 的两个并发后端请求最多执行一次 Steer 或普通启动。
- `AC-03`：成功 Steer 只生成一条 `Steered` 用户消息并删除一个 Queue 项。
- `AC-04`：超过 `76px` 的用户消息保持当前渐隐折叠效果，点击消息框后完整展开。
- `AC-05`：展开状态在 Agent、Thinking、Todo 和 Queue 更新后保持。
- `AC-06`：右下角收起按钮恢复 `76px` 折叠和渐隐效果，并阻止事件冒泡。
- `AC-07`：附件与 Modify 操作不触发消息展开；未溢出的消息不显示收起按钮。
- `AC-08`：Todo 箭头线宽为 `1.25`，与 Todo 文字在同一 flex 行垂直居中，开合时无位置跳动。
- `AC-09`：Queue 编辑、删除、折叠、顺序和滚动，Todo 位置，输入框焦点及现有消息样式不回归。
- `AC-10`：未打开的已有文件从文件系统快照生成 Diff，不要求源文件先打开为 Editor Tab。
- `AC-11`：不存在的新文件以空源生成全量绿色预览，确认前不创建磁盘文件。
- `AC-12`：Accept 前校验打开文档版本/文本、未打开文件磁盘内容或新文件仍不存在；冲突时阻止确认。
- `AC-13`：Deny 与预览清理不创建或修改目标文件。
- `AC-14`：已发送 `/命令` 与 Skill token 使用 `--ha-accent`。
- `AC-15`：Todo 胶囊运行圈和进行中任务动效点使用 `--ha-accent`。

## 不修改范围

- ACP 文本路由与 Working/Answer 分流。
- `/steer` 命令语义和 Queue 自动排队顺序。
- 权限选项与等待时序、Editor 区域隔离。
- VS Code 基础主题变量定义和依赖工具链。
