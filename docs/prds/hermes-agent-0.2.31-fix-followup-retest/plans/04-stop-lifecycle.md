# Stop 生命周期实施计划

**Spec 引用：** `docs/prds/hermes-agent-0.2.31-fix-followup-retest/specs/00-spec-index.md`  
**Spec/设计修订：** 2026-08-10 confirmed，D-05、`AC-06`  
**目标：** Stop 真实终止后端当前轮次，迟到事件不写回，新问题不进入旧轮次队列。  
**架构：** Provider 为每个运行轮次记录 `running/stopping/stopped` 状态、完成 Promise 和取消标记。正常路径发送 ACP cancel 并等待轮次结束；超时路径终止并重建 ACP 传输。  
**技术栈：** JavaScript、ACP JSON-RPC stdio、Node.js child process  
**验收：** `AC-06`、`GR-05`  
**执行环境：** 继承计划 03；ACP 共享进程只在取消超时后强制重置。

## 文件映射

- 修改：`lib/acp-client.js`，挂起请求元数据、可观察结束和强制关闭支持。
- 修改：`extension.js`，轮次记录、Stop 等待、迟到事件屏蔽、取消错误分流和 Diff 权限清理。
- 修改：`lib/acp-render.js`，保证 stopped 后不再接受事件。
- 新建：`test/acp-cancel.test.js`，正常取消、迟到响应、超时重置和禁止 CLI fallback 的聚焦测试。
- 修改：`package.json`，把取消测试纳入 `test:unit` 和语法检查。

### 任务 1：建立轮次取消测试缝

**验收：** `AC-06`  
**依赖：** 计划 03 完成  
**接口：** 每轮记录包含 UI session ID、ACP session ID、assistant message、`cancelled`、`settled` 和完成 Promise；取消错误具有可识别 code，不能与 ACP 故障混淆。  
**并行边界：** `extension.js`、`lib/acp-client.js` 和 renderer 状态强耦合，串行完成。  
**风险与回滚：** 测试必须验证外部可观察状态，不只断言 notify 调用次数。

- [ ] 编写失败测试：Stop 后 renderer 不追加迟到 chunk、取消错误不降级、未结束轮次阻塞新提交、超时触发传输关闭。
- [ ] 运行 `node test/acp-cancel.test.js`，预期因缺少轮次取消合同而失败。
- [ ] 为挂起 `session/prompt` 提供可观察的 settle 状态和取消错误分类。
- [ ] 运行聚焦测试，预期基础取消状态通过。

### 任务 2：实现 Stop 闭环

**验收：** `AC-06`、`GR-05`  
**依赖：** 任务 1 的轮次记录和取消错误  
**接口：** 输入为当前活动轮次和 Stop 消息；输出为 `stopping`，随后是确认取消或传输重置后的 `stopped`。  
**并行边界：** 必须在 Diff 清理合同完成后接入 Stop，确保待确认预览同步退出。  
**风险与回滚：** 强制重置会影响共享 ACP 连接；仅在协议取消超时后执行，并保留本地会话数据。

- [ ] Stop 时取消待确认权限并清理 Diff 临时预览。
- [ ] 发送 `session/cancel`，立即屏蔽该轮迟到事件，但等待后端轮次真正 settle。
- [ ] 超时未 settle 时终止 ACP 子进程、清除 ACP session 映射，并允许下一轮重新连接。
- [ ] `runAgent` 识别用户取消，不执行 CLI fallback。
- [ ] Stop 完成前让新问题等待；完成后才创建新的 `session/prompt`。
- [ ] 运行 `node test/acp-cancel.test.js`、`npm run test:unit`、`npm run lint`，预期退出码 0。
- [ ] 运行一次 `npm test`；若 smoke 再次 `SIGABRT`，记录环境失败与已通过的单元结果，不宣称完整 smoke 通过。

## 最终范围验证

- [ ] 对照 `AC-01` 至 `AC-10` 检查最终 Diff，不保留无关重构。
- [ ] 检查 `git status --short`，区分本任务文件与原有用户修改。
- [ ] 运行完整相关测试一次并记录新鲜输出。
- [ ] 对 Editor 路由、Diff 临时 dirty 状态、Stop 超时和 Thinking 状态转换执行 VS Code 手工复测。
