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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
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
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 行为等价由既有测试保证；性能项用调用路径断言（无全扫/无整载/无 O(n²) 模式）

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 聚合：B1-M11 zipSync、B1-M12 system_time、B2-M18 app_log 全扫、B4-M8 O(n²)、B3-M5 hook 缓冲、B5-L2/L3 轮询、B5-I1 list 全量）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
