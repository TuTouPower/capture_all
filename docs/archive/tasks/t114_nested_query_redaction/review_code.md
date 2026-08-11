# Task review t114（reviewer_focus: 代码）

- task：`t114_nested_query_redaction`
- spec：`docs/tasks/t114_nested_query_redaction/spec.md`
- diff_anchor：`1c8f570c56af0758afa0ecb6604e3cdc8da8eefa`
- target：`git diff 1c8f570c56af0758afa0ecb6604e3cdc8da8eefa`
- round：1
- reviewed_at：2026-08-11 12:55 UTC+8

reviewed_scope: da42668a04202d43

## Findings

### t114_code_f001 - 嵌套深度超限 fail-open，深层链敏感值明文泄漏

- 严重度：important
- 锚点：行为缺陷 + 可观测泄漏；与 s002 结论「MAX_DEPTH=5 终止深层嵌套链且敏感值仍脱敏」意图不符（s002 仅对 3 层链验证，实现与结论对更深链均未覆盖）
- 位置：`src/shared/redaction.ts:99`（`if (_depth > NESTED_QUERY_MAX_DEPTH) return { url, url_status: 'captured' };`）
- 问题：深度超限时返回 `captured`（fail-open），上层 `redact_nested_value`（`src/shared/redaction.ts:82` `if (nested.url_status !== 'redacted') return null`）视为无嵌套而保持原值，敏感值明文透传。实测输入 7 层链 `?next=?next=?next=?next=?next=?next=?token=secret_deep7`：输出 `?next=?next=?next=?next=?next=?next=?token=secret_deep7`，`url_status='captured'`，secret 明文保留。6 层链（`?next=`×5）正常脱敏（token 恰在 depth 5 执行），7 层链 token 落入 depth 6 被截断即泄漏。深度上限是安全边界，攻击者可构造任意深度嵌套绕过脱敏；终止语义应为 fail-closed（超限保守置 `[REDACTED]` 或对嵌套子串整体打标），而非静默透传。
- 建议：深度超限时对整个 value 保守脱敏（置 `[REDACTED]`），或提高上限并对超限链补测试；至少让 `redact_nested_value` 在递归返回 `captured` 时区分「无可脱敏」与「深度截断」，后者不回归原值。

### t114_code_f002 - AC-003 接线级回归只覆盖 2/4 运行入口族

- 严重度：minor
- 锚点：AC-003 / spec 范围第 3 条「为 p018 列出的运行入口补接线级回归」交付不完整
- 位置：`tests/unit/t114_nested_query_redaction.test.ts`、`tests/unit/t114_form_entry_redaction.test.ts`（缺 extension network/CDP/WebSocket 与 external CDP Bridge 文件）
- 问题：AC-003 声明 form、extension network/CDP/WebSocket、Logger、external CDP Bridge 四族入口。新增回归仅 form（2 例）+ Logger（3 例）；`src/extension/background/network_capture.ts:904`、`network_webrequest.ts:142`、`webrequest_handler.ts:47`、`cdp_handler.ts:572/693/863` 与 external CDP Bridge `src/bridge/cdp_handler.ts:251/288` 均无嵌套 query 回归，既有测试（`network_capture.test.ts` / `cdp_handler_redaction.test.ts` / `websocket_capture.test.ts` / `bridge_cdp_events.test.ts` 等）也无嵌套 case。实现层经共享 helper 修复路径核验成立（入口均调 `redact_url`），行为无缺口，故不 blocking；但范围第 3 条的「防止 helper 修好后调用链仍泄露」验证交付只完成一半，test reviewer 应重点复核这两族。
- 建议：对 extension network/webrequest/CDP/WebSocket 与 external CDP Bridge request/response 各补 1-2 例嵌套 query 接线回归。

### t114_code_f003 - absolute 分支双编码值被触发递归，与 s002/d002「双编码不触发」结论及手动分支行为分叉

- 严重度：minor
- 锚点：spec 上下文区已核实结论（s002：双编码 `%253F` 单层解码后仍是 `%3F` 不触发递归）在 absolute 外层不成立
- 位置：`src/shared/redaction.ts:58-75`（`find_nested_query`）
- 问题：absolute 分支 `new URL()` 的 `URLSearchParams` 先解码一层，`find_nested_query` 再 `decodeURIComponent` 一层，构成两层解码，双编码值被识别并改写。实测 `https://outer.example/start?next=keep%253Ftoken%253Dx` → `https://outer.example/start?next=keep%253Ftoken%253D%255BREDACTED%255D`（`redacted`）；同输入相对分支 `?next=keep%253Ftoken%253Dx` → 原样 `captured`。同一输入是否触发取决于外层是否 absolute，行为分叉；double-encoded 字面量（s002 有意避免误判的对象）在 absolute 外层被改写。s002 的 12 用例只在手动分支验证双编码（`spike.ts` 用例输入均为相对形态），结论过度概括到全分支。方向偏安全（secret 消失、编码层数保持），故 minor；需明确 absolute 分支行为并修正 d002/s002 结论限定范围，或统一两分支语义。
- 建议：在 s002/d002 结论补充「双编码不触发仅对相对外层成立；absolute 外层因 URLSearchParams 预解码会触发」，实现与结论二选一对齐。

