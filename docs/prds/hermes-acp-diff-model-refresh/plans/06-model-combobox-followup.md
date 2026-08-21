# Run Settings Model Combobox 修复实施计划

**Spec 引用：** `docs/prds/hermes-acp-diff-model-refresh/specs/00-spec-index.md`、`docs/prds/hermes-acp-diff-model-refresh/specs/01-model-combobox-followup.md`
**Spec/设计修订：** 2026-08-20 confirmed；Scheme A Webview-root overlay；可输入 Model combobox；Mode 保持 `0.2.54` 行为；Effort 继续仅由 ACP `reasoning_effort` capability 控制
**目标：** Model 在同一个可输入控件中实时筛选，列表以 `0px` 间隙贴住控件上缘或下缘并始终留在 Webview viewport 内；Run Settings 在 Effort 缺失时自然收高，且不改变 Mode、Refresh、ACP、审批、Diff 或 Agent 回显行为
**架构：** 新增一个无 DOM 依赖、同时支持浏览器全局对象与 CommonJS 测试的 `media/model-picker.js`，集中负责模型筛选、可选项焦点和浮层几何计算。`media/main.js` 只管理已提交模型与临时输入状态，并把 Model/Effort listbox 渲染到 `document.body` 下的单一 overlay root；`media/styles.css` 负责贴边视觉和 Run Settings 自适应布局。
**技术栈：** Node.js、原生 JavaScript、VS Code Webview、HTML/CSS、Node `assert`
**验收：** `AC-MODEL-COMBOBOX-01`、`AC-MODEL-ANCHOR-01`、`AC-MODEL-ANCHOR-02`、`AC-MODEL-ANCHOR-03`、`AC-MODEL-SELECT-01`、`AC-MODEL-CANCEL-01`、`AC-RUN-HEIGHT-01`、`AC-RUN-HEIGHT-02`、`AC-ISOLATION-01`、`AC-MODE-ISOLATION-01`
**执行环境：** 仓库根目录为 `/Users/eyan/Desktop/Vibe Coding/Hermes vs code插件/outputs/hermes-agent-vscode-extension`；当前 `main` 工作树已有未提交修改，执行时必须保留并基于现状增量修改；不创建或切换分支，不 reset，不 commit，不打包，不安装 VSIX

## 全局约束

- 只修复 `01-model-combobox-followup.md` 已确认的 Model combobox、Webview-root 浮层和 Run Settings 自适应高度。
- `Manual`、`Auto` 的顺序、文案、说明、图标、选中样式和点击后 `settingsChanged()` 行为保持 `0.2.54` 当前实现不变。
- 输入和筛选不发送 `settingsChanged`、`session/set_model`、`refreshModels` 或任何 ACP 请求；只有点击或 `Enter` 提交可用模型时沿用现有 `selectModel(modelId)` 流程发送一次设置变更。
- `Escape`、点击浮层外部、关闭 Run Settings 和 Refresh 前关闭选择器，恢复已提交模型显示，不发送模型设置变更。
- 不可用模型继续显示 `Unavailable`，但鼠标和键盘均不能提交。
- Effort 仅在 `state.settings.reasoningEffortSupported === true` 时存在；不按模型名或 Hermes 版本推断能力，不修改 Hermes 安装，不伪造 Effort。
- `Low / Medium / High / Extra High / Max / Ultra` 文案、wire value 和按模型记忆逻辑不变。
- Refresh 仍发送现有 `{ type: "refreshModels" }`，失败保留旧列表等语义不变；本计划只在发送前清理 Model/Effort 临时 UI 状态。
- 不修改审批、Permission、Diff、Working、Action、Queue、Stop、命令、最终回答或 ACP 路由代码。
- 不新增 npm 依赖，不改变 Node/VS Code engine，不修改生产工具链。

---

## 文件映射

