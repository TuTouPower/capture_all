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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：目标 tab URL 无法得到 domain（空、about:blank、chrome:// 等）时，不调用「无 URL 过滤的全量 cookie.getAll」式全浏览器拉取（或等价全量监听不注册）。
- [ ] AC-002：目标 tab 为 https 普通域名时，cookie 采集仍限制在该 domain（回归）。
- [ ] AC-003：空域降级时 capture 状态或日志出现可观察的 skip/degraded 信号（至少其一），而非静默全量采集。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（mock chrome.cookies）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-7；src_ext_bg_cdp_net/review.md f009

### 有意不测

- 无

### 测试策略

- mock cookies API 调用参数。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：SPA 先 blank 后跳转可能短时无 cookie；可在 URL 更新后再 attach。
- 回退：恢复空域全量。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