### t114_code_f004 - AC-002 形态与测试策略覆盖缺口（protocol-relative 外层、form base-resolved、嵌套空值敏感 key）

- 严重度：minor
- 锚点：AC-002「protocol-relative 外层中内嵌 query」、测试策略「form base-resolved action」
- 位置：`tests/unit/t114_nested_query_redaction.test.ts:16-33`、`tests/unit/t114_form_entry_redaction.test.ts:54-66`
- 问题：(1) AC-002 明文要求 protocol-relative 外层，10 组合中 protocol-relative 仅作内层（`/outer?next=//inner.example/...`），外层 `//outer.example/start?next=child?token=x` 无测试（实测行为正确：手动分支脱敏且保持 `//outer` 形态）。(2) 测试策略要求「form base-resolved action」，form 测试两例均为 absolute action，无 relative action + document base 解析路径。(3) `find_nested_query` 的 `/[?&][^#&]*=[^#&]+/` 要求值非空，嵌套空值敏感 key（`?next=?token=`）不触发递归（顶层空值敏感 key 仍被处理，泄漏风险限于空值）。均属覆盖可更广，非行为缺陷。
- 建议：补 protocol-relative 外层、form relative action（jsdom base-resolved）用例；空值敏感 key 视需要与 s002 结论对齐。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：4 条（1 important / 3 minor）
- 未进表的提示：
  - 文件过大：无。`src/shared/redaction.ts` 222 行（阈值 400）、两个测试文件 98/67 行（阈值 600），均未超。
  - 复杂度：`redact_url` 手算 CC ≈12（阈值 15），未超；`find_nested_query`/`redact_nested_value` ≈5/6。无表驱动排除项。
  - 范围外观察：`find_nested_query` 对含非法百分号序列的 value（如 `child%3Ftoken%3Dsec%zz`）`decodeURIComponent` 抛错返回 null，编码 query 以编码形式透传；输入本身非法 URL，未出 finding。
  - 已验证通过项：encoded 写回保持输入编码层数（单编码入→单编码出、双编码入→双编码出，`encodeURIComponent` + `URLSearchParams` 序列化恰恢复原层数，无重复编码）；`url_status` 仅实际改写置 `redacted`（无嵌套无敏感 → `captured`，改写 → `redacted`，`redact_nested_value` 仅透传 `redacted` 结果）；非敏感嵌套值（`?next=child?keep=1`）不误改；fragment/path 保留。
- 总体判断：核心递归脱敏实现正确、与 AC-001~004 行为一致、测试全绿，但存在 1 条深度超限明文泄漏（important）与 3 条 minor（覆盖与结论范围问题）。
- 系统性 follow-up：无（泄漏点与 s002 深度上限同源，建议随本 task 处置后更新 `docs/findings/d002` 结论范围；不单列 task）

### AC 复验方式

- AC-001：`re_verified` — 22 个 t114 单测全过；探针验证 absolute/base-resolved 外层嵌套脱敏、非敏感结构（path/hash/keep key）保留、`url_status` 与改写一致。
- AC-002：`re_verified` — 10 种 outer/inner 组合测试通过；探针补验 protocol-relative 外层与 `%3f` 小写编码，均脱敏且保持原形态。
- AC-003：`re_verified`（部分代码路径核验）— form（jsdom 真实接线 2 例）与 Logger（`sanitize_log_value` 3 例）测试通过；extension network/CDP/WebSocket 与 external CDP Bridge 无新增测试，仅 grep 核验入口调用共享 `redact_url` 后继承递归修复，未运行验证（见 f002）。
- AC-004：`re_verified` — 顶层敏感 key（absolute/手动/编码 key）回退测试通过；嵌套 absolute URL 场景（`absolute_outer_absolute_nested_url`）通过；`url_status` 语义探针验证。

coverage = 4 / 4（AC-003 中 extension/bridge 族为代码路径核验，非运行验证，已注明）

verdict: FAIL

---

## Round 2 (2026-08-11 13:00 UTC+8)