- 新建：`media/model-picker.js`，纯筛选、可选焦点和 viewport 定位算法；浏览器导出 `globalThis.HermesModelPicker`，Node 测试导出 `module.exports`
- 新建：`test/model-picker.test.js`，直接执行纯函数的边界与回归测试
- 修改：`extension.js:html(webview)`，只新增 `media/model-picker.js` URI，并在 `media/main.js` 前加载
- 修改：`media/main.js:state`、`renderPopovers()`、`bind()`、全局 outside-click handler、`focusModelOption()`、`selectModel()`、window resize/scroll 监听，接入 editable combobox 与 body overlay root
- 修改：`media/styles.css:#modePopover`、`.mode-panel`、`.mode-panel-content`、`.model-field`、`.effort-field`、`.model-list`、`.effort-list`，移除固定高度和旧 `bottom: 50px` 定位，增加自适应主体与 fixed overlay 样式
- 修改：`test/webview-contract.test.js`，覆盖 DOM/ARIA、无第二搜索框、Portal、取消/提交、Refresh、Effort 高度和 Mode 隔离契约
- 修改：`test/extension-contract.test.js`，只增加辅助脚本加载顺序及既有 ACP/Mode/Refresh 边界断言；不改现有行为断言
- 修改：`package.json:scripts.lint`、`package.json:scripts.test:unit`，纳入新脚本与新测试；不改其他脚本和依赖
- 修改：`package-lock.json`，仅在 `package.json` 脚本变更导致 lockfile 根包 scripts 元数据确实变化时同步；若 lockfile 不记录 scripts，则不得制造无关变更

## 接口总览

`media/model-picker.js` 固定导出以下接口：

```js
filterModels(models, query) -> Array<ModelOption>
nextSelectableIndex(models, currentIndex, delta) -> number
calculateOverlayPlacement(input) -> OverlayPlacement
```

数据契约：

```js
// ModelOption 保持后端现有字段，不改消息 schema。
// { id: string, name?: string, description?: string, unavailable?: boolean }

// input
{
  triggerRect: { top: number, right: number, bottom: number, left: number, width: number },
  viewportWidth: number,
  viewportHeight: number,
  contentHeight: number,
  maxListHeight: number,
  margin: number
}

// OverlayPlacement
{
  direction: "up" | "down",
  top: number,
  left: number,
  width: number,
  maxHeight: number
}
```

计算规则固定为：

1. `desiredHeight = Math.min(contentHeight, maxListHeight)`。
2. `spaceBelow = Math.max(0, viewportHeight - margin - triggerRect.bottom)`。
3. `spaceAbove = Math.max(0, triggerRect.top - margin)`。
4. `desiredHeight <= spaceBelow` 时选 `down`；否则 `desiredHeight <= spaceAbove` 时选 `up`；否则选空间更大的一侧，空间相等时选 `down`。
5. `maxHeight = Math.max(0, Math.min(desiredHeight, selectedSpace))`。
6. `down.top = triggerRect.bottom`；`up.top = triggerRect.top - maxHeight`，因此纵向 gap 恒为 `0px`。
7. `width = Math.min(triggerRect.width, viewportWidth - margin * 2)`；`left` 在 `[margin, viewportWidth - margin - width]` 内夹取。

---

### 任务 1：建立可单测的筛选、焦点和定位算法

**验收：** `AC-MODEL-COMBOBOX-01`、`AC-MODEL-ANCHOR-01`、`AC-MODEL-ANCHOR-02`、`AC-MODEL-ANCHOR-03`
**依赖：** 无
**文件：**

- 新建：`media/model-picker.js`
- 新建：`test/model-picker.test.js`
- 修改：`package.json:scripts.lint`
- 修改：`package.json:scripts.test:unit`
- 条件修改：`package-lock.json`

**接口：**

- 输入：上文 `ModelOption`、placement input
- 输出：`filterModels`、`nextSelectableIndex`、`calculateOverlayPlacement`

**并行边界：** 必须先完成；任务 2 的 Webview 状态和 Portal 只能调用这里的稳定接口。该任务不写 `media/main.js`、`media/styles.css` 或 `extension.js`。
**风险与回滚：** 若 helper 需要 DOM、VS Code API 或运行时全局 state，说明边界设计失败；回滚该文件和对应脚本项，重新保持为纯输入/输出函数。无数据迁移和不可逆操作。

