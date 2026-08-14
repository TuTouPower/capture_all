# Task review t198（reviewer_focus: 测试）

- task：`t198_storage_export_boundaries`
- spec：`docs/tasks/t198_storage_export_boundaries/spec.md`
- diff_anchor：`87ad5a883819d82dfa48a8b7de7dba7f70941b18`
- target：`git diff 87ad5a883819d82dfa48a8b7de7dba7f70941b18`
- round：1
- reviewed_at：2026-08-14 05:05 UTC+8

reviewed_scope: 2ad8f61ac6077457

## Findings

### t198_test_f001 - AC-002 用例 fixture 全 ASCII，字节/字符计数口径回归无法区分

- 严重度：minor
- 锚点：AC-002「`total_size_kb` 断言为实际字节数（>0 且与内容相符）」
- 位置：`tests/unit/exporter.test.ts:230-239`（t198 AC-002 用例）
- 问题：oracle 用 `new TextEncoder().encode(JSON.stringify(parsed)).length` 计算期望字节数，与生产 `exporter.ts:159` 同口径，能捕获历史缺陷（虚构系数估算，`exporter.ts:157-158` 注释所述 B2-L1）。但 mock fixture 全部为 ASCII 字符（`mock_capture` / `mock_events` / `mock_network_requests`），此时 `json_str.length`（字符数）与字节数相等；若生产实现回归为字符计数口径，本用例仍绿。真实采集含中文标题/正文等多字节内容，字符计数会在真实数据下失准——该回归目前无测试防护。
- 建议：在 AC-002 用例的 fixture（如事件 `data.text` 或 capture name）加入至少一个非 ASCII 字符（中文/emoji），使字节数 ≠ 字符数，锁定「实际字节数」语义。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：首轮，无
- 改测方向复核：无。`storage_keyset.test.ts` 仅给 `make_event` 新增带默认值的 `category` 参数，既有用例断言原样未动；`exporter.test.ts` 为纯新增用例；无「迁就实现」的改测。
- 本轮新发现：1 条（minor，非 blocking）
- 未进表的提示：
  - AC-001 NaN 用例（`storage_list_captures_limit.test.ts:64-67`）只有 1 条记录，无法区分「NaN→全量」与「NaN→clamp 1」两种语义；NaN 不在 AC-001 范围（仅负数/0/小数），实现注释声明全量（`storage.ts:211-215`）。加第 2 条记录即可锁定，非 blocking。
  - `storage_list_captures_limit.test.ts` 多处 `create_capture(make_record(...) as never)` 类型 hack，仅测试侧类型卫生，无运行时影响。
  - AC-004 用例无法区分「CATEGORY_STORE_MAP 显式映射 dom_data→USER_ACTION_EVENTS」与「map 缺键走默认 fallback」——fallback 本就是 USER_ACTION_EVENTS（`storage.ts:364`），两者无可观测差异；按 store 点查已物理锚定落点，无需处理。
- 总体判断：AC-001~004 断言补全测试均直接触达生产实现（fake-indexeddb 真实读写 / 真实 exporter 输出 / 真实路由），全量测试无回归，仅 1 条 minor 覆盖扩展建议，PASS。

### AC 复验方式

- AC-001：`re_verified` — 运行 `storage_list_captures_limit.test.ts`（4 用例绿）；逐条核对 `storage.ts:210-215` safe_limit 归一化与用例断言：undefined→全量、2→2、-5→1、0→1、2.7→2、NaN→全量。
- AC-002：`re_verified` — 核对 `exporter.ts:157-159`（TextEncoder 字节 → `Math.round(/1024)` → `<span>${total_size_kb} KB</span>`）与用例 oracle；`escape_for_html_embed`（`escape.ts:13-23`）转义经 JSON.parse 往返可逆，`JSON.stringify(parsed)` 与生产 `json_str` 字节一致；用例绿。
- AC-003：`re_verified` — 核对 `body_capture_coordinator.ts:325-357`（`Math.max(0, evt.timestamp - start_time)`，absolute 保留）与 3 用例（2500-1000=1500 / 回拨 clamp 0 / 相等边界 0）；用例绿。
- AC-004：`re_verified` — 核对 `CATEGORY_STORE_MAP`（`storage.ts:325-337` dom_data→USER_ACTION_EVENTS）与 `write_events`/`get_events_by_category` 路由；用例真实写 IndexedDB 后经 store 点查命中；用例绿。
- AC-005：`re_verified` — 全量 `npx vitest run`：203 文件 / 1916 用例全绿（含既有 storage/exporter/storage_keyset 测试）。

coverage = 5 / 5

- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-14 05:10 UTC+8)

- task：`t198_storage_export_boundaries`
- spec：`docs/tasks/t198_storage_export_boundaries/spec.md`
- diff_anchor：`87ad5a883819d82dfa48a8b7de7dba7f70941b18`
- target：`git diff 87ad5a883819d82dfa48a8b7de7dba7f70941b18`
- round：2
- reviewed_at：2026-08-14 05:10 UTC+8

