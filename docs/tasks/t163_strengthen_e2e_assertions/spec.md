# Task spec

## 背景

多个 E2E 文件存在恒真/弱断言，即使被测路径完全失效仍保持绿色：CDP retry 接受空 console 数组与 `fallback_hook` 作为恢复证据；HAR body 断言只检查 `.some()` 返回 boolean；realtime detail 增长测试用 `>=`；console/error 分离不断言目标记录或分类；detail-tab 在容器缺失时静默通过；theme/i18n 含永久 true 占位。

## 契约区

### 范围

- 修复上述 6 个 E2E 文件的断言，使其验证真实行为：
  - CDP retry 用本地确定性页面发唯一 marker + 唯一 response body，断言 marker 出现在 console、请求 body 状态为 `captured`、body 模式非 `fallback_hook`。
  - HAR body 断言非空 `response.content.text` 且等于预期值。
  - realtime detail 增长测试触发确定性新事件并断言严格增长。
  - console/error 分离断言每个 marker 在正确 tab 且不在错误 tab，断言 console level 与 error 分类。
  - detail-tab 在容器缺失时 fail 而非跳过。
  - theme/i18n 移除永久 true 占位，改为真实断言。

### 非范围

- 不改变 E2E 的 Playwright 接线（见 t162）。
- 不新增超出上述范围的新场景。

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

- [ ] AC-001：CDP retry 场景要求唯一 console marker 出现在导出 `console_events`，且至少一个匹配请求 `response_body_status === 'captured'`、body 内容匹配预期、body 模式非 `fallback_hook`。
- [ ] AC-002：HAR 导出场景断言存在某条目 `response.content.text` 非空且等于预期值。
- [ ] AC-003：realtime detail 增长场景触发确定性新事件后，断言 marker 出现且事件计数严格大于 t1。
- [ ] AC-004：console/error 分离场景断言各 marker 出现在正确 tab 且不在错误 tab，并断言 console level 与 error 分类。
- [ ] AC-005：detail-tab 场景在目标容器缺失时测试失败（不静默通过）。
- [ ] AC-006：theme/i18n 场景移除永久 true 占位，改为对实际主题/文案的真实断言。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：E2E 用本地确定性 fixture 服务器。

## 上下文区

- 来源：TD-002、TD-003、TD-004、TD-005、TD-010、TD-011（2026-08-13 核实）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- fixture 用 `tests/support/fixtures/server.ts` 提供确定性本地页面与响应；断言数据-backed 而非仅页面长度。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：真实扩展环境依赖使确定性 marker 断言不稳定。
- 回退：不稳定项降为显式 skip 并注释原因，不转为恒真断言。

### 依赖与约束

- 依赖 t162 将这些文件接入 Playwright 后才在 CI 生效（可先本地单跑）。

### Finalization 时更新的 blueprint

- 无。