- [ ] **步骤 1：编写筛选 RED 测试**

在 `test/model-picker.test.js` 使用 Node `assert` 固定以下输入和断言：

```js
const models = [
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", description: "Anthropic" },
  { id: "openai/gpt-5.6-codex", name: "GPT-5.6 Codex", description: "OpenAI reasoning" },
  { id: "legacy/model", name: "Legacy", description: "Local", unavailable: true }
];

assert.deepStrictEqual(filterModels(models, "sonnet").map(item => item.id), ["anthropic/claude-sonnet-4"]);
assert.deepStrictEqual(filterModels(models, "OPENAI/GPT").map(item => item.id), ["openai/gpt-5.6-codex"]);
assert.deepStrictEqual(filterModels(models, "reasoning").map(item => item.id), ["openai/gpt-5.6-codex"]);
assert.deepStrictEqual(filterModels(models, "").map(item => item.id), models.map(item => item.id));
assert.deepStrictEqual(filterModels(models, "missing"), []);
```

同时断言源数组和对象没有被修改。

- [ ] **步骤 2：编写焦点 RED 测试**

固定断言 `nextSelectableIndex` 跳过 `unavailable`、支持首尾循环、无可选项返回 `-1`：

```js
assert.strictEqual(nextSelectableIndex(models, 0, 1), 1);
assert.strictEqual(nextSelectableIndex(models, 1, 1), 0);
assert.strictEqual(nextSelectableIndex(models, 0, -1), 1);
assert.strictEqual(nextSelectableIndex([{ id: "x", unavailable: true }], 0, 1), -1);
```

- [ ] **步骤 3：编写几何 RED 测试**

覆盖以下精确场景：

- 控件 `{ top: 200, bottom: 240, left: 20, width: 300 }`、viewport `400 x 600`、content `88`：`direction === "down"`、`top === 240`、`maxHeight === 88`。
- 控件 `{ top: 420, bottom: 460 }`、viewport 高 `600`、content `250`：下方不足、上方足够，`direction === "up"`、`top === 170`。
- 上下均不足且上方更大：选 `up`，`maxHeight === spaceAbove`，`top === margin`。
- 上下均不足且下方更大：选 `down`，`top === triggerRect.bottom`，`maxHeight === spaceBelow`。
- 左侧越界和右侧越界分别夹到 margin；宽控件被夹到 viewport 安全宽度。
- 模拟筛选后 `contentHeight` 从 `250` 降到 `44`，同一 trigger 从 `up` 改为 `down`。

- [ ] **步骤 4：运行并确认 RED**

运行：`node test/model-picker.test.js`

预期：`FAIL`，原因仅为 `media/model-picker.js` 或三个导出尚不存在，不得是测试语法或路径错误。

- [ ] **步骤 5：实现最小纯函数模块**

`media/model-picker.js` 使用 IIFE/UMD 形态：浏览器设置 `globalThis.HermesModelPicker`，Node 设置 `module.exports`。匹配文本固定拼接 `name`、`id`、`description` 后做 `toLocaleLowerCase()` 包含匹配；不得读取 DOM、`state`、`vscode` 或环境变量。

- [ ] **步骤 6：纳入仓库脚本**

在 `package.json` 做且只做两处追加：

- `lint` 在 `media/main.js` 前增加 `node --check media/model-picker.js`，并在测试检查段增加 `node --check test/model-picker.test.js`。
- `test:unit` 在 `node test/model-settings.test.js` 后增加 `node test/model-picker.test.js`。

不得改变 `test`、`package`、`prepublishOnly` 或 dependency 字段。

- [ ] **步骤 7：运行 GREEN 与语法检查**

运行：

```bash
node test/model-picker.test.js
node --check media/model-picker.js
node --check test/model-picker.test.js
```

预期：全部退出码 `0`，测试逐项输出 `ok - ...`。

---

### 任务 2：接入 editable combobox 与 Webview-root Portal

