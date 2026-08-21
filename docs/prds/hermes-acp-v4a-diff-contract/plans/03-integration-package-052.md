# ACP 集成与 0.2.52 打包实施计划

**Spec 引用：** `docs/prds/hermes-acp-v4a-diff-contract/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-17 confirmed；D-10；五层验证门禁
**目标：** 以真实 ACP 和打包后 VSIX 证明两项修复有效，并交付不覆盖 `0.2.51` 的 `0.2.52` 本地包。
**架构：** 在代码和回归全部通过后更新版本元数据；用真实 ACP payload 和 VS Code UI 验证行为；最后打包并检查 archive 身份、完整性和哈希。
**技术栈：** npm、Node.js、Hermes ACP、VS Code Extension Host、VSIX/ZIP、SHA-256
**验收：** AC-02、AC-05、AC-06、AC-09 至 AC-14
**执行环境：** 依赖 Plans 01、02 全部通过；分支 `main`、基线 revision `05c3046`；不发布 Marketplace；保留 `hermes-agent-vscode-0.2.51.vsix`；真实 VS Code GUI 启动受运行时授权约束

## 全局约束

- 真实 GUI/ACP 证据与单元测试分开报告；缺少 GUI 证据时不得声称完整解决。
- README 不做任务外改写；包内 README 与源码使用哈希证明身份。
- 不修改、删除、重命名或覆盖 `0.2.51`。

---

## 文件结构

- 修改：`package.json`、`package-lock.json`，版本更新为 `0.2.52`。
- 修改：`extension.js` 初始化 client version，从当前旧值同步到 `0.2.52`。
- 生成：`hermes-agent-vscode-0.2.52.vsix`，来源为验证通过的工作区。
- 证据：命令输出、包清单、README/源码哈希、archive 完整性和 SHA-256。

### 任务 1：完整静态与回归门禁

**验收：** AC-07、AC-10 至 AC-12
**依赖：** Plans 01、02
**文件：** 当前全部任务相关源码和测试

**接口：** 输入为最终源码 Diff；输出为无格式错误、无测试失败的候选 revision。
**并行边界：** 必须在版本和打包前完成。
**风险与回滚：** 任一失败即停止，不通过删测试、放宽断言或修改范围外生命周期代码绕过。

- [ ] 运行 `git diff --check`，预期无输出且退出 0。
- [ ] 运行 `npm run lint`，预期退出 0。
- [ ] 运行 `npm run test:unit`，预期全部通过。
- [ ] 运行 `npm test`，预期单元和 smoke 全部通过。
- [ ] 审读最终 Diff，确认生产修改仅限插件 V4A 预览、inline Diff 生命周期和版本元数据。

### 任务 2：真实 ACP 与打包后 UI 验证

**验收：** AC-02、AC-05、AC-06、AC-09 至 AC-12
**依赖：** 任务 1
**文件：** 不新增生产文件；使用受控临时工作区和真实 `hermes acp`

**接口：** 输入为真实单文件 V4A Permission；输出为原文、候选、最终文件和 UI 证据。
**并行边界：** 必须串行验证 Deny 后再验证 Allow，避免共享文件状态污染。
**风险与回滚：** 使用临时 fixture；任何文件状态不一致立即停止并保留证据，不触碰用户文档。

- [ ] 运行 `npm run package -- --out /private/tmp/hermes-agent-vscode-0.2.52-candidate.vsix` 生成待测包后，使用 VS Code 的 `--install-extension` 安装该绝对路径；该 GUI/安装动作若触发沙箱授权，必须先取得授权。
- [ ] 单 hunk、多 hunk、中文正文分别捕获真实 Permission，确认 request 形状匹配且插件候选无控制文本。
- [ ] Deny：确认目标文件逐字节不变，Pending/队列/Agent 回显符合基线。
- [ ] Allow：确认最终文件与审批候选逐字节一致且只应用一次。
- [ ] 在 VS Code 中验证等量、不等量、纯增删和相隔 hunk 的紧密排列。
- [ ] 验证小范围单行、标准全文候选、新文件、未打开文件 Review、Stop、反馈和重新打开未退化。

### 任务 3：版本与 VSIX 产物

**验收：** AC-13、AC-14
**依赖：** 任务 1、2 全部通过
**文件：**

- 修改：`package.json:version`
- 修改：`package-lock.json` 根版本和 `packages[""]` 版本
- 修改：`extension.js` ACP `clientInfo.version`
- 生成：`hermes-agent-vscode-0.2.52.vsix`

**接口：** 输入为已验证源码；输出为可安装 VSIX、绝对路径和 SHA-256。
**并行边界：** 最后执行，避免测试后再改代码。
**风险与回滚：** 若包校验失败，保留 `0.2.51`，修复后重新生成 `0.2.52`；不发布 Marketplace。

- [ ] 更新三个版本来源为 `0.2.52`，运行 `rg -n '0\\.2\\.(50|51|52)' package.json package-lock.json extension.js`，确认运行时和元数据一致，历史文档不批量改写。
- [ ] 记录打包前 `0.2.51` 文件身份和 README 哈希。
- [ ] 运行 `npm run package -- --out hermes-agent-vscode-0.2.52.vsix`，预期生成新文件且不修改旧包。
- [ ] 检查包内 `extension/package.json` 版本、任务源码、README 和资源；运行 archive 完整性检查，预期无错误。
- [ ] 比较源码与包内 README/任务源码哈希，预期一致；检查 `0.2.51` 身份保持不变。
- [ ] 计算并报告 `hermes-agent-vscode-0.2.52.vsix` 的 SHA-256 和稳定绝对路径。
- [ ] 安装最终 VSIX 重复关键 UI smoke；只有结果通过才宣告交付完成。
