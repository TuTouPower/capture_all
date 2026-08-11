# Task review t117（reviewer_focus: 测试）

- task：`t117_dead_code_shared_helper_cleanup`
- spec：`docs/tasks/t117_dead_code_shared_helper_cleanup/spec.md`
- diff_anchor：`28ae56f5ae23947db17962add84e81145c2c6269`
- target：`git diff 28ae56f5ae23947db17962add84e81145c2c6269`
- round：1
- reviewed_at：2026-08-11 16:10 UTC+8

reviewed_scope: a378b274bf3f091a

## Findings

无。

（0 finding。diff 中测试改动仅三处：两个 CDP fixture 删除 `cdp_primary_emitted: new Set()` 残留行、`detail_search_preserve_input.test.ts` 新增 1 条 AC-003 转义测试；逐条危险模式扫描与 AC 覆盖核对均无命中，详见结论。）

## 结论

### 改测方向复核

无「迁就实现」的改测。既有测试唯一改动是 `cdp_request_key_session_isolation.test.ts:64` 与 `cdp_response_body_config.test.ts:63` 的 `make_state` 删除 `cdp_primary_emitted: new Set()` 行——该行正是 spec AC-001 要求删除的「测试 fixture 残留」，属 spec 明确要求，非删断言、非迁就实现。

### 本轮新发现

0 条。

### 未进表的提示

1. **AC-001 残留核验范围**：grep `cdp_primary_emitted` 全仓仍命中 `tests/unit/cdp_state_cleanup.test.ts:47,93,95`（`cdp_primary_emitted: undefined` + `expect(...).toBeUndefined()`）与 `docs/` 下历史文本（archive spec/log/review）。前者是 t023 的**负向断言**（验证字段已从 `CdpHandlerState` 删除），非死代码残留；后者为历史文档。production/context/测试 fixture 三层面已无残留，与 p006 登记的两个 fixture 一致，符合 AC-001 意图。
2. **cdp_handler.ts 日志字符串改名**（`'cdp_primary_emitted'` → `'cdp_primary_event_emitted'`，`cdp_handler.ts:425`、`network_capture.ts:647`）：调试日志文本变化，无测试断言该字符串，不影响采集行为与事件数据，符合非范围约束。

### AC 复验方式

- **AC-001**（re_verified）：`grep -rn cdp_primary_emitted` 全仓——`src/` 无命中（`network_capture.ts` 模块级 Set、`network_context.ts` 字段与 reset、两处 `.add()` 均删）；`tests/` 仅剩 t023 负向断言（见未进表提示）；`npx vitest run` 全量 128 文件 1354 测试全绿。
- **AC-002**（re_verified）：逐字符比对 `content_nonce.ts` 新共享实现与 diff 删除的三份 verbatim 实现——try/catch + `crypto.randomUUID` 判断 + fallback 模板串完全一致，仅加 `export`；三通道 `network_hook.ts:10` / `storage_capture.ts:4` / `websocket_capture.ts:4` 均 import 复用，调用点 `current_nonce = _nonce_override ?? generate_nonce()` 结构未变；`content_postmessage_nonce.test.ts` 10 条（含 AC-002httpb http fallback、AC-004 真实 crypto.randomUUID 双 nonce 不同——均经 `_nonce_override ?? generate_nonce()` 触达共享实现）与 storage/websocket nonce 测试全绿。
- **AC-003**（re_verified）：新测试 `detail_search_preserve_input.test.ts:47-54` 用 `a&gt;b&#39;c` 向量（jsdom 解析为 `a>b'c`），断言渲染输出含 `value="a&gt;b&#39;c"`（即 `esc`/`escape_html` 对 `>`、`'` 的转义产物，`src/shared/escape.ts:14` 覆盖 `[&<>"']` 五字符），并负向断言不含未转义 `a>b`；旧内联链（只转 `& " <`）对同输入会输出 `value="a>b'c"`，测试可区分新旧实现，非恒真；测试实跑通过。

coverage = 3 / 3

### 系统性 follow-up