**验收：** `AC-MODEL-COMBOBOX-01`、`AC-MODEL-SELECT-01`、`AC-MODEL-CANCEL-01`、`AC-MODE-ISOLATION-01`
**依赖：** 任务 1 的 `globalThis.HermesModelPicker`
**文件：**

- 修改：`extension.js:html(webview)`
- 修改：`media/main.js:state`
- 修改：`media/main.js:renderPopovers()`
- 修改：`media/main.js:bind()`
- 修改：`media/main.js` 的全局 outside-click handler
- 修改：`media/main.js:focusModelOption()`、`selectModel()`
- 修改：`test/webview-contract.test.js`
- 修改：`test/extension-contract.test.js`

**接口：**

- 输入：任务 1 三个 helper；现有 `state.models`、`state.settings.model`、`settingsChanged()`
- 输出：`openModelPicker()`、`closeModelPicker({ restoreFocus = false })`、`renderModelOverlay()`、`positionOpenPicker()`；现有后端消息 schema 不变

**并行边界：** 与任务 3 都写 `media/main.js` 和 `test/webview-contract.test.js`，必须串行。先完成行为和 DOM，再由任务 3 完成布局 CSS。
**风险与回滚：** 最大风险是 full `render()` 重建 input 导致输入、选区或焦点丢失，以及 Portal 点击被全局 outside-click 当成设置弹窗外点击。触发任一问题时回滚任务 2 的 DOM 接入，不得通过延时器或重复发送设置消息规避。无持久化 schema 变化。

- [ ] **步骤 1：为辅助脚本加载顺序编写 RED**

在 `test/extension-contract.test.js` 断言 `html(webview)`：

- 创建 `media/model-picker.js` 的 Webview URI。
- HTML 中 `model-picker.js` script 位于 `main.js` script 之前。
- CSP 仍使用原 nonce，不增加 `unsafe-inline` 或 `unsafe-eval`。

运行：`node test/extension-contract.test.js`

预期：仅新增的 helper script 断言失败。

- [ ] **步骤 2：为 combobox 和 Portal 编写 RED**

在 `test/webview-contract.test.js` 替换旧的“fixed frame”断言并增加以下契约：

- Model 使用唯一的 `input#modelPickerInput[role="combobox"]`，包含 `aria-autocomplete="list"`、`aria-controls="modelList"`、动态 `aria-expanded`。
- `media/main.js` 不存在第二个 model search input、`modelSearch` ID 或 list 内搜索框。
- `ensureSettingsOverlayRoot()` 将唯一 `#settingsOverlayRoot` 追加到 `document.body`，Model/Effort list 不再由 `renderPopovers()` 嵌套在 `#modePopover` 内。
- Model 打开时把已提交模型名称写入 input、调用 `input.select()`、完整显示列表并高亮当前模型。
- input `input` 事件只更新 `state.modelQuery` 和 overlay，不调用 `settingsChanged()` 或 `vscode.postMessage()`。
- `ArrowUp`/`ArrowDown` 调用 `nextSelectableIndex`；`Enter` 只对可用高亮项调用现有 `selectModel`；`Escape` 调用关闭恢复流程。
- `closeModelPicker()` 清除临时 query/filter/focus 状态并从 `state.settings.model` 恢复显示，不调用 `settingsChanged()`。
- 点击 overlay option 不会先触发 outside dismiss；点击 `.popover`、`#settingsOverlayRoot`、`#modeBtn` 以外才关闭设置。
- `selectModel()` 继续拒绝 `selected.unavailable`，并且每次成功选择只调用一次 `settingsChanged()`。
- `Manual`、`Auto` 数组顺序和两段现有英文说明保持原断言，不弱化为只检查字符串存在。

运行：`node test/webview-contract.test.js`

预期：新增 combobox/Portal 契约失败；既有审批、Diff、Working/Action 等断言仍通过到该失败点。

- [ ] **步骤 3：只增加 helper script 注入**

在 `extension.js:html(webview)`：

