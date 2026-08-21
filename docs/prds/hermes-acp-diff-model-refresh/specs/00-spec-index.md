# Hermes ACP Diff 与模型刷新 Spec 索引

状态：confirmed
设计修订：2026-08-19，Run Settings V5；核心 VSIX 能力不依赖 Hermes 源码修改，Effort 仅在 ACP 明确声明支持时显示。

## 规范来源

- `00-design.md`：完整行为、兼容、隔离和交付设计。
- `01-model-combobox-followup.md`：已确认。可输入 Model combobox、贴边上下展开的 Webview 根浮层，以及 Effort 有无驱动的 Run Settings 自适应高度。

## 验收 ID

- `AC-DIFF-RECOVERY-01`：用户修改 inline Diff 后，批准被阻止，但保留编辑并取消、No、Stop、会话关闭均能解除 Permission。
- `AC-DIFF-ALIGN-01`：全文和多 hunk Diff 以 LCS 变化组对齐，不跨 unchanged 行配对，不制造空占位。
- `AC-DIFF-SAFETY-01`：未修改的小范围 Diff、普通审批、Queue、Working、Action 和最终回答行为保持不变。
- `AC-MODEL-REFRESH-01`：旧会话可主动刷新 CC Switch/Hermes 当前模型列表，失败保留旧列表，失效当前模型不静默替换。
- `AC-RUN-SETTINGS-01`：Run Settings 固定展示 Mode、Model 和底部 Refresh；Model/Effort 下拉层不改变主弹窗尺寸。
- `AC-MODEL-PICKER-01`：模型选择器支持鼠标和键盘；仅支持 Thinking 的模型显示独立 Effort 选择器，并按模型分别记忆 `Low / Medium / High / Extra High / Max / Ultra`。
- `AC-ACP-EFFORT-01`：新版 Hermes 通过标准 `reasoning_effort` config option 应用会话级推理程度，不写全局配置。
- `AC-ACP-COMPAT-01`：旧 Hermes 未声明该 config option 时，Effort 整体隐藏；Diff、模型刷新和其他插件能力继续可用。
- `AC-PACKAGE-01`：版本、测试、README 哈希、VSIX 完整性和旧包保留均通过验证。
