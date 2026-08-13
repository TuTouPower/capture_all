# Task spec

## 背景

CDP WebSocket 建连成功后，同一个 `ws.onclose` 仍只设置 `connect_error` 并再次 resolve 已 settled 的 Promise，不调用 `destroy_session`、不终态化 pending 事件、不向 `/cdp/events` 暴露 session failure。扩展 client 把所有非 2xx 统一降为空数组，coordinator 每 500ms 永久重排下一次 poll，导致 Chrome 关闭、调试端口重启或 WS 中断后，外部 body 捕获静默永久停止，而状态仍显示 `external_cdp_bridge / active`。

## 契约区

### 范围

- 建连成功后安装运行态 `onclose`/`onerror`：终态化所有 pending 事件（如 `cdp_failed`）、标记 session terminal reason、关闭并清理 WS/timer/映射。
- `/cdp/events` 返回明确 terminal 状态或 410 + 结构化错误。
- 扩展 client 对 404/410/鉴权失败不再统一降为空数组，向 coordinator 抛出可分类错误。
- coordinator 收到 terminal failure 后停止 poll，切换 fallback hook 或明确更新失败状态。

### 非范围

- 不改变 `/cdp/start` 握手成功语义与 5 分钟 idle TTL 数值。
- 不重构 body_capture_coordinator 整体状态机（仅补 terminal 处理）。

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

- [ ] AC-001：MockWebSocket `onopen` → `/cdp/start` 成功后触发 `onclose`，再调用 `/cdp/events` 得到明确 terminal 状态或 410，而非 200 空数组。
- [ ] AC-002：post-open close 后，该 session 的所有 pending 事件被终态化并可观察（如 `cdp_failed`），不再永久 pending。
- [ ] AC-003：扩展 client 收到 404/410 后不返回空数组，而是向 coordinator 抛出可分类 terminal 错误。
- [ ] AC-004：coordinator 收到 terminal failure 后停止后续 poll 调度，并切换到 fallback hook 或更新失败状态。
- [ ] AC-005：post-open close 后 session 的 WS、timer、映射被清理，不阻塞进程退出或污染下一次实例。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：MockWebSocket 驱动；client/coordinator 用 fake timer 与 mock fetch 单测。

## 上下文区

- 来源：BM-H003（2026-08-13 核实，当前 `ws.onclose` 行为来自 `d9804d4` t101）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 走 MockWebSocket 生产路径覆盖 post-open close、error、TTL 后 poll、fallback 切换。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- terminal 状态 HTTP 码选择（410 vs 结构化 200）：`UNVERIFIED-SPIKE`，执行期按 `src/bridge` 现有错误码与 `/cdp/events` 调用方约束核实后定。

### 风险与回退

- 风险：client 抛出分类错误后，coordinator 未正确降级导致外部 body 采集整体中断。
- 回退：terminal 处理保持幂等，fallback hook 为既有降级路径，失败不扩散。

### 依赖与约束

- 依赖 t157 的事件终态语义（`cdp_failed`/`evicted`）保持一致。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：如引入 terminal 状态码/错误分类，记录其契约。