1. 新增 `modelPickerUri = ... "media", "model-picker.js"`。
2. 在 `markdown.js` 后、`main.js` 前插入带同一 nonce 的 `<script src="${modelPickerUri}">`。
3. 不修改 state 消息、`settingsChanged`、`refreshModels`、ACP 或 CSP 权限。

- [ ] **步骤 4：增加临时 UI state，保留提交 state**

在 `state` 新增三个临时字段，并把现有 `modelFocusIndex: 0` 初始值改为 `-1`：

```js
modelQuery: "",
modelFilterActive: false,
modelFocusIndex: -1,
modelPlacement: null
```

`state.settings.model` 继续是唯一已提交模型 ID。不得在输入期间覆盖它。

- [ ] **步骤 5：把 Model 按钮替换为同框 input combobox**

保持 `.model-field` 标签和 provider/description 显示，在同一个 `.model-combobox` 外框中放置：

- `input#modelPickerInput`：显示已提交模型 name 或临时 query。
- 现有模型 description/provider 的 `<small>`。
- 现有 16px chevron。

input 无可用模型时 disabled；不得新增额外搜索框。Mode 的 render block 不改字面内容和事件绑定。

- [ ] **步骤 6：实现打开、输入、键盘、提交和取消**

精确行为：

1. focus/click 调用 `openModelPicker()`；设置 open，`modelFilterActive = false`，query 为已提交模型展示名，focus index 指向已提交且可用模型，先显示完整列表，再对 input 执行 `focus()` 和 `select()`。
2. `input` 事件设置 `modelFilterActive = true`、`modelQuery = event.currentTarget.value`，用 `filterModels` 更新 overlay；不得 full `render()`。
3. query 无匹配时显示单一、不可 focus/不可点击的 `No matching models`。
4. Arrow 键仅在过滤结果中循环可用项并用 `scrollIntoView({ block: "nearest" })` 保持可见。
5. Enter 仅在 focus index 指向可用项时调用 `selectModel(id)`；没有可用 focus 时不动作。
6. Escape、outside click、关闭 Run Settings 调用 `closeModelPicker()`，恢复已提交模型 name/description，不 post message。
7. 点击 option 先 `preventDefault()`/`stopPropagation()`，不可用项只保留显示；可用项调用一次 `selectModel(id)`。

- [ ] **步骤 7：建立单一 body overlay root**

实现 `ensureSettingsOverlayRoot()`：若不存在则创建 `div#settingsOverlayRoot` 并直接追加到 `document.body`。`renderModelOverlay()` 和现有条件 Effort list 均写入该 root；关闭后清空对应 list，不删除 Run Settings DOM。

全局 outside-click 判断必须把 `#settingsOverlayRoot` 视为 Run Settings 交互区域。关闭 overlay 后 Mode DOM 和 `state.settings.mode` 不改变。

- [ ] **步骤 8：运行聚焦验证**

运行：

```bash
node test/model-picker.test.js
node test/webview-contract.test.js
node test/extension-contract.test.js
node --check media/main.js
node --check extension.js
```

预期：全部退出码 `0`；extension contract 仍证明 `settingsChanged` 使用既有 model-setting flow，Mode 仍使用 `Manual`/`Auto`。

---

### 任务 3：实现贴边定位和 Run Settings 自适应高度

**验收：** `AC-MODEL-ANCHOR-01`、`AC-MODEL-ANCHOR-02`、`AC-MODEL-ANCHOR-03`、`AC-RUN-HEIGHT-01`、`AC-RUN-HEIGHT-02`、`AC-MODE-ISOLATION-01`
**依赖：** 任务 2 的 overlay root、combobox DOM 和开关函数
**文件：**

- 修改：`media/main.js:renderModelOverlay()`、`positionOpenPicker()`、resize/scroll 监听、Refresh handler
- 修改：`media/styles.css:#modePopover`、`.mode-panel`、`.mode-panel-content`、`.model-combobox`、`.model-list`、`.effort-list`
- 修改：`test/webview-contract.test.js`

**接口：**

