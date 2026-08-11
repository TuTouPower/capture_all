# Task spec

## 背景

Cookie 目标域列表为空时退化为全浏览器 cookie 监听/采集，扩大隐私面。P1-7。t051 已做 tab domain 范围，空域退化仍是缺口。

## 契约区

### 范围

- 当无法解析出任何目标 domain 时，不启用全浏览器 cookie 采集；改为跳过、等待 URL 就绪、或仅记录可观察的降级状态。
- 有明确 domain 时仍按域过滤（回归）。
- 单测覆盖空域。

### 非范围

- 不改 cookie 事件 schema。
- 不采集 httpOnly 等浏览器禁止项。

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

- [ ] AC-001：目标 tab URL 无法得到 domain（空、about:blank、chrome:// 等）时，不调用「无 URL 过滤的全量 cookie.getAll」式全浏览器拉取（或等价全量监听不注册）。
- [ ] AC-002：目标 tab 为 https 普通域名时，cookie 采集仍限制在该 domain（回归）。
- [ ] AC-003：空域降级时 capture 状态或日志出现可观察的 skip/degraded 信号（至少其一），而非静默全量采集。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试（mock chrome.cookies）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-7；src_ext_bg_cdp_net/review.md f009

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock cookies API 调用参数。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：SPA 先 blank 后跳转可能短时无 cookie；可在 URL 更新后再 attach。
- 回退：恢复空域全量。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
