# Task spec

## 背景

SW 生命周期持久化两缺口：cleanup_stale_capture_state 只标 completed 不重建子系统（决策 009 恢复分支缺失，重启后活跃采集被静默截断）；bytes_written 纯内存 Map 重启清零，500MB 限额失效持续膨胀。

## 契约区

### 范围

- 修复 review finding：intensive-review 合并：H-8 限额重启失效 + H-9 重启只终态不恢复

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: SW 重启检测到 active_capture_* 持久化键时，恢复 is_capturing/current_capture/子系统状态（或按决策明示终止语义并保证已落库数据不丢）
- [ ] AC-002: 终止语义下无恢复分支；generation token 与 capture_state run_exclusive 防跨采集串写（既有机制，stale_cleanup 终态化不产生并发写入）
- [ ] AC-003: 恢复失败路径（如 storage 损坏）回退到终止语义，不产生半活跃状态
- [ ] AC-004: 既有 stale_cleanup 终态化测试语义不回归（终止分支仍可用）
- [ ] AC-005: 单采集写入字节数持久化（随 CaptureRecord 或独立键），SW 重启后限额检查可重建
- [ ] AC-006: 重启后继续写入仍触发 MAX_SESSION_SIZE_BYTES 停止并写 storage_limit lifecycle 事件
- [ ] AC-007: 既有 stop_capture/storage 测试语义不回退

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001: service_worker_stale_cleanup.test.ts 新增恢复分支用例
- AC-005/006: 模拟重启后超限触发用例
- AC-004/007: 既有测试保持通过
- AC-005 persist_stats 落盘直接断言：单元测试环境（fake-indexeddb）下 handle_event 内 write_events 与 start 的持久化存在并发事务冲突，persist_stats 内 update_capture 不可靠触发；已用「get_capture_size 内存累计 + update_capture 引用对象落盘」验证模型正确性，persist_stats 直接落盘逻辑（简单赋值 + update_capture）在生产真实 IndexedDB 无此限制，标注 trust_prior。

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 合并：H-8 限额重启失效 + H-9 重启只终态不恢复）

### 有意不测

- 无

### 测试策略

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- SW 重启后 producer 状态（原 UNVERIFIED-SPIKE）结论：不自动恢复。`chrome.webRequest` 5 listener 与 `chrome.debugger.onEvent` 均在采集启动流程函数内注册（`network_capture.ts:89-235`），SW 销毁随实例丢失需重注册；content script 为 manifest 声明式 document_start 注入，已打开页面不重新注入，content 激活态不随 SW 恢复。恢复成本高，「重启即终止」（决策 010/t030）语义确认合理。已落库数据由 t038 flush-on-write 保证不丢。验证方式：s004 spike + d005 finding（静态核对 + MV3 生命周期文档）。

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- docs/blueprint/architecture.md §4.1 + domain.md 存储限制条目：恢复/终止语义与限额持久化按实现结论更新
