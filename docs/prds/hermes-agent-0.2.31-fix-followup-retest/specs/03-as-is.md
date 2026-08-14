# 当前状态

- Status: confirmed
- Prerequisites: [02-acceptance-criteria.md](./02-acceptance-criteria.md)
- Evidence: `media/main.js`、`media/styles.css`、`extension.js`、`lib/acp-client.js`
- Confirmed decisions: 当前行为以工作区源码为准
- Blocking open questions: 无

## 当前行为与证据

### AS-01 Skill placeholder

Skill 以独立元素显示，而输入框始终使用固定 placeholder。Skill 已选中但正文为空时，浏览器仍会显示提示文字。证据：`media/main.js:715-725`。

### AS-02 标题编辑

标题容器的点击会计算光标并重新渲染。进入编辑态后，输入框仍位于同一可点击容器中，后续点击可能再次触发父级逻辑，破坏原生光标移动。证据：`media/main.js:749-762`。

### AS-03 Editor 路由

创建 Hermes Editor 会话时使用了文档区域选择逻辑。现有文档迁移仅覆盖激活文本编辑器，不能保证错误区域中的原 Tab 被移除，也不能稳定建立左文档、右 Agent 的布局。证据：`extension.js:274-301`、`extension.js:329-360`。

### AS-04 Diff 预览

旧字符已能精确高亮，但新增文本通过单点 `after.contentText` 展示。长文本和多行文本不能形成位于原文段落下方的完整预览块。证据：`extension.js:886-935`、`extension.js:996-1033`。

### AS-05 Read 链接

action 描述中的路径按原始完整文本展示。打开文件使用文本编辑器入口，因此非文本文件不能统一交给 VS Code 默认编辑器。证据：`media/main.js:157-175`、`extension.js:513-522`。

### AS-06 Stop

Stop 发送 `session/cancel` 后立即把消息标记为 stopped，但 `session/prompt` 仍可能处于等待状态。ACP 请求层没有单轮取消句柄或取消完成状态，后端继续运行时，新问题会排入旧轮次之后。证据：`extension.js:655-708`、`extension.js:854-871`、`lib/acp-client.js:103-117`。

### AS-07 窄宽度

会话主滚动容器直接隐藏横向溢出，但若子元素仍超宽，结果是内容被裁掉且用户无法横向查看。部分附件和内容容器仍使用内部横向布局。证据：`media/styles.css:80-81`、`media/styles.css:117-128`、`media/styles.css:174-198`。

### AS-08 新问题定位

渲染过程主要依赖保存和恢复 `scrollTop` 以及 `pinBottom`。完整 DOM 重建和状态更新可能使旧阅读位置继续生效，没有针对“新一轮最新 Assistant 输出”的稳定锚点。证据：`media/main.js:237-288`、`media/main.js:1168-1195`。

### AS-09 Thinking 高度

当前最大高度作用在单个 Thinking 文本段落，而不是运行中的整个 Thinking 区域；没有按消息运行状态切换限高，也没有把内部视区持续定位到当前输出。证据：`media/main.js:489-587`、`media/styles.css:138-166`。

### AS-10 确认按钮

当前按钮显示为 `Accept All` 和 `Reject All`，且接受按钮位于拒绝按钮之前。证据：`media/main.js:730-746`。

## 当前边界

- Hermes Editor 会话、Sidebar 和文档上下文共享同一个 Provider 状态。
- ACP 进程当前被多个 UI 会话共享，因此强制终止进程会影响传输连接，但不会删除本地持久化会话。
- Diff 确认流程由 Webview 权限区域和 VS Code 文档预览共同组成，两端必须保持同一待确认状态。

## 已知风险

- 临时 Diff 写入可能使文档短暂进入 dirty 状态；扩展异常退出或预览期间发生用户编辑时需要保护。
- Tab 迁移会触发新的 Tab 和活动编辑器事件；缺少迁移锁会形成循环。
- 仅在前端忽略 Stop 后的流事件不能释放后端任务，也不能解决下一轮排队。
