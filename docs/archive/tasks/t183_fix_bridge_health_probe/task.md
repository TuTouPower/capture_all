# Task spec

## 背景

`is_bridge_healthy` 对 `${bridge_url}/health` 只返回 `response.ok`，无产品标识、版本、特征 header 或 token challenge 校验。在配置端口运行任意服务使 `/health` 返回 200，Bridge 启动即打印「already listening」并退出，SessionStart hook 也只检查 HTTP 200，后续 MCP 对错误服务调用失败，根因被掩盖。

## 契约区

### 范围

- `/health` 返回稳定产品标识与版本（如 `{ok:true, service:"capture-all-bridge", bridge_version:"..."}`）。
- `is_bridge_healthy` 校验 status、Content-Type、完整标识；解析失败视为端口冲突，不视为已运行。
- main 对「端口有 2xx 非本服务」输出明确错误并非零退出。
- SessionStart hook 复用同一探测脚本，避免 shell 逻辑漂移。

### 非范围

- 不改变 `/health` 的对外 HTTP 状态码语义（仍 200 表示健康）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`/health` 返回包含 `service:"capture-all-bridge"` 与版本号的 JSON。
- [ ] AC-002：任意 200 服务（非本产品）被 `is_bridge_healthy` 判定为不健康。
- [ ] AC-003：端口被非本产品服务占用时，main 输出明确错误并非零退出，而非「already listening」。
- [ ] AC-004：SessionStart hook 复用同一探测逻辑。
- [ ] AC-005：新增「任意 200 服务不算健康」的 config/main 测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：mock `/health` 响应与启动逻辑。

## 上下文区

- 来源：BM-M004（2026-08-13 核实，main/config 判断来自 `c6afa690`，2026-08-13 仅补 3s timeout 未加身份校验）。

### 有意不测

- 无。

### 测试策略

- mock `/health` 返回不同 JSON/2xx，断言识别与错误输出。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：版本号变更导致探测误判。
- 回退：识别字段稳定（service 名），版本号仅展示不参与匹配。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：如记录 `/health` 识别契约，同步。