- 输入：`calculateOverlayPlacement()`、`input.getBoundingClientRect()`、list `scrollHeight`、`window.innerWidth/innerHeight`
- 输出：overlay inline style `{ top, left, width, maxHeight }` 和 class `opens-up|opens-down`

**并行边界：** 必须在任务 2 后串行执行；任务 4 只读执行测试，不与本任务并行写文件。
**风险与回滚：** 固定定位若在 viewport resize、central scroll 或筛选后未重算，会再次遮挡 Model。触发时回滚本任务 CSS/position handler 到任务 2 状态，不能恢复旧 `bottom: 50px` 作为临时修复。无不可逆操作。

- [ ] **步骤 1：编写定位和高度 RED 契约**

在 `test/webview-contract.test.js` 增加精确断言：

- `positionOpenPicker()` 从 `#modelPickerInput`/Effort trigger 读取 `getBoundingClientRect()`，从 overlay list 读取 `scrollHeight`，调用 `calculateOverlayPlacement()`。
- 打开、过滤结果变化、window resize、capture scroll 时均调用 reposition。
- overlay 使用 `position: fixed`，不再出现旧 `.model-list, .effort-list { left: 6px; right: 6px; bottom: 50px; ... }`。
- `.opens-down` 与控件下边缘相连，`.opens-up` 与控件上边缘相连；不得使用 margin/gap 分离。
- `#modePopover` 不含固定 `height: min(468px, ...)`，但保留 viewport `max-height`。
- `#modePopover.open` 为 header + natural body；`.mode-panel` 为 central content + Refresh footer；仅 central content 在超高时滚动。
- Effort 条件 false 时不渲染 `.effort-field`、`.effort-list`，也无固定占位或 min-height；条件 true 时只多实际 Effort row。
- Refresh handler 在 post 前执行 `closeModelPicker()`、关闭 Effort，并清理临时 query/placement。

运行：`node test/webview-contract.test.js`

预期：定位与自适应高度新断言失败，任务 2 的 combobox 契约保持通过。

- [ ] **步骤 2：实现每次测量后的贴边定位**

`renderModelOverlay()` 先渲染过滤结果，再在同一帧 `requestAnimationFrame(positionOpenPicker)`。`positionOpenPicker()`：

1. 读取当前 trigger rect 与 list `scrollHeight`。
2. 调用任务 1 helper，传 `maxListHeight: 250`、`margin: 8`。
3. 设置 list `top/left/width/maxHeight` 像素值。
4. 根据 direction 切换 `opens-up`/`opens-down`，不得对 `#modePopover` 写高度。
5. Model trigger 已离开 viewport、Run Settings 已关闭或 overlay 已关闭时立即 close，不保留孤立浮层。

- [ ] **步骤 3：绑定重定位时机**

- 输入筛选每次重绘 list 后重算。
- `window.resize` 在现有 composer resize handler 内追加一次 `positionOpenPicker()`，不新建重复 resize handler。
- `document` capture scroll 只在 Model/Effort overlay open 时重算，不影响现有 conversation scroll state。
- Run Settings 中央内容滚动时通过同一个 capture handler重算。
- Effort capability/state 改变触发 full render 时，先关闭已失效 Effort overlay，再按当前 Model open state重建/定位。

- [ ] **步骤 4：移除固定高度和旧裁剪依赖**

CSS 目标结构：

- `#modePopover` 保留当前 width、right、border、shadow，删除普通态固定 height；使用 `max-height: calc(100vh - 96px)`。
- `#modePopover.open` 使用自然高度，同时把最大高度约束传给 `.mode-panel`。
- `.mode-panel` 使用 `display: grid; grid-template-rows: minmax(0, auto) auto; max-height: calc(100vh - 138px)`。
- `.mode-panel-content` 仅在内容超过最大高度时 `overflow-y: auto`；无 Effort 时自然结束在 Model 后。
- `.model-refresh-row` 保持现有文案、按钮行为和固定 footer 视觉，不随 list 打开移动。
- `#settingsOverlayRoot` 为 `position: fixed; inset: 0; pointer-events: none; z-index` 高于 Run Settings；list 本身恢复 `pointer-events: auto`。
- `.model-list`/`.effort-list` 为 `position: fixed; overflow-y: auto`，宽高由 JS inline style 提供；删除 `left: 6px`、`right: 6px`、`bottom: 50px` 和基于父容器百分比的 max-height。
- 下开时 list 顶部圆角与 trigger 底部圆角形成连体面；上开时反向处理；两者之间不得有 margin。
- 不修改 `.approval-option`、`.mode-picker` 或 Mode 文案样式规则。

