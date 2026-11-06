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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：非法 enum/number/type 的 `save_user_config` patch 不得进入 storage。
- [ ] AC-002：非法 `set_log_level` 返回失败或回退，不写入非法 logger level。
- [ ] AC-003：Bridge timeout 配置字段非法值时启动期或运行时被拒绝。
- [ ] AC-004：Agent capture config 的 body/inline 上限超过硬上限时被拒绝。
- [ ] AC-005：新增非法 patch/level/timeout/body 上限测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：mock storage/config 消息边界断言拒绝与落库结果。

## 上下文区

- 来源：BC-006、BC-010、SEC-008（2026-08-13 核实，`save_user_config` 可追溯 `bdcfcdaa`，T060 后只增强 load 边界未补 save）。

### 有意不测

- 无。

### 测试策略

- mock storage/config；断言非法 patch/level/timeout/上限不得进入存储或运行态。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- body/inline 上限的硬上限取值：结论=`max_body_capture_bytes ≤ MAX_BODY_CAPTURE_BYTES`（100MB）、`inline_text_max_bytes ≤ INLINE_TEXT_MAX_BYTES`（32KB）（s008 spike，2026-08-13 已核实，复用既有常量无新魔数）。

### 风险与回退

- 风险：写边界校验过严影响正常配置落库。
- 回退：与 `load_user_config` 共用同一 sanitizer，保证 load/save 对称。

### 依赖与约束

- 复用 `sanitize_user_config` 与 `LogLevel` enum。

### Finalization 时更新的 blueprint

- `docs/specs/user_config.md`：如补充 save 边界要求，同步。