- task：`t114_nested_query_redaction`
- diff_anchor：`1c8f570c56af0758afa0ecb6604e3cdc8da8eefa`
- target：`git diff 1c8f570c56af0758afa0ecb6604e3cdc8da8eefa`
- round：2

reviewed_scope: 33812c1b97b6911e

### 前轮 finding 复核（以 diff 与实测为准）

- **f001（important）：已消除。** 实测 6/7/8 层链全部 no-leak：`?next=`×6+`?token=secret7` → `?next=?next=?next=?next=?next=?next=[REDACTED]`（redacted，secret7 消失）；8 层链同样收敛；absolute 深链 `https://outer.example/start?next=?next=?next=?next=?next=?next=?token=secret_abs_deep` → 输出 `%3F`/`%5B` 编码形态、secret 消失。修复点：`redact_nested_value` 入口 `depth >= NESTED_QUERY_MAX_DEPTH` 整体置 `[REDACTED]`（`src/shared/redaction.ts:83-86`）；测试 `deep_chain_max_depth_fail_closed` 断言有效（not.toContain + decode 含 REDACTED + status=redacted），实测通过。
- **f002（minor）：已消除。** 接线回归四族齐全且真实运行：form（jsdom 2 例）、Logger（`sanitize_log_value` 3 例）、extension network_capture（WS frame / CDP primary url 2 例，`tests/unit/t114_nested_query_redaction.test.ts:153-188`）、external CDP Bridge（request/response 1 例，`tests/unit/cdp_handler_redaction.test.ts:163-204`，断言 `events[0].url` 解码后无 secret 且含 REDACTED）。32 测试全绿。
- **f003（minor）：修不彻底，残余第二层分叉（见 f005）。** 顶层已对齐：`https://x.example/?next=keep%253Ftoken%253Dx` 与相对 `?next=keep%253Ftoken%253Dx` 均 captured 原样；单编码 absolute/relative 均 redacted 同形。但 absolute 外层**第二层嵌套**（`?next=child?next=keep%253Ftoken%253Dx`）仍双编码触发，与相对分支分叉（见 f005 实测）。另：处置表 rationale 声称「s002/d002 结论修订为 absolute 分支经 URLSearchParams 预解码后不重复解码」，实际 `docs/findings/d002_nested_query_recursive_decode.md` 与 `docs/spikes/s002_nested_query_recursive_redaction/report.md` 均未修订（仍为全称「双编码（%253F）不触发」），claim 与 diff 不符。
- **f004（minor）：部分修复。** (1) protocol-relative 外层已补测试（`t114_nested_query_redaction.test.ts:42`）且实测脱敏 ✓；(3) 嵌套空值敏感 key 已补测试（line 44，captured 原样——空值无敏感内容可泄，断言合理）✓；(2) form base-resolved 未落实：`tests/unit/t114_form_entry_redaction.test.ts` 两例仍为 absolute action。注：`form.action` 属性本身返回 base-resolved 绝对 URL（`form_submit_capture.ts:60`），relative action 输入最终与既有用例走同一 `redact_url` absolute 分支，缺口为纯覆盖增强，不单独追加 finding。

### 本轮新发现：2 条（均 minor）

### t114_code_f005 - f003 残余：absolute 外层第二层嵌套仍双编码触发，与相对分支行为分叉

- 严重度：minor
- 锚点：spec 上下文区已核实结论「双编码（%253F）单层解码后仍是 %3F 不触发递归」在 absolute 嵌套第二层不成立；与 f003 修复目标「与相对分支行为一致」仍不符（仅顶层一致）
- 位置：`src/shared/redaction.ts:182`（手动分支 `redact_nested_value(value, _depth, true)` 硬编码 `allow_encoded=true`，忽略 `_allow_encoded` 参数）
- 问题：absolute 分支顶层以 `allow_encoded=false` 规避 URLSearchParams 预解码后的重复解码；但嵌套 query 串为相对形态、`new URL` 失败进入手动分支后，硬编码 `true` 再次允许解码——URLSearchParams 一层 + `decodeURIComponent` 一层共两层解码，双编码值被识别改写。实测 `https://x.example/?next=child?next=keep%253Ftoken%253Dx` → redacted，输出 `next=child%3Fnext%3Dkeep%253Ftoken%253D%255BREDACTED%255D`（双编码字面量被注入 `[REDACTED]`）；同输入相对分支 `?next=child?next=keep%253Ftoken%253Dx` → captured 原样。方向偏安全（不泄露、反而过度改写用户原始数据），与 Round 1 f003 同源判 minor。
- 建议：手动分支透传 `_allow_encoded`（`redact_nested_value(value, _depth, _allow_encoded)`），或对 absolute 分支的嵌套递归统一禁止二次解码；同步修订 d002/s002 结论限定「双编码不触发仅对相对外层成立」或如实记录第二层分叉。

