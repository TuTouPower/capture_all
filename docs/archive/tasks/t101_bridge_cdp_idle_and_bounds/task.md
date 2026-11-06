# Task spec

## 背景

Bridge CDP session 固定墙钟销毁（报告称 5 分钟非 idle）导致长采集丢 body；events / body_seq map 无上限；detect/start HTTP 无超时可挂死。P1-3/P1-4。

## 契约区

### 范围

- CDP session 生命周期改为基于空闲/活动可续期，或明确可配置且长采集默认不因固定短墙钟误杀（行为可测）。
- events 与关联 map 有上限或淘汰策略，超限不 OOM（可丢最旧并记日志/指标）。
- 对 CDP HTTP/WebSocket 建立与 `/json/list` 设超时，超时返回错误而非永久挂起。
- 单测或伪时钟测。

### 非范围

- 不改 extension 侧 body coordinator 协议字段名（除非为超时错误码必需）。
- 不实现分布式多 bridge。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：在持续有 CDP body/事件活动时，session 在短于「固定误杀窗口」的活动期内保持可用（或配置的 idle TTL 每次活动刷新）；可用伪时钟证明 idle 才销毁。
- [ ] AC-002：写入超过上限条数的 events（测试设小 cap）后进程不因无界数组增长而失败；旧数据按文档策略丢弃或拒绝并返回可观察错误。
- [ ] AC-003：模拟 `/json/list` 或 CDP 连接永不响应时，detect/start 在超时后返回失败结果，调用方 Promise 在有限时间内 settle。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（假时钟 + mock http/ws）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-3 P1-4；src_bridge_mcp/review.md f001 f004 f005

### 有意不测

- 真实 Chrome CDP 端口扫描全矩阵：有意不测。

### 测试策略

- mock undici/http 与 ws；注入时钟。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：TTL 过短丢 body；过长占资源——默认值写进常量并可测。
- 回退：恢复固定墙钟与无超时。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 若 idle TTL 成对外约定：`docs/blueprint/architecture.md` Bridge CDP 段
