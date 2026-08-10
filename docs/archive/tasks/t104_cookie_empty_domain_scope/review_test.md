# Task review t104（reviewer_focus: 测试）

- task：`t104_cookie_empty_domain_scope`
- spec：`docs/tasks/t104_cookie_empty_domain_scope/spec.md`
- diff_anchor：`3771ec28ee8d05f0a5e75e355669a0e8c21dd2bb`
- target：`git diff 3771ec28ee8d05f0a5e75e355669a0e8c21dd2bb`
- round：1
- reviewed_at：2026-08-11 06:40 UTC+8

reviewed_scope: 9351913b64df2c49

## Findings

无 blocking finding。

已逐条扫描危险模式（恒真断言 / 删反转 expect / 注释掉断言 / 弱化断言 / 删测试 / skip·only / 静默错误 / mock 误用 / 阈值掩盖 / 条件跳过 / 程序赋值替代交互 / 存在即通过），均未命中。测试 mock 位于系统边界 `chrome.cookies.onChanged`（外部浏览器 API），生产逻辑 `extract_target_domains` / `start_cookie_capture` / `handle_cookie_changed` 均以真实模块加载并触达；动态 import + `vi.resetModules()` 仅用于重置模块级 `is_capturing` 状态，不掩盖被测逻辑。

## 结论

- 前轮 finding 复核：无（round 1）
- 改测方向复核：无。diff 仅新增测试文件 `tests/unit/cookie_empty_domain_scope.test.ts`，未修改既有测试。
- 本轮新发现：0 条
- 未进表的提示：
  - AC-002 现以「匹配域后 count=1、再加非匹配域后仍 count=1」的中间+最终断言判别过滤方向（反向过滤会在首个中间断言失败），已可区分正确/反向/不过滤三种情形。可选加固：断言 `sender` 收到的 event payload（`name:'a'`、`domain:'example.com'`），使匹配内容显式化，非必需。
  - `extract_target_domains` 的 `catch`（畸形非空 URL，如 `'not-a-url'`）与 `target_tab_url` 默认 `null` 路径未被直接测试；二者均落到同一空域跳过分支，隐私面风险同 AC-001 已覆盖，属低风险扩展项。
- 总体判断：测试可信、AC 覆盖完整、无假绿风险；全部通过。
- 系统性 follow-up：无

### AC 复验披露

- AC-001（空 / about:blank / chrome:// 等不注册全量监听）：`re_verified` — 独立重跑 `vitest run tests/unit/cookie_empty_domain_scope.test.ts`（4 passed），并核对 `cookie_capture.ts:117-120` 空域早退逻辑与 `extract_target_domains` 协议门（`:31`）。测试断言 `on_changed.addListener` 未调用 + listener 数组为空。
- AC-002（https 普通域名按域过滤回归）：`re_verified` — 核对 `handle_cookie_changed` 经 `matches_target`（`:68`）过滤，测试以中间/最终 count 断言判别匹配与过滤。
- AC-003（空域降级可观察信号）：`re_verified` — 核对 `start_cookie_capture` 空域分支不置 `is_capturing`，测试断言 `is_cookie_capture_active() === false`（capture 状态信号，符合 AC「状态或日志至少其一」）。

coverage = 3 / 3

verdict: PASS


## Round 2 (2026-08-11 06:41 UTC+8)

reviewed_scope: 09ce77fe7536dda4

### 前轮 finding 复核

- 测试侧本无代码改动（f001 为代码层防御死代码修复，由 code reviewer 验证）。

### 本轮新发现

无。

### 结论

- AC-001/002/003 复验不变；全量 1219 通过。

verdict: PASS