### t114_code_f006 - redact_url 深度超限守卫 fail-open 语义错误且当前不可达（死代码）

- 严重度：minor
- 锚点：行为缺陷（潜在 fail-open 路径）+ Round 2 关注「fail-closed 语义」；深度上限是安全边界，守卫语义须与 fail-closed 目标一致
- 位置：`src/shared/redaction.ts:107`（`if (_depth > NESTED_QUERY_MAX_DEPTH) return { url, url_status: 'redacted' };`）
- 问题：超限返回**未脱敏原文**却标 `url_status: 'redacted'`——状态谎报，若调用方按 `redacted` 重组（`redact_nested_value` line 89-90 的重组逻辑正是如此）即拼接原文透传敏感值。且阈值与 `redact_nested_value` 入口守卫不一致（`>` vs `>=`，MAX=5）：递归链中 `redact_nested_value` 在 `depth>=5` 已拦截返回 `[REDACTED]`，`redact_url` 实际最大收到 `_depth=5`（`5>5` false），该守卫当前**永不触发**。实测 `redact_url('?next=?token=secret_deep6', true, 6, true)` → `{url: '?next=?token=secret_deep6', url_status: 'redacted'}`——url 含明文而状态标 redacted。当前无调用路径传 `_depth>=6`，不构成可观测泄露；但守卫语义错误，一旦递归结构调整（如 redact_nested_value 守卫移除/重排）即静默透传，属防御代码的 fail-open 隐患。
- 建议：超限时对原文整体置 `[REDACTED]`（与 `redact_nested_value` 一致），并统一两处阈值（`>=`），消除该死路径或删除冗余守卫。

## 结论（Round 2）

- 前轮 finding 复核：f001/f002 已消除；f003 修不彻底（残余第二层分叉 → f005）；f004 部分修复（(2) 未落实，纯覆盖增强，不计 FAIL）
- 本轮新发现：2 条（f005/f006，均 minor）
- 未进表的提示：
  - 文件过大：无。`src/shared/redaction.ts` 231 行、`tests/unit/cdp_handler_redaction.test.ts` 207 行、`t114_nested_query_redaction.test.ts` 189 行、`t114_form_entry_redaction.test.ts` 67 行，均未超阈值。
  - 复杂度：`redact_url` 手算 CC ≈10（阈值 15）、`find_nested_query` ≈5、`redact_nested_value` ≈5，未达阈值。
  - 范围外观察：无。
  - 已验证通过项：encoded 重组保持输入编码层数（`?next=child%3Ftoken%3Dsec&keep=1` → `?next=child%3Ftoken%3D%5BREDACTED%5D&keep=1`，后续参数保留）；非敏感嵌套（`?next=child?keep=1`）不误改；`url_status` 与改写一致（正常路径全部探针核实）；AC-004 回退（顶层敏感 key / 编码 key）全过。
