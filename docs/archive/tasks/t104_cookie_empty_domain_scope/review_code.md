# Task review t104（reviewer_focus: 代码）

- task：`t104_cookie_empty_domain_scope`
- spec：`docs/tasks/t104_cookie_empty_domain_scope/spec.md`
- diff_anchor：`3771ec28ee8d05f0a5e75e355669a0e8c21dd2bb`
- target：`git diff 3771ec28ee8d05f0a5e75e355669a0e8c21dd2bb`
- round：1
- reviewed_at：2026-08-11 06:37 UTC+8
reviewed_scope: 9351913b64df2c49

## Findings

### t104_code_f001 - matches_target 空集恒 true 分支成为不可达死代码，注释与 T104 语义相悖

- 严重度：minor
- 锚点：行为缺陷（防御死代码）；无当前可观测缺陷
- 位置：`src/extension/background/cookie_capture.ts:47-50`
- 问题：`start_cookie_capture` 空域时在注册 listener 前直接 return（`:117-120`），`handle_cookie_changed` 只会在 `target_domains.size > 0` 时被注册，因此 `matches_target` 中 `target_domains.size === 0` 恒 true 分支（`:48`）不可达。该分支注释「未指定目标 → 不过滤」与 T104「空域不采」语义相悖，形成未来陷阱：若未来出现空域仍注册 listener 的调用路径，此分支会让全量 cookie 静默采入。
- 建议：移除该分支（空集时 `has()` 自然返回 false，fail-closed），或改为显式 `if (target_domains.size === 0) return false;` 并在注释说明空域已由 `start_cookie_capture` 前置拦截。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（minor）
- 未进表的提示：
  - 文件过大：无。`cookie_capture.ts` 137 行、`cookie_empty_domain_scope.test.ts` 82 行，均低于阈值。
  - 复杂度：无。`extract_target_domains` 近似 CC≈6，其余函数更低。
  - 范围外观察：SPA「先 blank 后跳转」场景，若 start 时 active tab URL 为空/blank，`start_cookie_capture` 跳过，service_worker（`src/extension/background/service_worker.ts:550`）未实现 URL 就绪后重新调用 start 的 attach 逻辑，该 capture 全程无 cookie 采集。spec 风险段已明示此风险且范围允许「跳过」，非 AC 缺失，不 blocking。
- 总体判断：实现正确满足 AC-001/002/003，空域 skip 语义成立（cookie 采集仅由 onChanged 驱动，全仓无 `cookies.getAll`，不注册即无全量路径）；仅 1 条 minor 死代码清理项。PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。重跑 `npx vitest run tests/unit/cookie_empty_domain_scope.test.ts`（4 passed）；`start_cookie_capture` 空 URL 分支不调用 `onChanged.addListener`（`cookie_capture.ts:117-120`）。
- AC-002：`re_verified`。重跑测试 AC-002 断言注册 1 次且 other.org 域 cookie 被过滤（`cookie_capture.ts:47-50,125`）；`grep cookies.getAll/cookies.get(` 无命中，采集仅 onChanged 事件驱动。
- AC-003：`re_verified`。重跑测试 AC-003 断言空域后 `is_cookie_capture_active()` 为 false；实现同时有 `logger.info('Cookie capture skipped: no target domain')` 日志信号（`:118`）与状态信号（`:128-130`），满足「至少其一」。

coverage = re_verified / 总 AC 数 = 3 / 3

verdict: PASS

## Round 2 (2026-08-11 06:41 UTC+8)

- 本轮 finding：0 条
reviewed_scope: 09ce77fe7536dda4

### 前轮 finding 复核

- **t104_code_f001（minor，已修）**：以 diff 核实，`matches_target` 现为 fail-closed：
  ```ts
  // T104: 空域已由 start_cookie_capture 前置拦截不注册 listener；此处 fail-closed 防未来空域注册路径静默全量。
  if (target_domains.size === 0) return false;
  ```
  （`cookie_capture.ts:48-51`）。注释与 T104 语义一致，消除了 Round 1 指出的「恒 true 死分支 + 误导注释」陷阱。该分支在可达路径中不可达（`start_cookie_capture` 空域时于 `:118-121` 直接 return，listener 仅非空域注册），改动不改变任何可达行为，仅修正防御语义。未引入新问题。

### 本轮新发现

- 无

### 未进表提示

- 无。文件大小与复杂度与 Round 1 结论相同（`cookie_capture.ts` 141 行、测试 82 行，均低于阈值）。

### 总体判断

f001 修复正确，无新增 blocker，无未解决 critical / important。PASS。

### AC 复验方式

- AC-001 / AC-002 / AC-003：`re_verified`。复跑 `npx vitest run tests/unit/cookie_empty_domain_scope.test.ts`，4 passed；f001 修复仅改防御死代码分支，未触及 AC-001/002/003 所依赖的可达控制流（空域前置 return、非空域按域过滤）。

coverage = re_verified / 总 AC 数 = 3 / 3

verdict: PASS
