# Hermes ACP 会话推理程度实施计划

**Spec 引用：** `docs/prds/hermes-acp-diff-model-refresh/specs/00-spec-index.md`
**Spec/设计修订：** 2026-08-19 confirmed；Effort 仅为可选 Adapter 增强，核心 VSIX 不依赖该改动
**目标：** Hermes Adapter 仅在 `hermes-agent-vscode` 且当前模型支持 reasoning 时广告并应用会话级 `reasoning_effort`
**架构：** 在 `SessionState` 保存当前 effort；server 记录 initialize 的 `clientInfo.name`，并复用当前 `AIAgent._supports_reasoning_extra_body()` 的 provider/model 能力判断。只有 opted-in client 与能力判断同时为真时返回标准 `SessionConfigOptionSelect`；设置时使用 `parse_reasoning_effort` 更新当前 session 的 `reasoning_config`。
**技术栈：** Python 3.11+、agent-client-protocol、pytest wrapper
**验收：** `AC-ACP-EFFORT-01`、`AC-ACP-COMPAT-01`
**执行环境：** 干净仓库 `/Users/eyan/Desktop/Vibe Coding/Hermes vs code插件/outputs/hermes-agent-acp-source`，HEAD `1705a4407`；禁止修改 `/Users/eyan/.hermes/hermes-agent`

## 全局约束

- 使用标准 ACP schema，不新增私有 JSON-RPC 方法。
- 不写 `config.yaml`、不改变 Desktop/CLI/Gateway。
- 不修改 `/Users/eyan/.hermes/hermes-agent`，不恢复备份 patch。
- 测试必须使用 `scripts/run_tests.sh`。

---

## 文件映射

- 修改：`acp_adapter/session.py`，`SessionState.reasoning_effort`
- 修改：`acp_adapter/server.py`，client capability 记录、config option 构造与 `set_config_option`
- 测试：`tests/acp/test_server.py`

### 任务 1：按当前模型广告标准 reasoning config option

**接口：** `_state_supports_reasoning(state) -> bool`；`_session_config_options(state) -> list[SessionConfigOptionSelect] | None`；仅 `clientInfo.name == "hermes-agent-vscode"` 且 active agent 支持 reasoning 时返回 option
**风险与回滚：** Zed/unknown client 或能力判断异常必须返回 `None`；不得用版本号或模型名称表兜底

- [ ] 修改 `tests/acp/test_server.py`：test agent 的 `_supports_reasoning_extra_body()` 返回 true 时，VSIX client 的 new/resume/fork response 含 `reasoning_effort`；返回 false 或抛异常时为 `None`；Zed/unknown client 始终为 `None`。
- [ ] 运行 `scripts/run_tests.sh tests/acp/test_server.py`，预期 non-reasoning/异常能力用例因当前全局广告行为 FAIL。
- [ ] 在 `acp_adapter/server.py` 实现 fail-closed `_state_supports_reasoning`，只调用 active agent 已有能力入口；在 `_session_config_options` 的 client gate 后增加 model capability gate。
- [ ] 运行聚焦测试，预期 PASS。

### 任务 2：应用会话级 effort

**接口：** `set_config_option("reasoning_effort", session_id, value)`；合法 wire 值 `low/medium/high/xhigh/max/ultra`
**风险与回滚：** 无效 value 返回不改变 state 的响应；不得调用持久化全局配置

- [ ] 添加 RED：六档解析、非法值不改变、session A/B 隔离、`agent.reasoning_config` 精确更新。
- [ ] 使用 `hermes_constants.parse_reasoning_effort` 最小实现并返回完整 configOptions。
- [ ] 运行 `scripts/run_tests.sh tests/acp/test_server.py`，预期 PASS。
- [ ] 运行 `scripts/run_tests.sh tests/acp/`，预期 ACP 全套 PASS。