无。

### 总体判断

diff 改动为纯机械清理（删死 Set 三层面残留、抽共享 helper、转义收敛到 `esc`），测试改动仅含 AC-001 要求的 fixture 残留删除与 AC-003 新覆盖，无危险模式命中，三条 AC 均可独立复验且测试全绿。

verdict: PASS

## Round 2 (2026-08-11 16:08 UTC+8)

reviewed_scope: 4d04575aa0cfda5b

## Findings

无。

（本轮无新 finding。当前 diff 相对 Round 1 仅多一处改动：`tests/unit/cdp_state_cleanup.test.ts:46-47` 删除 `@ts-expect-error - 已删除字段，验证不存在` 与其上 `cdp_primary_emitted: undefined` 占位两行——即 f001 修复本身；其余测试改动与 Round 1 审阅范围一致。）

## 结论

### 前轮 finding 复核

- **t117_code_f001**（code 路 Round 1 important，任务指定本路复核）：已消除。以当前 diff 核实：`cdp_state_cleanup.test.ts` 的 `make_state` 中 `// @ts-expect-error - 已删除字段，验证不存在` 与 `cdp_primary_emitted: undefined` 两行已删除（git diff 确认 `-2` 行），`:91-93` 负向断言原样保留。修复后 grep 全仓 src/ 零命中；`tests/` 仅剩验证机制自身（`cdp_state_cleanup.test.ts:91` it 标题、`:93` `expect((state as any).cdp_primary_emitted).toBeUndefined()`）与文件头注释 `:2` 的描述性提及——均为 t023 负向验证语义的一部分，非 fixture 残留。修复前恒真问题消除：占位删除后 `state` 不再显式含该属性，`:93` 断言验证的是「访问不存在属性得 undefined」，具备实际守护语义。三处 fixture（`cdp_request_key_session_isolation.test.ts:64`、`cdp_response_body_config.test.ts:63`、`cdp_state_cleanup.test.ts`）残留清零，AC-001「production、context、测试 fixture 均删除」达成。全量 `npx vitest run` 128 文件 1354 tests 全绿（本轮重跑确认，含 `cdp_state_cleanup.test.ts` 3 条）。

### 改测方向复核

无「迁就实现」的改测。本轮新增改动（`cdp_state_cleanup.test.ts` 删占位 2 行）属 f001 修复，方向与建议一致；此前已确认的三处 fixture 删除均为 AC-001 明确要求。`detail_search_preserve_input.test.ts` 新增 AC-003 case 为新增覆盖，非改预期。

### 本轮新发现

0 条。

### AC 复验方式

- **AC-001**（re_verified）：本轮重跑 `grep -rn cdp_primary_emitted src/ tests/`——src 零命中，tests 仅剩负向断言与注释（见前轮复核）；`npx vitest run` 128 文件 1354 tests 全绿。
- **AC-002**（re_verified）：本轮重查 `generate_nonce` 引用分布——唯一实现在 `src/extension/content/content_nonce.ts:3`，三通道 `network_hook.ts:10` / `storage_capture.ts:4` / `websocket_capture.ts:4` 均 import 复用，调用点 `_nonce_override ?? generate_nonce()` 结构未变；nonce 相关测试含在全量 1354 全绿中。
- **AC-003**（re_verified）：本轮重读 `dashboard_detail.ts:128`（`value="${esc(...)}"`，esc = `escape_html`，`src/shared/escape.ts:13` 覆盖 `[&<>"']` 五字符）与新增测试 `detail_search_preserve_input.test.ts:47-54`（`a&gt;b&#39;c` 向量正向断言 + 两条负向断言排除未转义 `a>b` / `a>b'c`，可区分仅转 `& " <` 的旧内联链，非恒真）；测试通过。

coverage = 3 / 3

### 系统性 follow-up

无。

### 总体判断

f001（fixture 占位残留）已按建议修复且验证到位，grep 残留清零、负向断言语义变真；本轮无新 finding，无未解决 critical / important，全量测试全绿。

verdict: PASS
