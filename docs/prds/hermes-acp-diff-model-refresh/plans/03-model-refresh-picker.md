# 模型刷新与选择器实施计划

**Spec 引用：** `docs/prds/hermes-acp-diff-model-refresh/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-19 confirmed；Run Settings V5、核心 VSIX 独立、Effort capability-gated
**目标：** 旧会话主动获得 CC Switch/Hermes 最新模型列表，Run Settings 外框稳定，并在受支持模型下提供独立 Effort 选择器
**架构：** 后端保留显式 cache invalidation 和 session model-state replacement；webview 将 Run Settings 划分为固定 header、可滚动配置区和固定 Refresh footer。Model/Effort 使用互斥的浮动 listbox；Effort 仅由当前 ACP session response 的 `reasoning_effort` config option 控制。
**技术栈：** Node.js、VS Code webview、ACP JSON-RPC
**验收：** `AC-RUN-SETTINGS-01`、`AC-MODEL-REFRESH-01`、`AC-MODEL-PICKER-01`、`AC-ACP-COMPAT-01`
**执行环境：** 可与计划 01/02 的纯函数阶段并行，但 `extension.js` 合并必须串行

## 全局约束

- UI 精确显示 `Low / Medium / High / Extra High / Max / Ultra`。
- 小写值仅用于 ACP wire；不修改 `~/.hermes/config.yaml`。
- Refresh 失败保留旧列表；活动 turn/permission/queue 不被中断。
- 旧 Hermes 未广告 capability 时不渲染 Effort，也不显示升级提示。
- Refresh 开始前关闭 Model/Effort listbox，结束后只保留 Run Settings 主弹窗。

---

## 文件映射

- 修改：`lib/model-settings.js`，纯模型状态合并与 per-model effort 记忆
- 修改：`extension.js`，消息路由、cache invalidation、session state
- 修改：`media/main.js`，互斥 listbox、refresh 收起状态、条件 Effort 控件
- 修改：`media/styles.css`，固定弹窗结构、绝对定位浮层和 16px chevron
- 测试：`test/model-settings.test.js`
- 测试：`test/webview-contract.test.js`
- 测试：`test/extension-contract.test.js`

### 任务 1：刷新状态与不可用当前模型

**接口：** `mergeRefreshedModels(previous, refreshed, selected) -> { options, selected, unavailable }`；后端消息 `refreshModels`
**风险与回滚：** 读取或解析失败返回原 state，不清空 `session.modelState`

- [ ] 添加 RED：旧 session 被新列表替换、刷新失败保留、当前模型缺失时追加 `unavailable: true` 且不切换。
- [ ] 实现纯函数和 `refreshModels` 路由，清除 `_hermesConfig`、`_hermesModelState` 后重新读取。
- [ ] 运行 `node test/model-settings.test.js && node test/extension-contract.test.js`，预期 PASS。

### 任务 2：固定 Run Settings 与独立 Model listbox

**接口：** webview 消息 `refreshModels`、`settingsChanged`；ARIA `listbox/option`，键盘 ArrowUp/ArrowDown/Enter/Space/Escape
**风险与回滚：** 保持现有 `settingsChanged` model 请求；浮层不得被 `.mode-panel` overflow 裁剪；小侧栏使用 viewport 上限而不是扩大外框

- [ ] 修改 `test/webview-contract.test.js` 添加 RED：Run Settings 使用 header/body/footer；Model listbox 不在配置文档流中；`.model-picker-button .dropdown-icon` 为固定 16px；不再匹配旧 hover Effort 规则。
- [ ] 运行 `node test/webview-contract.test.js`，预期因固定结构和浮层样式缺失 FAIL。
- [ ] 修改 `media/main.js`，将 Model 触发器与 `role="listbox"` 保持现有键盘语义，但 listbox 作为配置区上的独立浮层渲染。
- [ ] 修改 `media/styles.css`：`#modePopover` 使用稳定宽高和 viewport 上限；`.mode-panel` 使用 grid/flex 分区；`.model-list` 绝对定位并设置 `z-index`/`max-height`/`overflow-y:auto`；`.dropdown-icon` 固定 `width/height:16px`。
- [ ] 运行 `node test/webview-contract.test.js`，预期 PASS。

### 任务 3：条件 Effort listbox 与 Refresh 收起状态

**接口：** `session.settings.reasoningByModel[modelId] = wireValue`；支持时请求 `session/set_config_option` 参数 `{ sessionId, configId: "reasoning_effort", value }`
**风险与回滚：** 请求失败恢复旧值；未广告能力时 Effort DOM 整体缺失且不发送请求；Refresh 不清空已保存选择

- [ ] 修改 `test/webview-contract.test.js` 添加 RED：支持时 Model 下方出现独立 `Effort` 触发器；点击后显示六档；不含 `Update Hermes`；不含 `.model-option:hover .effort-picker`；Refresh handler 同步关闭两个 listbox 后才 post `refreshModels`。
- [ ] 修改 `test/extension-contract.test.js` 添加 RED：模型切换成功后通过标准 `session/resume` 刷新 `configOptions`；capability 缺失时不发送 `session/set_config_option`。
- [ ] 运行 `node test/webview-contract.test.js && node test/extension-contract.test.js`，预期因 V5 行为缺失 FAIL。
- [ ] 修改 `media/main.js`：增加 `effortPickerOpen`/focus state；Model 与 Effort listbox 互斥；仅 `reasoningEffortSupported` 为 true 时渲染 Effort field；Refresh 先关闭两个 listbox并重置 focus，再发送消息。
- [ ] 修改 `extension.js`：模型切换后调用 `session/resume` 并用现有 `applyAcpSessionState` 更新模型与 capability；仅刷新后 capability 为 true 才重发该模型记忆 effort。
- [ ] 修改 `media/styles.css`：Effort trigger 复用 Model trigger 视觉，Effort listbox 为独立绝对定位浮层，不占据配置区高度。
- [ ] 运行模型与 webview 聚焦测试，预期 PASS。
- [ ] 运行 `npm run test:unit`，预期全部 PASS。
