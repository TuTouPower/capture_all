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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`/health` 返回包含 `service:"capture-all-bridge"` 与版本号的 JSON。
- [ ] AC-002：任意 200 服务（非本产品）被 `is_bridge_healthy` 判定为不健康。
- [ ] AC-003：端口被非本产品服务占用时，main 输出明确错误并非零退出，而非「already listening」。
- [ ] AC-004：SessionStart hook 复用同一探测逻辑。
- [ ] AC-005：新增「任意 200 服务不算健康」的 config/main 测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：mock `/health` 响应与启动逻辑。

## 上下文区

- 来源：BM-M004（2026-08-13 核实，main/config 判断来自 `c6afa690`，2026-08-13 仅补 3s timeout 未加身份校验）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock `/health` 返回不同 JSON/2xx，断言识别与错误输出。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：版本号变更导致探测误判。
- 回退：识别字段稳定（service 名），版本号仅展示不参与匹配。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：如记录 `/health` 识别契约，同步。
