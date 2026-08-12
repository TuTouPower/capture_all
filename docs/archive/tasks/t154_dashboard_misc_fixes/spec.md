# Task spec

## 背景

intensive-review dashboard/popup 小缺陷 13 项：搜索双转义、删除采集忽略响应、open_detail 视图重置、start_url 无 scheme 校验、响应形状无防御、非扩展上下文崩溃、pointercancel 缺失、负时长、两处 esc 缺口、refresh_counts 忽略 is_capturing、capture_toggles 写后无消费、get_capture_config 硬编码缺省、stop 失败静默转态。

## 契约区

### 范围

- 修复 review finding：intensive-review 聚合：B4-M4 双转义、B4-M7 删除响应、B4-M14 视图记忆、B4-L2/L3/L4/L7/L9、B4-M6/L1 esc、B5-L1/L4/L5/L7

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

- [ ] AC-001: 搜索含双引号显示不被篡改为 &quot;
- [ ] AC-002: 删除采集检查 SW 响应，活跃采集被拒时 UI 提示且禁用删除按钮
- [ ] AC-003: open_detail 记忆上次 tab/视图（或明确文档行为）
- [ ] AC-004: start_url 仅 http/https 可打开，其余拒绝
- [ ] AC-005: load_captures 对非数组响应防御不崩溃
- [ ] AC-006: 非扩展上下文打开 dashboard 不抛 TypeError（优雅降级或提示）
- [ ] AC-007: resize 拖拽在窗口外释放不卡死（pointercancel/mouseleave 清理）
- [ ] AC-008: capture_dur 负值 clamp 0
- [ ] AC-009: 状态徽章/cache_status 转义渲染
- [ ] AC-010: popup 以 status.is_capturing 校正本地状态（SW 已自动结束时降级提示）
- [ ] AC-011: capture_toggles 重开 popup 后恢复
- [ ] AC-012: get_capture_config 缺省值引用 DEFAULT_CONFIG/user_config（redact_data 以 user_config 为底叠加 toggle）
- [ ] AC-013: stop 失败时 popup 提示具体原因，不静默转完成态

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001/004/009: 渲染/校验单测
- AC-002/010/013: mock SW 响应断言
- AC-003/005/006/007/008/011/012: 各模块既有测试补用例

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 聚合：B4-M4 双转义、B4-M7 删除响应、B4-M14 视图记忆、B4-L2/L3/L4/L7/L9、B4-M6/L1 esc、B5-L1/L4/L5/L7）

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
