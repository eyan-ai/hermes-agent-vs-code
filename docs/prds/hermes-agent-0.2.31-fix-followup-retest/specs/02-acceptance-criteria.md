# 验收标准

- Status: confirmed
- Prerequisites: [01-background-and-goal.md](./01-background-and-goal.md)
- Evidence: 用户确认的期望行为
- Confirmed decisions: D-01 至 D-05
- Blocking open questions: 无

## 功能验收

### AC-01 Skill 选中后的输入提示

- 选择 Skill 后保留 Skill 标识，但输入框 placeholder 立即消失。
- 移除 Skill 且正文为空时，placeholder 恢复。
- 不改变 Skill 过滤、选择、删除和发送规则。

### AC-02 顶部标题光标

- 第一次点击标题时，光标落在所点击字符附近，不全选文本。
- 编辑过程中可反复点击任意文字位置，光标按原生输入行为移动。
- 编辑过程中的点击不重新渲染输入框、不丢失草稿、不跳到末尾。
- Enter、失焦和 Escape 的既有保存或取消语义保持有效。

### AC-03 Editor 区域分离

- 有文档和 Hermes Agent 时，从左到右为“文档 Editor 区域 | Hermes Agent Editor 区域”。
- 新 Hermes 会话在已有 Agent 区域新增 Tab；没有 Agent 区域时在文档区域右侧创建。
- 文档从 Explorer、附件、Read 链接或扩展命令打开时均进入文档区域。
- 没有文档区域时，在 Agent 区域左侧创建文档区域。
- Hermes Agent Tab 与文档 Tab 不留在同一个 Editor Group。

### AC-04 Diff 完整预览

- 旧文段中的实际变化字符保持精确红色高亮。
- 修改后的完整文段以绿色预览显示在旧文段正下方，多行内容不截断、不落在段落中间。
- `Accept` 时先清理临时预览，再进入正式修改流程，最终内容不重复。
- `Deny`、Stop、关闭确认或释放扩展时均回滚临时预览。
- 预览期间文档发生额外编辑时，不执行可能覆盖用户内容的盲目回滚或确认。

### AC-05 Read 文档链接

- Read action 只显示文件名，不显示完整路径。
- 默认无下划线，hover 时显示下划线；tooltip 可查看完整路径。
- 点击后在文档区域打开。
- 文本、图片、PDF、Notebook 及其他 VS Code 已支持的文件类型交给其默认编辑器打开。

### AC-06 真实停止

- 点击 Stop 后，当前 Thinking、工具调用和最终回答停止继续产生内容。
- 已停止轮次的迟到事件不能写回消息。
- 取消失败或超时后，系统通过重置 ACP 传输保证旧任务实际终止。
- 取消错误不得触发 CLI fallback。
- 后端停止完成前不得提交新问题；恢复后新问题直接开始新一轮，不显示 `Queued for next turn`。

### AC-07 最小宽度适配

- 在 VS Code Editor Group 可缩小的最小宽度下，普通正文、Thinking、用户消息、action、表格和输入区不被页面级裁切。
- 页面不需要横向滚动才能阅读完整内容。
- 长路径、长单词、代码和表格在自身宽度内换行或收缩，不撑宽会话区域。

### AC-08 新问题滚动定位

- 用户停留在历史内容中部发送新问题后，视区立即定位到新一轮最新 Assistant 输出。
- 新一轮流式输出期间，最新输出行保持可见。
- 下一次发送新问题必须重新定位，不继承旧阅读位置。

### AC-09 Thinking 生成态限高

- 仅在 Agent 正在生成且 Thinking 展开时，整体区域最多显示约 10 行。
- 生成过程中自动聚焦最下方的当前输出行。
- 上方存在被滚出内容时，顶部显示半透明渐隐；没有溢出时不显示。
- `done`、`stopped` 或 `failed` 后移除限高、内部滚动和渐隐，展开时完整铺开。
- 用户手动折叠的 Thinking 在状态结束后仍保持折叠。

### AC-10 确认按钮

- 确认区域从左到右显示 `Deny`、`Accept`。
- `Accept` 位于右侧并保持主按钮视觉层级。
- 两个按钮的显示文字、语义和实际行为一致。

## 保护条件

- GR-01：不得改变现有会话持久化内容和历史消息含义。
- GR-02：不得把其他扩展的 Webview Tab 识别为 Hermes Agent Tab。
- GR-03：不得因 Tab 路由产生无限迁移、焦点抖动或重复 Tab。
- GR-04：不得在 Diff 回滚时覆盖用户在预览后产生的无关编辑。
- GR-05：不得因 Stop 的强制兜底把取消错误转化为一条新的 CLI 回答。

## 验证证据

- 自动验证：语法检查、现有单元测试，以及 Stop 状态、迟到事件、Diff 回滚的聚焦测试。
- 手工验证：使用打包后的 VSIX 在 VS Code 中逐项执行 AC-01 至 AC-10。
- 视觉验证：至少覆盖一个浅色主题、一个深色主题，以及 Editor Group 最小宽度。