- 总体判断：fail-closed 深度守卫与接线回归补全实现正确、32 测试全绿、无未解决 critical/important；f005/f006 为 minor 残余与新隐患，不阻断。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified` — t114 单测 27 例全过；探针验证 absolute/base-resolved 嵌套脱敏、path/hash/keep 结构保留、`url_status` 与改写一致。
- AC-002：`re_verified` — 10 种组合 + protocol-relative 外层、`%3F`/`%3D` 编码值、深层链终止探针均脱敏且保持形态。
- AC-003：`re_verified` — 四族接线回归全部真实运行：form（jsdom 2 例）、Logger（3 例）、extension network_capture（WS frame / CDP primary 2 例）、external CDP Bridge（1 例），32 测试全绿（本轮为运行验证，非 Round 1 的代码路径核验）。
- AC-004：`re_verified` — 回退保护 3 例 + 探针，顶层敏感 key 与编码 key 行为不回退。

coverage = 4 / 4

verdict: PASS

---

## Round 3 (2026-08-11 13:08 UTC+8)

- task：`t114_nested_query_redaction`
- diff_anchor：`1c8f570c56af0758afa0ecb6604e3cdc8da8eefa`
- target：`git diff 1c8f570c56af0758afa0ecb6604e3cdc8da8eefa`
- round：3

reviewed_scope: a764e756057565d6

### 前轮 finding 复核（以 diff 与独立探针为准）

- **f005（minor）：已消除。** 修复点 `src/shared/redaction.ts:91`：递归调用改 `redact_url(found.nested, true, depth + 1, found.encoded ? false : allow_encoded)`——encoded 命中的嵌套子串已解码一层，递归禁解码；plain 命中继承当前 `allow_encoded`。`:188`：手动分支由硬编码 `true` 改为透传 `_allow_encoded`。独立探针（`.scratch/round3_probe.ts`，11 例全过）实测：第二层双编码 absolute `https://x.example/?next=child?next=keep%253Ftoken%253Dx` 与相对 `?next=child?next=keep%253Ftoken%253Dx` 均 captured 原样，行为一致；第二层单编码两分支均 redacted 触发且解码后同形 `child?next=keep?token=[REDACTED]`（absolute 输出为 URLSearchParams 序列化编码形态 `child%3Fnext%3Dkeep%3Ftoken%3D%5BREDACTED%5D`，decode 后与相对同形）；顶层双编码（absolute/相对）回归仍 captured。
- **f006（minor）：已消除。** `src/shared/redaction.ts:109-112`：顶层守卫改 `_depth >= NESTED_QUERY_MAX_DEPTH` 返回 `{ url: '[REDACTED]', url_status: 'redacted' }`——fail-closed 且状态不谎报，阈值与 `redact_nested_value`（`:83`）统一 `>=`。探针实测：`redact_url('?next=?token=secret_deep6', true, 6, true)` → `[REDACTED]`/redacted（无明文、不谎报）；depth=5 边界同样 fail-closed；6/7 层链与 absolute 深链输出均无 secret 明文。
- f001~f004（Round 2 已消除）：本 diff 未回退——深链 fail-closed、四族接线回归、顶层双编码一致相关用例重跑通过（35 例 t114 相关测试全绿）。

### 本轮新发现：0 条

### 修复过程扫描（f005/f006 改动引入）

- 递归终止性：`find_nested_query` 返回的 nested 经手动分支 query 拆解后 value 严格缩短、depth 严格 +1，无死循环路径（含 `?` 开头嵌套、`?` 紧邻重复形态）。
- encoded 写回保真：解码重组后整体 `encodeURIComponent`，编码层数往返一致（`keep%3Ftoken%3Dx` → 写回 `keep%3Ftoken%3D%5BREDACTED%5D`）。
- 旧 `URL_SUBSTRING_RE` 常量已移除，全仓无残留引用，无死代码。
- `redact_nested_value` 的 `depth >= 5` 守卫当前不可达（`redact_url` 顶层拦截先于其触发），属防御纵深冗余，无行为缺陷，不单列 finding。
- 全量单测 126 文件 1322 用例全绿（含 t114 30 + form 2 + cdp 3）。

## 结论（Round 3）

- 前轮 finding 复核：f005/f006 均以独立探针与代码核验确认消除；f001~f004 未回退。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大：无。`src/shared/redaction.ts` 237 行（阈值 400）。
  - 复杂度：`redact_url` 手算 CC ≈10（阈值 15）、`find_nested_query` ≈5、`redact_nested_value` ≈5，未达阈值。
  - 范围外观察：`redact_nested_value` `depth >= 5` 守卫不可达（保留作纵深防御，无行为影响）；`review_test.md` 末条 `reviewed_scope` 仍为 Round 2 的 `33812c1b97b6911e`，与当前 `a764e756057565d6` 不一致，test 轴需追加自身 Round 3，否则 `check_review_status.py` 的 `review_scope` 对 test 报告仍判 stale（test 报告归属 test reviewer，不在本报告处理）。
  - 已验证通过项：第二层双编码 absolute/相对一致（f005 核心）；超限 depth 直传 fail-closed 不泄露不谎报（f006 核心）；deep6/deep7/absolute 深链 no-leak；d002 结论已修订为「双编码在任意层均不触发」+ fail-closed，与修复后实现一致（Round 2 指出的文档未修订问题已解决）。
- 总体判断：f005/f006 修复准确，生产代码无新问题，无未解决 critical / important。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001：`re_verified` — 全量单测 1322 全绿；absolute/base-resolved 嵌套脱敏、非敏感结构保留、`url_status` 与改写一致（t114 30 例 + 独立探针）。
- AC-002：`re_verified` — 10 组合 + protocol-relative 外层、`%3F`/`%3D` 编码值、双编码不触发（absolute/相对一致）、深层链终止探针均通过。
- AC-003：`re_verified` — 四族接线回归运行验证（form 2 / Logger 3 / extension network_capture 2 / external CDP Bridge 1），35 例 t114 相关测试全绿。
- AC-004：`re_verified` — 顶层敏感 key、编码 key 回退用例通过；`url_status` 与改写一致探针核实。

coverage = 4 / 4

verdict: PASS
