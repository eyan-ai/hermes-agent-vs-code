# 集成回归与 0.2.54 打包实施计划

**Spec 引用：** `docs/prds/hermes-acp-diff-model-refresh/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-19 confirmed；V5 兼容边界；用户确认新版本 `0.2.54`
**目标：** 证明核心 VSIX 在旧/新 Hermes 上可用并产出独立 `0.2.54` VSIX
**架构：** 先分别完成插件和 Adapter 聚焦测试，再用 fake ACP response 覆盖 capability on/off、模型切换和 Refresh 收起状态，最后升级版本并打包校验。
**技术栈：** npm、VSCE、Python test runner、unzip、SHA-256
**验收：** `AC-DIFF-SAFETY-01`、`AC-ACP-COMPAT-01`、`AC-PACKAGE-01`
**执行环境：** 依赖计划 01-04 全部完成；不发布 Marketplace；不覆盖 `0.2.52` 或 `0.2.53`

## 全局约束

- 新产物：`hermes-agent-vscode-0.2.54.vsix`。
- 保留 `hermes-agent-vscode-0.2.52.vsix` 和 `hermes-agent-vscode-0.2.53.vsix`。
- README 包内外 SHA-256 必须一致。
- 旧 Hermes capability 缺失时只隐藏 Effort；Diff、Model、Refresh、审批和 Agent 回显测试必须通过。

---

### 任务 1：兼容矩阵与全量回归

**接口：** fake ACP session responses：无 configOptions、reasoning model 含 config option、non-reasoning model 无 config option、设置成功、设置拒绝
**风险与回滚：** smoke 环境若 SIGABRT，必须单独记录，不能伪报 npm test 全绿

- [ ] 运行插件 `npm run lint`，预期 PASS。
- [ ] 运行插件 `npm run test:unit`，预期 PASS。
- [ ] 运行插件 `npm test`，记录 unit 与 Electron smoke 的独立结果。
- [ ] 运行 Hermes `scripts/run_tests.sh tests/acp/`，预期 PASS。
- [ ] 审读两个仓库最终 Diff，确认无全局 Hermes config 写入、无安装目录写入、无审批/回显旁路。

### 任务 2：版本与打包

**接口：** `package.json`、`package-lock.json`、ACP clientInfo 均为 `0.2.54`
**风险与回滚：** 任一归档或哈希校验失败则删除失败产物并保持源码，不覆盖旧包

- [ ] 更新三处版本并运行 `npm run lint && npm run test:unit`。
- [ ] 运行 `./node_modules/.bin/vsce package --no-dependencies --no-rewrite-relative-links --out hermes-agent-vscode-0.2.54.vsix`。
- [ ] 运行 `unzip -t hermes-agent-vscode-0.2.54.vsix`，预期无错误。
- [ ] 比较源 `README.md` 与包内 `extension/readme.md` SHA-256，预期一致。
- [ ] 解包读取 `extension/package.json`，预期版本 `0.2.54`。
- [ ] 确认 `hermes-agent-vscode-0.2.52.vsix` 与 `hermes-agent-vscode-0.2.53.vsix` 仍存在，并输出新包绝对路径与 SHA-256。
