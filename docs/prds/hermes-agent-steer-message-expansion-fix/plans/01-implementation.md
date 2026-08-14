# Hermes Steer 去重与长消息展开实施计划

**Spec 引用：** `docs/prds/hermes-agent-steer-message-expansion-fix/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-11 用户确认；设计提交 `369335a`
**目标：** 单次 Queue Steer 只产生一条消息，长用户消息可持久展开和主动收起，Todo 使用细线箭头，未打开或缺失文档可安全预览，关联状态色统一到 composer accent。
**架构：** Webview 侧修正事件绑定生命周期并用 `message.id` 保存展开状态；Extension Provider 侧增加 Queue in-flight 保护，并按打开文档、文件系统文件、缺失文件三种来源生成与校验 Diff 快照。Todo 使用独立 SVG，相关交互色复用 `--ha-accent`。
**技术栈：** JavaScript、VS Code Webview、Node `assert`、Playwright、VS Code Extension Host smoke tests。
**验收：** `AC-01` 至 `AC-15`
**执行环境：** 当前脏工作树；只修改本计划列出的文件，不重置、不清理、不覆盖无关改动；不新增依赖。

## 全局约束

- Queue Steer 是幂等操作，不使用时间防抖作为正确性保证。
- 展开状态只存在于 Webview 内存，不写入会话历史。
- Todo 箭头固定 `stroke-width="1.25"`，并与标签保持同一 flex 行垂直居中。
- 保留 Queue 编辑、删除、折叠、顺序、滚动和 `/steer` 现有语义。
- 保留用户消息现有颜色、右对齐、附件、Steered 标签和 Modify 行为。
- Diff 预览不提前创建或修改目标文件，Accept 后仍由 Hermes 执行真实写入。
- 不新增主题变量；命令 token 和 Todo 运行指示复用 `--ha-accent`。

---

## 任务 1：建立并修复 Queue Steer 精确一次语义

**覆盖验收：** `AC-01`、`AC-02`、`AC-03`、`AC-09`

**修改文件：**

- `test/webview-visual-check.js`
- `test/extension-contract.test.js`
- `media/main.js`
- `extension.js`

**风险与回滚：** 若 Queue 重新渲染后按钮失效，恢复该任务 Diff，并保留失败测试定位绑定缺口；不得恢复重复绑定。

- [ ] **步骤 1：编写 Webview 失败测试**

  在 `test/webview-visual-check.js` 中连续调用三次 `window.__dispatchState()`，清空 `window.__messages`，点击 `queue-1` 的 Steer，然后断言 `type === "queueSteer" && id === "queue-1"` 的消息数量严格等于 `1`。

- [ ] **步骤 2：编写 Provider 守卫契约测试**

  在 `test/extension-contract.test.js` 中断言构造器初始化处理中集合，`steerQueuedPrompt()` 使用由 `sessionId` 和 `itemId` 组成的 key，在重复 key 时直接返回，并在 `finally` 删除 key。

- [ ] **步骤 3：运行并确认预期失败**

  运行：`node test/webview-visual-check.js`

  预期：失败，单击产生多条 `queueSteer` 消息。

  运行：`node test/extension-contract.test.js`

  预期：失败，当前不存在 Queue Steer 的 in-flight 集合和 `finally` 清理。

- [ ] **步骤 4：实施最小修复**

  - 删除 `renderLiveRegions()` 对未替换配件节点的额外 `bindAccessoryRegion()` 调用。
  - 让 `bindAccessoryRegion()` 对同一节点幂等；重新创建的节点仍绑定一次。
  - 在 `HermesSidebarProvider` 构造器添加 `this.steeringQueueItems = new Set()`。
  - `steerQueuedPrompt(itemId, sessionId)` 使用 `${sessionId}:${itemId}` 作为 key；已有 key 时返回；主体置于 `try`，清理置于 `finally`。
  - 保持成功后删除 Queue 项、失败时不伪造成功的现有逻辑。

- [ ] **步骤 5：运行聚焦测试**

  运行：`node test/extension-contract.test.js`

  运行：`node test/webview-visual-check.js`

  预期：两项均通过，一次点击仅有一条消息。

---

## 任务 2：恢复长用户消息展开和主动收起

**覆盖验收：** `AC-04`、`AC-05`、`AC-06`、`AC-07`、`AC-09`

**修改文件：**

- `test/fixtures/webview-harness.html`
- `test/webview-contract.test.js`
- `test/webview-visual-check.js`
- `media/main.js`
- `media/styles.css`

**风险与回滚：** 若展开点击干扰附件或 Modify，只回滚消息点击绑定与 CSS，不修改附件打开或 Modify 的既有处理器。

- [ ] **步骤 1：添加溢出消息 Fixture 和失败测试**

  - 在 Harness 中加入带稳定 `id`、足够超过 `76px` 的用户消息。
  - Chromium 测试断言初始 `.question-frame` 包含 `fade-overflow`；点击对应 `.bubble` 后高度增加、显示 `.question-collapse`。
  - 派发新的 Thinking/State 更新后断言同一消息仍为展开状态。
  - 点击 `.question-collapse` 后断言恢复折叠和渐隐。
  - 契约测试断言状态以 `message.id` 为 key，收起按钮阻止传播，CSS 存在展开和收起样式。

- [ ] **步骤 2：运行并确认预期失败**

  运行：`node test/webview-contract.test.js`

  运行：`node test/webview-visual-check.js`

  预期：失败，当前不存在展开状态、点击处理器和收起按钮。

- [ ] **步骤 3：实施状态和渲染**

  - 在 `state` 添加 `expandedUserMessages: {}`。
  - `renderUser()` 从 `message.id` 读取展开状态，给 frame/bubble 添加展开 class，并仅在展开时渲染 `.question-collapse`。
  - `updateQuestionOverflow()` 对展开 frame 不添加 fade，并为实际溢出的 bubble 标记可展开状态。
  - `bindConversationRegion()` 在点击 bubble 时忽略 `button`、`.attachment` 和链接；只有具有溢出标记时写入展开状态并调用 `renderLiveRegions()`。
  - 收起按钮使用 `stopPropagation()`，删除对应 message id 的展开状态并局部渲染。

- [ ] **步骤 4：实施样式**

  - `.question-frame.expanded` 使用 `max-height: none; overflow: visible; mask-image: none`。
  - 展开 bubble 为右下角按钮预留空间。
  - `.question-collapse` 使用现有语义颜色、透明背景和细线图标，不改变 bubble 的填充色及边框。

- [ ] **步骤 5：运行聚焦测试**

  运行：`node test/webview-contract.test.js`

  运行：`node test/webview-visual-check.js`

  预期：展开、跨刷新保持和主动收起全部通过。

---

## 任务 3：Todo 细线箭头与 accent 色统一

**覆盖验收：** `AC-08`、`AC-09`、`AC-14`、`AC-15`

**修改文件：**

- `media/main.js`
- `media/styles.css`
- `test/webview-contract.test.js`
- `test/webview-visual-check.js`

**风险与回滚：** 若图标尺寸导致胶囊位移，回滚专用图标的 viewBox/尺寸调整，保留固定 `1.25` 线宽和 flex 对齐要求。

- [ ] **步骤 1：添加失败断言**

  - 契约测试要求 Todo 使用独立 `todoChevron` SVG 且 `stroke-width="1.25"`。
  - CSS 契约要求 `.todos-chevron` 为 `inline-flex; align-items: center; justify-content: center`，内部 SVG 为 `display: block`。
  - Chromium 计算 Todo label 与 chevron 的垂直中心差，闭合和展开状态均小于 `1px`。

- [ ] **步骤 2：运行并确认预期失败**

  运行：`node test/webview-contract.test.js`

  预期：失败，当前 Todo 复用 `1.8` 线宽的共享图标。

- [ ] **步骤 3：实施专用图标和对齐**

  - 在 `icons` 添加 `todoChevron`，viewBox 为 `0 0 16 16`，路径保持当前方向，`stroke-width="1.25"`，`stroke-linecap="round"`，`stroke-linejoin="round"`。
  - `renderTodosCapsule()` 改用 `icons.todoChevron`。
  - `.todos-chevron` 使用固定 `12px` 盒子和 flex 居中；`.todos-chevron .icon` 使用 `display: block; width: 12px; height: 12px`。
  - 保持现有打开时旋转 `90deg`。
  - `.question-skill`、`.todos-spinner` 活动边和 `.todos-status.running` 使用 `var(--ha-accent)`。

---

## 任务 4：支持未打开和缺失文件的 Diff 预览

**覆盖验收：** `AC-10`、`AC-11`、`AC-12`、`AC-13`

**修改文件：** `extension.js`、`test/extension-contract.test.js`

**风险与回滚：** 任何无法证明源状态未变化的情况都必须拒绝 Accept；不得以创建空文件绕过预览失败。

- [ ] **步骤 1：添加失败契约测试**

  断言 `showDocDiff()` 区分打开文档、文件系统文件和缺失文件；缺失文件仅允许空 `oldText`；Accept 使用来源类型分别校验，预览阶段无 `writeFile`。

- [ ] **步骤 2：运行并确认预期失败**

  运行：`node test/extension-contract.test.js`

  预期：失败，当前直接 `openTextDocument(uri)` 且 Accept 强制重新打开源文件。

- [ ] **步骤 3：实施最小修复**

  新增文件不存在识别、Diff 源快照读取和 Accept 源状态校验方法；新文件用空源生成预览，已有未打开文件用 UTF-8 文件内容生成预览，预览与 Deny 均不写磁盘。

- [ ] **步骤 4：运行聚焦测试**

  运行：`node test/extension-contract.test.js`

  预期：通过。

---

## 任务 5：执行完整验证

- [ ] **步骤 1：执行完整验证**

  运行：`npm run lint`

  运行：`npm run test:unit`

  运行：`node test/webview-visual-check.js`

  运行：`git diff --check`

  运行：`npm test`

  预期：所有命令退出码为 `0`；Extension Host 冒烟测试保持 `13/13`；窄窗口无横向溢出。

## 回滚边界

- 所有生产修改均为内存状态、事件绑定和样式，未增加持久化字段或依赖。
- 回滚时按任务反向撤销对应生产 Diff；保留失败测试可复现原问题。
- 不执行 `git reset`、`git checkout --` 或清理当前工作树。
