# Task spec

## 背景

Dashboard 打开进行中 capture 详情时，2 秒 interval 无条件调用 `load_detail()`，先清空状态、请求元数据，再 `Promise.all` 发起 8 路 IndexedDB 读取（每路上限 100000），随后 merge/copy/sort 全量列表。t144 的 signature 对比发生在完整重读之后，只避免 DOM 替换，不避免数据库扫描、对象分配、数组复制与排序。大 capture 下每次轮询都付出全量成本。

## 契约区

### 范围

- 轮询先只读轻量 metadata/counter，版本/计数推进才取数据。
- 数据增量：按 per-source cursor/offset 拉增量，append 到内存态，只排序新增边界。
- 页面 hidden 或离开详情时暂停轮询。

### 非范围

- 不引入完整 UI 虚拟化（见 t193）。
- 不改动 `read_capture_snapshot` 的 100000 截断修复（见 t156）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：连续两个轮询周期无新事件时，第二次只执行 metadata 查询，不调用 `read_capture_snapshot()`。
- [ ] AC-002：有新事件时触发一次数据刷新（有变化才读，不再无条件每轮全量读）；正确性不依赖 IDB 追加序游标。
- [ ] AC-003：页面 `visibilitychange` 进入 hidden 后，轮询停止；恢复 visible 后按最新版本恢复。
- [ ] AC-004：详情页关闭或离开后，轮询不再触发详情数据读取（interval 清理或 page 守卫）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：用 spy 断言 `read_capture_snapshot` 调用次数与 metadata 查询；`visibilitychange` 用 jsdom/事件模拟。

## 上下文区

- 来源：EXTUI-002、PERF-H003（CL-06；2026-08-13 核实，`17cde0df` t144 引入 signature 分支但 guard 在完整重读之后）。

### 有意不测

- 无。

### 测试策略

- mock IndexedDB 与 metadata 源；断言读取量与调用次数，而非 DOM 内部状态。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：增量状态与全量读取语义不一致导致详情漏数据。
- 回退：版本号变化时退回一次全量重建作为保底，仅降低而非完全移除成本。
- **t160 实施调整（2026-08-13）**：原 AC-002「增量拉取 append」经 review 实证不可行——`query_by_store` 的 cursor 按 primary key（`event_id` 随机 UUID）字典序遍历，非写入追加序，offset 增量必然重读/漏读。改为：metadata 无推进不读（保留主要收益），有推进时全量重建替换（正确性优先，成本仍只在变化时付出）。AC-002 语义随此调整。

### 依赖与约束

- 依赖 t156 分页读取能力（cursor 增量）。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：如采用 metadata 版本号机制，记录其契约。
