# Task spec

## 背景

大数据量路径三缺口：agent 查询 load_agent_capture_data 整载全部记录 + index.getAll 再 slice（O(n²)，500MB capture 内存放大）；扩展侧不预检结果体积，超 64MiB 被 bridge 413 拒收且副作用丢失；bridge cdp_handler 事件数有界但单条 body 100MB 无聚合预算。

## 契约区

### 范围

- 修复 review finding：intensive-review 合并：H-6 查询整载 O(n²) + H-7 64MiB 上限扩展侧缺失 + H-20 CDP body 总量无上限

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: data.list/data.get/timeline.* 查询不再整载全量 capture 入内存，按需读取
- [ ] AC-002: 分页读取行为正确（PAGE_SIZE 5000 循环语义、边界页）
- [ ] AC-003: 查询结果与修复前一致（同 capture 同查询返回相同记录集）
- [ ] AC-004: 大 capture（10 万+ 事件）查询无整载路径（可观测：调用路径无 getAll 全量）
- [ ] AC-005: 命令结果估算超 64MiB 时扩展侧返回 PAYLOAD_TOO_LARGE 结构化错误，不构造/发送超限 body
- [ ] AC-006: 大结果命令（export/get_all_data）走既有文件回退路径（若适用）
- [ ] AC-007: 正常大小结果行为不变
- [ ] AC-008: 既有 agent 查询/投递测试不回退
- [ ] AC-009: bridge CDP 会话 body 总字节有上限，超限时按既定策略（丢弃最旧/标记 too_large）不无限累积
- [ ] AC-010: 常规流量下捕获完整性不降级（预算阈值内全部保留）
- [ ] AC-011: 既有 cdp_handler 测试语义不回退

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001/003: 既有 agent 查询测试保持通过 + 新增分页边界用例
- AC-004: mock 断言无 getAll 全量调用
- AC-005: 模拟超大结果断言 PAYLOAD_TOO_LARGE
- AC-009: CDP 超预算丢弃用例
- AC-006/007/008/010/011: 既有测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 合并：H-6 查询整载 O(n²) + H-7 64MiB 上限扩展侧缺失 + H-20 CDP body 总量无上限）

### 有意不测

- 无

### 测试策略

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- docs/blueprint/domain.md：限制表补会话 body 预算条目；错误码条目补 PAYLOAD_TOO_LARGE 扩展侧触发说明