- [ ] **步骤 5：确保 Effort 缺失时无空白**

只依赖现有条件 render：`state.settings.reasoningEffortSupported ? effort field : ""`。不得新增 placeholder、隐藏占位 div、固定最小内容高度或 upgrade copy。支持时 Effort row 继续位于 Model 与 Refresh 之间，并复用 overlay root；不改六档选项和 per-model memory。

- [ ] **步骤 6：确保 Refresh 回到初始 Run Settings 状态**

Refresh click 的顺序固定为：

1. refreshing 时原样 return。
2. `closeModelPicker()`，清空 query/filter/focus/placement。
3. 关闭 Effort overlay 并清理其 focus。
4. 设置 refresh status。
5. 发送一次 `{ type: "refreshModels" }`。
6. render 后只显示 Run Settings 主弹窗，不自动重开任何 list。

- [ ] **步骤 7：运行聚焦验证**

运行：

```bash
node test/model-picker.test.js
node test/webview-contract.test.js
node test/extension-contract.test.js
git diff --check
```

预期：全部退出码 `0`；`git diff --check` 无空白错误。

---

### 任务 4：执行完整回归并核对变更边界

**验收：** 全部验收 ID，重点 `AC-ISOLATION-01`、`AC-MODE-ISOLATION-01`
**依赖：** 任务 1、2、3 全部完成
**文件：**

- 不新增生产文件
- 必要时只修正本计划已列测试或实现文件中的回归

**接口：**

- 输入：完成后的工作树
- 输出：可复现的测试结果与边界审计结果

**并行边界：** 串行执行，避免测试过程中工作树继续变化。若发现当前任务之外的意外文件变化，立即停止并向用户确认。
**风险与回滚：** Electron smoke 在当前环境可能在 unit tests 全通过后以 `SIGABRT` 退出；必须把它作为环境/集成结果单独报告，不能把 unit 成功写成 smoke 成功，也不能为绕过 `SIGABRT` 修改产品代码。回滚按任务逆序撤销本计划产生的 hunks，保留执行前已有改动。

- [ ] **步骤 1：运行三个聚焦测试**

运行：

```bash
node test/model-picker.test.js
node test/webview-contract.test.js
node test/extension-contract.test.js
```

预期：全部 PASS。覆盖筛选字段、少量下开、大量上开、空间不足限高、筛选后换向、no-match、Escape/outside 恢复、click/Enter 单次提交、Unavailable 拒绝、Refresh 清理、Effort 有无高度和 Mode 不变。

- [ ] **步骤 2：运行静态检查和完整 unit**

运行：

```bash
npm run lint
npm run test:unit
```

预期：全部退出码 `0`。现有 approval、Diff、Working、Action、Queue、Stop、command、final-answer、ACP、model refresh 测试不得删除、跳过或弱化。

- [ ] **步骤 3：运行完整 npm test 并分离 smoke 结果**

运行：`npm test`

预期：unit 阶段全部 PASS；Electron smoke 若正常则整体退出码 `0`。若在已知环境中以 `SIGABRT` 退出，记录“unit PASS / smoke SIGABRT”，保留 stderr 和退出码，不修改代码宣称通过。

- [ ] **步骤 4：执行 diff 边界审计**

运行：

```bash
git diff --check
git status --short
git diff -- extension.js media/model-picker.js media/main.js media/styles.css package.json package-lock.json test/model-picker.test.js test/webview-contract.test.js test/extension-contract.test.js
```

预期：

