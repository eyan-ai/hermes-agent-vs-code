# V4A 预览投影实施计划

**Spec 引用：** `docs/prds/hermes-acp-v4a-diff-contract/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-17 confirmed；D-01 至 D-05、D-09；真实 Permission payload 探针
**目标：** 单文件 V4A `Update File` 在插件原文档预览中使用真实候选正文，不修改原始 Permission request 或 Hermes Python。
**架构：** 新增纯 JavaScript 预览投影模块，严格识别目标 payload，在内存中应用单文件多 hunk Patch。Extension 只把成功投影交给原文档预览，审批和 Agent 通道仍持有原请求。
**技术栈：** Node.js CommonJS、VS Code Extension API、`assert` 测试
**验收：** AC-01 至 AC-08A、AC-11、AC-12、AC-14
**执行环境：** 当前嵌套 Git 仓库；Node `v22.22.3`；基线 `npm run test:unit` 通过；不得写入 `/Users/eyan/.hermes/hermes-agent`

## 全局约束

- 只支持单个 `Update File`，允许一个或多个 hunk；Add/Delete/Move、多文件和多个 Diff block 不新增行为。
- 不新增依赖，不修改 ACP 协议、Hermes Python、Webview DOM、Permission controls 或 Agent renderer。
- 失败关闭只用于已明确命中目标 V4A 形状但候选无法可靠生成的情况；非目标 payload 继续走基线。
- 原始 request、Diff block、`rawInput`、IDs 和 options 不得被原地修改。

---

## 文件结构

- 新建：`lib/v4a-preview.js`，纯函数识别 payload、解析 V4A Update、生成候选正文。
- 新建：`test/v4a-preview.test.js`，目标形状、候选结果和失败关闭测试。
- 新建：`test/v4a-hermes-oracle.py`，只读导入 Hermes `0.18.2` parser，以内存 file ops 校验 fixture expected。
- 修改：`extension.js` 的 ACP Permission handler、`presentNextPermission`、`showDocDiff`，接入预览专用投影。
- 修改：`test/extension-contract.test.js`，证明原请求与审批/Agent 通道隔离。
- 修改：`package.json` 的 `lint` 和 `test:unit`，纳入新模块和测试。

### 任务 1：建立 V4A payload 投影契约

**验收：** AC-01 至 AC-04、AC-07、AC-08、AC-08A
**依赖：** 无
**文件：**

- 新建：`test/v4a-preview.test.js`
- 新建：`lib/v4a-preview.js`
- 修改：`package.json:scripts.lint`、`package.json:scripts.test:unit`

**接口：**

- 输入：`projectV4aUpdatePreview(toolCall)`，其中 `toolCall.content` 和 `toolCall.rawInput` 来自原始 Permission request。
- 输出：`{ kind: "not-applicable" }`、`{ kind: "invalid", reason }` 或 `{ kind: "ready", diff: { path, oldText, newText } }`。
- 保证：函数不修改输入对象；`ready.newText` 不含 V4A 控制行。

**并行边界：** 必须先完成，任务 2 依赖该稳定输出。
**风险与回滚：** 若解析结果与 Hermes 不一致，删除新模块和对应测试即可回到基线；不得放宽到模糊匹配。

- [ ] 编写正向失败测试：单 hunk、多 hunk、中文路径/正文、文件首尾、纯增删、LF/CRLF、无末尾换行。
- [ ] 编写负向失败测试：tool/mode 不符、`rawInput` 缺失、多个 Diff block、Add/Delete/Move、多文件、路径不一致、`newText` 不等于 Patch body。
- [ ] 编写歧义失败测试：重复上下文、缺失上下文、重叠或乱序 hunk、Patch 结构不完整。
- [ ] 运行 `node test/v4a-preview.test.js`，预期因模块或目标行为缺失而 `FAIL`，不是语法或 fixture 错误。
- [ ] 实现严格的 `projectV4aUpdatePreview(toolCall)`；所有 Patch 作用只发生在字符串内存中。
- [ ] 冻结输入对象后运行正例，证明无原地修改；运行 `node test/v4a-preview.test.js`，预期 `PASS`。
- [ ] 将新文件加入 `lint` 和 `test:unit`；运行 `npm run lint`，预期全部语法检查通过。

### 任务 2：只把投影交给原文档预览

**验收：** AC-01、AC-02、AC-05、AC-07、AC-08A、AC-11、AC-12
**依赖：** 任务 1 的 `projectV4aUpdatePreview`
**文件：**

- 修改：`extension.js:onPermissionRequest`
- 修改：`extension.js:presentNextPermission`
- 修改：`extension.js:showDocDiff`
- 修改：`test/extension-contract.test.js`

**接口：**

- 输入：原始 `pending.request`、原始 `pending.diff(s)` 和只读 `pending.previewProjection`。
- 输出：打开目标文档时，`showDocDiff` 使用 `previewProjection.diff`；未打开文档、非目标 payload 和原始审批/Agent 通道使用原值。
- 失败：目标文档已在 Editor tab 中且投影为 `invalid` 时，不入 Permission queue、不创建错误 Diff，直接对原 request 返回既有 `cancelled` outcome；未打开文档保持基线。

**并行边界：** 与任务 1 串行；不触碰 `media/main.js` 或 ACP renderer。
**风险与回滚：** 若 request identity、Permission UI 或 Agent fixture 改变，撤回 extension 接入，保留纯模块测试定位问题。

- [ ] 在契约测试中先断言：原 request 深度不变、预览投影与 `pending.diff` 分离、非目标路径不读取投影、失败不自动 Allow。
- [ ] 运行 `node test/extension-contract.test.js`，预期目标新断言 `FAIL`。
- [ ] 在 Permission handler 中用现有 `diffUri` 和 Editor tab 状态决定是否启用投影；仅把结果存入新建的 `pending.previewProjection`，不替换 `pending.diff(s)`。
- [ ] `ready` 只在 `sourceEditor` 存在的 inline preview 分支替换 `prepareDocumentReviewBatch` 的预览输入；该分支不得回写 `pending.diff`。
- [ ] `invalid` 且目标 Editor tab 已打开时，不把 request 放入 queue，调用 `client.respond(request.id, { outcome: { outcome: "cancelled" } })` 后返回；不得自动 Allow、发布 `/deny` 或创建 Agent 消息。
- [ ] 运行 `node test/v4a-preview.test.js && node test/extension-contract.test.js`，预期 `PASS`。
- [ ] 重放 `test/acp-render.test.js`、`test/session-cancellation-barrier.test.js`、`test/turn-lifecycle.test.js`，预期 Working/答案、拒绝屏障和 late event 全部 `PASS`。

### 任务 3：建立 Hermes 结果一致性 fixture

**验收：** AC-03、AC-06、AC-14
**依赖：** 任务 1、2
**文件：**

- 新建：`test/fixtures/v4a-update-cases.json`
- 新建：`test/v4a-hermes-oracle.py`
- 修改：`test/v4a-preview.test.js`

**接口：**

- 输入：每个 fixture 包含 `path`、`source`、`patch`、由 Hermes `0.18.2` 得到的 `expected`。
- 输出：插件投影的 `newText` 与 `expected` 使用 `strictEqual` 逐字节比较。

**并行边界：** fixture 固化后才可进入紧密 Diff 实施。
**风险与回滚：** 若当前 Hermes 环境无法执行 oracle，只记录为集成阻塞，不手工猜测 expected。

- [ ] 编写 fixture 的 `source/patch/expected`，覆盖单 hunk、多 hunk、中文、首尾、无末尾换行和增删不等。
- [ ] `test/v4a-hermes-oracle.py` 使用 `/Users/eyan/.hermes/hermes-agent/tools/patch_parser.py` 的 `parse_v4a_patch` 与 `apply_v4a_operations`，以内存 file ops 应用每个 fixture，并严格比较写入内容与 `expected`；不得写 Hermes checkout 或用户文件。
- [ ] 运行 `PYTHONPATH=/Users/eyan/.hermes/hermes-agent /Users/eyan/.hermes/hermes-agent/venv/bin/python test/v4a-hermes-oracle.py`，预期全部 oracle case `PASS`。
- [ ] 将同一 fixture 加入插件纯测试并运行 `node test/v4a-preview.test.js`，预期全部逐字节 `PASS`。
- [ ] 运行 `npm run test:unit`，预期现有基线和新增 V4A 契约全部通过。
