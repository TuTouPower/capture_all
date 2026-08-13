# Task spec

## 背景

Bridge timeout 配置字段缺少运行时 parse 校验；`set_log_level` 消息分支在 truthy 检查后把任意 `payload.level` cast 为 `LogLevel` 直接设置全局 logger 并写 storage，`Logger.set_level` 本身无运行时校验；`save_user_config` 只 `{...current, ...patch}` 原样落库，不做 sanitize，违反生效 spec `user_config.md` 的「经 `sanitize_user_config` 白名单校验后落库」要求。Agent capture config 的 body/inline 上限也只校验非负，无硬上限。

## 契约区

### 范围

- Bridge timeout 配置字段增加运行时 parse 校验。
- `save_user_config` 对合并对象调用 `sanitize_user_config` 再落库，外部消息边界显式拒绝非法 patch。
- `set_log_level` 用共享 enum guard，统一调用 `save_user_config({ log_level })`。
- Agent capture config 的 body/inline 上限增加硬上限校验。

### 非范围

- 不改变 `sanitize_user_config` 的既有白名单逻辑（仅补 save 边界使用）。

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

- [ ] AC-001：非法 enum/number/type 的 `save_user_config` patch 不得进入 storage。
- [ ] AC-002：非法 `set_log_level` 返回失败或回退，不写入非法 logger level。
- [ ] AC-003：Bridge timeout 配置字段非法值时启动期或运行时被拒绝。
- [ ] AC-004：Agent capture config 的 body/inline 上限超过硬上限时被拒绝。
- [ ] AC-005：新增非法 patch/level/timeout/body 上限测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：mock storage/config 消息边界断言拒绝与落库结果。

## 上下文区

- 来源：BC-006、BC-010、SEC-008（2026-08-13 核实，`save_user_config` 可追溯 `bdcfcdaa`，T060 后只增强 load 边界未补 save）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock storage/config；断言非法 patch/level/timeout/上限不得进入存储或运行态。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- body/inline 上限的硬上限取值：结论=`max_body_capture_bytes ≤ MAX_BODY_CAPTURE_BYTES`（100MB）、`inline_text_max_bytes ≤ INLINE_TEXT_MAX_BYTES`（32KB）（s008 spike，2026-08-13 已核实，复用既有常量无新魔数）。

### 风险与回退

- 风险：写边界校验过严影响正常配置落库。
- 回退：与 `load_user_config` 共用同一 sanitizer，保证 load/save 对称。

### 依赖与约束

- 复用 `sanitize_user_config` 与 `LogLevel` enum。

### Finalization 时更新的 blueprint

- `docs/specs/user_config.md`：如补充 save 边界要求，同步。