- 无 whitespace error。
- 本计划新增/修改仅限文件映射所列路径。
- `extension.js` 只有 helper script 注入相关 hunk；若出现 ACP、permission、Diff、Queue、Stop、renderer 或 settings backend hunk，判定越界并撤销本计划对应 hunk。
- Mode render block和 click handler保持原文或行为等价；Manual/Auto 契约测试未弱化。
- `package.json` 仅追加新 lint/test 项，无版本、依赖或 package script 语义变化。
- 执行前已有的 diff/ACP/V4A 等未提交改动仍被保留。

- [ ] **步骤 5：按场景记录人工 Webview 验收结果**

仅在可启动 VS Code Extension Host 时执行；不能启动则明确标记未验证，不用静态测试替代人工结论：

1. 1–2 个结果时 list 贴 Model 下边缘，Model 控件仍可见。
2. 多结果且下方不足时 list 贴 Model 上边缘，可临时覆盖 Mode，但关闭后 Mode 完整恢复。
3. 直接在 Model control 输入，边输入边筛选，无第二搜索框。
4. Escape/outside 不改变已提交 model；click/Enter 改变一次。
5. Resize 和中央 scroll 后 list 仍贴边且不越过 viewport。
6. 当前 Hermes 不支持 Effort 时，结构为 `Header → Mode → Model → Refresh`，无空白。
7. 模拟/连接支持 capability 的 Hermes 时，结构只增加实际 Effort row，六档与按模型记忆保持不变。
8. Refresh 立即收起 Model/Effort overlay，刷新中不保留旧 hover/open 状态。
9. Manual/Auto 可见、顺序正确、文案与点击结果不变。

## 验收覆盖矩阵

| 验收 ID | 实现任务 | 自动验证 | 人工验证 |
| --- | --- | --- | --- |
| `AC-MODEL-COMBOBOX-01` | 1、2 | `model-picker.test.js`、`webview-contract.test.js` | 场景 3 |
| `AC-MODEL-ANCHOR-01` | 1、3 | 几何测试、CSS/调用契约 | 场景 1 |
| `AC-MODEL-ANCHOR-02` | 1、3 | 几何测试、CSS/调用契约 | 场景 2 |
| `AC-MODEL-ANCHOR-03` | 1、3 | viewport clamp 测试 | 场景 5 |
| `AC-MODEL-SELECT-01` | 2 | click/Enter 与单次 `settingsChanged` 契约 | 场景 4 |
| `AC-MODEL-CANCEL-01` | 2 | close 不发送设置契约 | 场景 4 |
| `AC-RUN-HEIGHT-01` | 3 | capability false DOM/CSS 契约 | 场景 6 |
| `AC-RUN-HEIGHT-02` | 3 | capability true DOM/CSS 契约 | 场景 7 |
| `AC-ISOLATION-01` | 4 | `npm run test:unit`、`npm test` | 场景 8 |
| `AC-MODE-ISOLATION-01` | 2、3、4 | 强化 Manual/Auto 契约 | 场景 2、9 |

## 回滚方案

出现以下任一情况即触发回滚：输入时发送设置请求、Model 被 list 遮挡、list 越出 Webview viewport、Escape/outside 改变 model、无 Effort 仍留空白、Mode 行为/文案变化、Refresh/审批/Diff/Agent 回归。

回滚顺序：

1. 停止测试或 Extension Host，不删除用户文件。
2. 仅撤销本计划在 `media/styles.css` 和 `media/main.js` 的对应 hunks，恢复执行前工作树内容。
3. 撤销 `extension.js` 的 `model-picker.js` script 注入 hunk。
4. 删除本计划新建的 `media/model-picker.js`、`test/model-picker.test.js`，并撤销 `package.json`/`package-lock.json` 的对应脚本 hunk。
5. 重新运行执行前已有的 `npm run lint`、`npm run test:unit`，确认原工作树能力未被破坏。

不得使用 `git reset --hard`、`git checkout --`、整文件覆盖或删除执行前已有未提交改动。该计划没有数据库迁移、用户数据迁移、外部 Hermes 修改或其他不可逆边界。
