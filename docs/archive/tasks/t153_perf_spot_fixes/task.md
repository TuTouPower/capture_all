# Task spec

## 背景

intensive-review 性能面 7 项：zipSync 同步压缩阻塞 UI、system_time browser 分支重复建 formatter、app_log trim 全表 cursor 扫描、时间线 O(n²) indexOf、fallback hook 大 body 全量缓冲、popup 轮询无单飞且三套轮询未复用、popup 拉全量列表仅渲染 3 条。

## 契约区

### 范围

- 修复 review finding：intensive-review 聚合：B1-M11 zipSync、B1-M12 system_time、B2-M18 app_log 全扫、B4-M8 O(n²)、B3-M5 hook 缓冲、B5-L2/L3 轮询、B5-I1 list 全量

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: 归档压缩不阻塞 UI（异步或分批，行为等价）
- [ ] AC-002: system_time browser 分支复用 formatter 缓存（行为等价）
- [ ] AC-003: app_log trim 避免每次 flush 全表扫描（增量计数或抽样，trim 语义不变）
- [ ] AC-004: 时间线渲染消除 O(n²)（idx 映射），大列表不卡死（分页或懒渲染）
- [ ] AC-005: fallback hook 对超大响应体不全量缓冲（上限收紧或短路 too_large）
- [ ] AC-006: popup 轮询单飞保护 + 与 dashboard/共享模块收敛（可复用 start_status_poll）
- [ ] AC-007: popup 列表拉取可限流（limit 参数），行为等价
- [ ] AC-008: 优化后既有功能测试全部通过

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 行为等价由既有测试保证；性能项用调用路径断言（无全扫/无整载/无 O(n²) 模式）

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 聚合：B1-M11 zipSync、B1-M12 system_time、B2-M18 app_log 全扫、B4-M8 O(n²)、B3-M5 hook 缓冲、B5-L2/L3 轮询、B5-I1 list 全量）

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

- 无
