# Task spec

## 背景

CDP 会话资源预算存在两处账本与淘汰语义缺陷：`/cdp/events` 轮询把已完成事件从 `session.events` 移除并返回时，未按返回事件 body 字节递减 `session.body_bytes`，使预算退化为累计写入量，正常流量下也触发错误淘汰；`enforce_body_budget` 与事件数上限淘汰时不区分 pending，可能删除无 body 的 pending 请求元数据，其迟到 `Network.getResponseBody` 响应无法重建事件，请求永久消失。t140 新引入 body 聚合预算时未同步修改轮询移除路径，且相关测试只直接调用内部 helper，未走生产 `/cdp/events` 路径。

## 契约区

### 范围

- 统一事件移除账本：从 `session.events` 移除已返回事件时，按实际存储 `response_body` UTF-8 字节递减 `body_bytes`。
- body 预算淘汰只选择最旧、已终态且确有 `response_body` 的事件，不得用 pending 元数据偿还 body 预算。
- 若只剩当前超大 body 无法通过淘汰降到预算内，保留请求元数据，把该 body 置 null 并标 `too_large`。
- 事件数上限淘汰若必须删除 pending，先生成可返回终态事件（如 `cdp_failed`/`evicted`）并清理对应 command 映射。
- 同步 `docs/blueprint/domain.md` 限制表，补 CDP 会话聚合 body 预算（200MB）与计数口径、超限策略。

### 非范围

- 不重构 `handle_cdp_events` 的 pending/completed 分队列数据结构（性能维度见其他 task）。
- 不改变 CDP 会话 200MB 预算数值本身。

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

- [ ] AC-001：经生产 `/cdp/events` 路径返回并移除两条带 body 的 completed 事件后，`session.body_bytes` 回到 0（或仅统计当前驻留事件字节）。
- [ ] AC-002：poll 移除后写入新的 body 事件，预算内事件全部返回，不因 stale `body_bytes` 被误淘汰。
- [ ] AC-003：当最旧事件为 pending 且无 body 时，body 预算淘汰不得删除该 pending 元数据；其迟到 body 响应仍能更新对应事件。
- [ ] AC-004：当仅剩单个超大 body 事件且无法通过淘汰降到预算内时，该请求元数据保留，body 置 null 且标 `too_large`，事件可被 `/cdp/events` 返回。
- [ ] AC-005：事件数上限淘汰 pending 时，产生可观察终态事件（非静默消失），且对应 command 映射被清理。
- [ ] AC-006：`docs/blueprint/domain.md` 限制表包含 CDP 会话 200MB 聚合 body 预算条目及计数口径、超限策略。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：用 MockWebSocket 驱动生产路径，覆盖 pending 位于最旧位置、迟到 body 响应、事件数 cap 与 body cap 交叉场景。

## 上下文区

- 来源：BM-H001、BM-H002、PERF-M007、BM-L004（CL-02、CL-04）；`docs/archive/tasks/t140_agent_query_cursor_paging/spec.md:92-94`（2026-08-13 核实）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 走 MockWebSocket 生产路径而非直接调用内部 helper；断言 `body_bytes`、事件数组、`too_large` 标记与 `cdp_failed`/`evicted` 终态。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：统一 `remove_events` 封装后，遗漏某条事件移除路径导致账本再次漂移。
- 回退：封装唯一移除入口，禁止多路径各自维护计数；回退到显式递减实现。

### 依赖与约束

- 与 t140 已有 `MAX_SESSION_BODY_BYTES=200MB` 实现同域，须保持该数值不变。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：限制表补 CDP 会话聚合 body 预算。