reviewed_scope: 0635689bc9041d7e

本轮审查范围 = 第 1 轮（05:05）之后被修改的全部文件（mtime 核对）：`tests/unit/exporter.test.ts`（05:06:14，t198_test_f001 + t198_code_f001 修复）、`tests/unit/storage_list_captures_limit.test.ts`（05:06:19，t198_code_f002 修复）。生产文件（`storage.ts` / `body_capture_coordinator.ts`）与其余测试文件第 1 轮后未变，按第 1 轮结论继续有效。

## Findings

本轮无独立新 finding（f001 修不彻底的复核结论见下）。

## 结论

- 前轮 finding 复核（以 diff + 实测为准，不采信处置表自称）：
  - **t198_test_f001（minor，处置表标「已修」）→ 修不彻底**。处置表自述「fixture 加非 ASCII（中文）字符，锁定『字节数』语义（字符计数口径回归会变红）」——实测该 claim 不成立。探针复现本用例 fixture（capture_id=`测试采集`、event data.text=`中文标题 & <em>强调</em>`）走真实 `export_html`：内嵌 JSON 总字节 1603 / 字符 1583（差 20），`Math.round(1603/1024)=2`、`Math.round(1583/1024)=2`，二者相同；且 bytes mod 1024 = 579，远离量化临界区。即生产若回归为字符计数口径，输出仍是 `<span>2 KB</span>`，用例断言 `toContain('<span>2 KB</span>')`（`exporter.test.ts:241`）依旧绿——第 1 轮指出的「字符计数口径回归无防护」原样存在。用例注释（`exporter.test.ts:231-232`）宣称「若生产回归为字符计数口径……用例变红」与实测不符，误导后续维护者。有效修复方向：使非 ASCII 字节差 > 512（约 171 个中文字符，bytes-chars 跨过 0.5KB 量化步长后 round 结果必分叉），或放大 fixture 使差跨边界；并同步修正注释。严重度维持 minor（AC-002 核心断言「字节数 oracle 与内嵌内容相符」仍有效，缺的只是对特定口径回归的防护）。
  - **t198_code_f001（minor，标「已修」）→ 已消除**。`exporter.test.ts` AC-002 用例删除 `toBeGreaterThan(0)`：属危险模式「删除 expect」命中，经调查合法——`>0` 语义由保留的一致性断言隐含覆盖（oracle=2>0，生产输出 0/恒值/与 oracle 不符时 `<span>2 KB</span>` 断言红），删除未迁就实现、未弱化 AC-002 证据。
  - **t198_code_f002（minor，标「已修」）→ 已消除**。`storage_list_captures_limit.test.ts:65-70` NaN 用例改为 2 条记录断言 `length=2`，明确区分「NaN→全量」与「NaN→clamp 1」，与生产 `!Number.isFinite(limit) → undefined → 全量`（`storage.ts:210-214`）语义一致，真修。
- 改测方向复核：无「迁就实现」改测。两处既有用例修改均为强化/清理方向——NaN 用例补记录增强区分；AC-002 用例删冗余存在性断言保留更强一致性断言（已核实隐含覆盖 `>0`）。
- 本轮新发现：0 条独立 finding；f001 复核为「修不彻底」（minor，不阻断）。
- 未进表的提示：
  - f001 的用例注释（`exporter.test.ts:231-232`）描述的能力与实际不符，建议随 f001 修复一并订正。
  - 第 1 轮提示项（NaN 区分度）已随 code_f002 关闭，无新提示。
- 总体判断：第 1 轮全部 blocker 无；本轮复核 f001 修不彻底但维持 minor（AC-002 核心断言有效，仅回归防护缺位），code f001/f002 修复方向正确，全量测试无回归；仅有 minor 未解决，PASS。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified` — 核对 `storage.ts:210-215` safe_limit 归一化与 4 用例断言（undefined→全量、正整数截断、-5/0→1、2.7→2、NaN→全量 2 条记录区分）；全量跑绿。
- AC-002：`re_verified` — 核对 `exporter.ts:157-159` 字节口径 + 探针实测 fixture 字节/字符/round 值（见 f001 复核），复验中发现修复区分度不足已如实记录；全量跑绿。
- AC-003：`re_verified` — 核对 `body_capture_coordinator.ts:340-343`（`Math.max(0, timestamp - start_time)`、absolute 保留）与 3 用例（2500-1000=1500 / 回拨 clamp 0 / 相等边界 0）；全量跑绿。
- AC-004：`re_verified` — 核对 `storage.ts:325-337`（dom_data→USER_ACTION_EVENTS 显式映射）与 `storage_keyset.test.ts` AC-004 用例（by_category 命中 + `get_store_record_by_id('user_action_events')` 物理锚定）；全量跑绿。
- AC-005：`re_verified` — 本轮 `npx vitest run`：203 文件 / 1916 用例全绿。

coverage = 5 / 5

verdict: PASS
