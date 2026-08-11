# Task review t109（reviewer_focus: 代码）

- task：`t109_archive_body_ref_consistency`
- spec：`docs/tasks/t109_archive_body_ref_consistency/spec.md`
- diff_anchor：`7de7117b9b169548962b4d5dba368bc97a079d19`
- target：`git diff 7de7117b9b169548962b4d5dba368bc97a079d19`
- round：1
- reviewed_at：2026-08-11 08:15 UTC+8

reviewed_scope: fa5fe26a601c7c35

## Findings

### t109_code_f001 - path_rewrite 回写消费序号 off-by-one：同路径多记录时 body_ref 相互交换，指向他人 body

- 严重度：critical
- 锚点：AC-001（两条记录 body_ref 均指向各自保留文件）；范围「解压或读取归档时引用可解析到文件」（解析到正确文件）；可观测数据损坏
- 位置：`src/extension/shared/archive_builder.ts:313-320`
- 问题：`path_rewrite` 对每个 old 路径记录冲突改写数组（顺序 = `all_body_files` 出现序，首个不冲突者保留原名）。回写循环用 `consumed` 计数器对 JSONL 中每个该 ref 的出现序号 `idx` 直接当 rewrite 下标消费：
  - `const idx = consumed.get(ref) ?? 0; if (idx < rewrites.length) { parsed[key] = rewrites[idx]; }`
  - 对 `n` 个同路径记录（1 个保留原名 + `n-1` 个改名），JSONL 出现 `n` 次。当前逻辑把**第一次出现（对应保留原名的文件）也改写**为 `rewrites[0]`，而最后一次出现（应取最后一个改名）因 `idx === rewrites.length` 不消费保持原名。
  - 结果：冲突组内每条记录的 body_ref 全部指向错误文件（整体错位一条）。复现：两个同 request_id 不同 response body 的请求（各 200 字节），归档内 `bodies/response/rid1.json` 存 A、`rid1_2.json` 存 B；回写后 JSONL 第一行 ref=`rid1_2.json`（读到 B）、第二行 ref=`rid1.json`（读到 A）。读归档时每条记录取到他人 body，属数据损坏。
  - 现有单测 `tests/unit/archive_body_ref_consistency.test.ts` 用**相同** body 且只断言「ref 指向存在的文件」与「含 `_2`」，两条断言均成立，无法捕获该交换，故 2 个用例通过但 bug 存在。
- 建议：回写下标需按「出现序号」错位：occurrence 0 保持原名，occurrence ≥1 映射 `rewrites[occurrence-1]`。最小改法：先 `consumed.set(ref, occ+1)`，仅当 `occ > 0 && occ-1 < rewrites.length` 时赋 `rewrites[occ-1]`；或令消费仅在非首现时推进。

### t109_code_f002 - AC-001 文字与实现语义不一致（去重只保留一文件 vs 路径改名保留两文件）

- 严重度：minor
- 锚点：AC-001 描述；按共享规则「实现合理但与 spec 描述不符 → 处置为改 spec，不计 FAIL」
- 位置：`docs/tasks/t109_archive_body_ref_consistency/spec.md:34` 与 `tests/unit/archive_body_ref_consistency.test.ts:89`
- 问题：AC-001 写「两事件 body 内容相同触发去重**只保留一文件**时，两条记录的 body_ref 均指向该保留文件名」，但实现与测试均为**路径冲突改名保留两个文件**（`_2` 后缀），不做内容去重（测试显式断言 `body_entries.length).toBe(2)`）。spec 文字与实际行为不符，易误导后续实现/审查。
- 建议：修订 AC-001 措辞为路径冲突改名语义（如「同路径 body 文件改名后，各记录 body_ref 指向其自身最终文件名」），不涉及代码改动。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：2 条（1 critical + 1 minor）
- 未进表的提示：
  - 文件过大：无。`src/extension/shared/archive_builder.ts` 395 行、`tests/unit/archive_body_ref_consistency.test.ts` 129 行，均低于阈值。
  - 复杂度：无。新增回写循环为线性遍历，无嵌套分支增长到阈值。
  - 范围外观察：回写仅在 `path_rewrite.size > 0` 时触发，且只改写出现在 `path_rewrite` 中的 ref；未冲突路径的 body_ref 与既有行文本保持不变，符合「不影响未冲突路径」。
- 总体判断：存在未解决 critical（f001 回写消费序号错位导致 body_ref 交换），FAIL。
- 系统性 follow-up：无（本 task 内问题，不跨 task）。

### AC 复验披露

- AC-001：`re_verified`。reviewer 用不同 body 内容（`A`.repeat(200)、`B`.repeat(200)）在 `.scratch/` 复现：归档内 `rid1.json`=AAA、`rid1_2.json`=BBB，回写后首行 ref 指向 `rid1_2.json`（BBB）、次行指向 `rid1.json`（AAA），body 归属错位；现实现不满足。
- AC-002：`re_verified`。代码审查 + 现有单测通过：冲突组内所有文件名（原名 + 各改名）均写入归档，JSONL ref 均解析到存在的文件，无悬空引用；但这是以「所有文件都保留」为前提，未校验内容归属（归属错误见 f001）。

`coverage = 2 / 2`

verdict: FAIL

## Round 2 (2026-08-11 08:22 UTC+8)

reviewed_scope: e7a7f0c37de7d5f4

### t109_code_f003 - 嵌套改名碰撞：rename 目标遮蔽后续自然路径时 body_ref 指向他人 body

- 严重度：important
- 锚点：范围「body 文件去重/改名后，JSONL（或清单）内对应 body_ref 字段更新为最终路径/文件名」（「对应」= 每条记录指向自己最终文件）；AC-001 语义
- 位置：`src/extension/shared/archive_builder.ts:304-327`
- 问题：回写逻辑假设「同 old 路径首个遇旧路径的记录保留原路径」（`n>=2` 才消费 `rewrites[n-2]`）。但冲突解决循环的改名目标（如 `req_2.json`）可能恰等于后续某请求的自然路径（`safe_request_id` 会把含 `-2` 等字符的 id 清洗成 `_2`，该形态现实可达）。此时该自然路径文件被二次改名 `req_2_2.json` 并写入 `path_rewrite['req_2.json']=[req_2_2.json]`，而回写循环对 `req_2.json` 首现按 seen-1 保留原路径，未消费 `rewrites[0]`。该记录 ref 指向 `req_2.json`（他人 body），归属错误。
  - 复现（.scratch 探针，真实 `build_archive`+`unzipSync`）：requests `req`(A)、`req`(B)、`req_2`(C)。归档内 `req.json`=A、`req_2.json`=B、`req_2_2.json`=C；JSONL 三行 ref=`[req.json, req_2.json, req_2.json]`，第三行解引用得 B（应为 C）。
- 建议：冲突解决阶段按原路径记录「最终路径数组」`final_by_orig[P]`（含首现；首现被遮蔽时同样记改名），回写循环按 JSONL 出现序逐次消费该数组，替代「首现固定保留原路径」。最小改法：冲突解决时若 `used_paths.has(P)`（含遮蔽）即改写并记录，回写对所有出现（含首现）按序取最终路径。

## 结论

- 前轮 finding 复核（Round 2）：
  - t109_code_f001（critical）：已消除。`n>=2` 且 `n-2<rewrites.length` 时消费 `rewrites[n-2]`，2-way 异体（A/B）ref 指向各自文件；独立探针 3-way 同路径（A/B/C）ref=`[P,P_2,P_3]` 内容正确。突变验证：改回 `rewrites[n-1]` 后 f001 用例失败（AC-001 亦失败）。已恢复 byte-identical。
  - t109_code_f002（minor）：修不彻底。AC-001 测试标题改为「去重改名」语义，但 spec.md:34 AC-001 正文仍为「去重只保留一文件」，与实现「路径改名保留两文件」不符。按 f002 原建议修订 spec.md AC-001 措辞（不计 FAIL；注意 spec 变更会改 reviewed_scope 指纹，届时需重跑 review）。
- 本轮新发现：1 条（t109_code_f003，important）
- 未进表的提示：
  - 全量测试 1235 条 1 失败：`tests/unit/logger.test.ts` truncation 用例 5s 超时。与 T109 无关（import 自 `src/shared/logger`，不依赖 archive_builder）；单文件隔离 15/15 通过且该用例自身 ~4.1s（贴近 5s 阈值），为既有慢测在并行负载下超时，非本 task 回归。
  - `tsc --noEmit`：通过（exit 0）。
  - 文件过大/复杂度：`archive_builder.ts` 397 行、测试文件 159 行，均低于阈值；回写循环线性遍历，无新增超阈值。
- 总体判断：f001 主缺陷已修，但遮蔽模式仍产生 body 归属错位（t109_code_f003 important 未解决），FAIL。
- 系统性 follow-up：无
- AC 复验方式：
  - AC-001：`re_verified`。独立复验 2-way 异体与 3-way 同路径 ref 内容正确；遮蔽场景（`req`/`req_2`）归属错误（见 f003），AC-001「指向各自保留文件」语义在遮蔽场景未满足。
  - AC-002：`re_verified`。所有 ref 均解析到归档内存在文件；但可解析到「存在但归属错误」的文件（见 f003），AC-002「可解析」成立、归属由 AC-001 语义覆盖。
  - `coverage = 2 / 2`

verdict: FAIL

## Round 3 (2026-08-11 08:40 UTC+8)

reviewed_scope: 152cd516aad9d9cd

### t109_code_f004 - 回写循环 guard 过宽：无路径冲突时仍 JSON.parse 全部 network 行

- 严重度：minor
- 锚点：非 AC 违约；代码质量/效率观察
- 位置：`src/extension/shared/archive_builder.ts:305`
- 问题：`if (final_seq.size > 0)` 仅在「存在 ≥1 个 body 文件」时成立，与「存在路径冲突」无必然关系。归档有 body 文件但无任何改名（final_seq 各项长度均为 1）时，仍对 network.jsonl 每行 JSON.parse 并逐项查表，纯空转。大归档（数百请求 + 大量 body、request_id 不冲突的常态场景）下为无谓解析开销。
- 建议：guard 收紧为「存在长度 >1 的 final_seq 项」，如 `if ([...final_seq.values()].some((a) => a.length > 1))`；无冲突时完全跳过解析循环。不影响正确性。

## 结论

- 前轮 finding 复核（Round 3）：
  - t109_code_f001（critical）：已消除。`final_seq[ref]` 按出现序消费，2-way 异体（A/B）ref 指向各自文件；突变验证（消费序号 +1）使 f001/AC-001 失败，判定成立。
  - t109_code_f002（minor）：已消除。spec.md:34 AC-001 改为「body 路径冲突改名（加 _2/_3 后缀）后，每条记录的 body_ref 指向其自身最终保留文件」，与实现（路径改名保留两文件）语义一致。本次 AC-001 变更即 f002 建议的措辞对齐，非未经确认的需求变更。
  - t109_code_f003（important）：已消除。`final_seq` 含首现被遮蔽改名的最终路径，回写按 ref 出现序消费 `final_seq[ref][n-1]`；遮蔽场景（req×2 + req_2）第三条 ref 正确指向 req_2_2。突变验证（首现强制保留原路径）使 f003 用例失败，判定成立。
- 本轮新发现：1 条（t109_code_f004，minor）
- 未进表的提示：
  - 文件过大/复杂度：`archive_builder.ts` 398 行、测试文件 191 行，均低于阈值；回写循环线性遍历，无新增超阈值。
  - request_body_ref 与 response_body_ref 走同一 final_seq/seen 逻辑（键为含类型前缀的完整路径，两侧前缀不同故不串扰），实现对称，无需独立分支。
- 总体判断：f001/f003 两个阻断项均已修复且经突变验证，剩余仅 1 条 minor（效率 guard），PASS。
- 系统性 follow-up：无
- AC 复验方式：
  - AC-001：`re_verified`。独立追踪 final_seq 消费序列（2-way、3-way 同路径、遮蔽）；突变验证还原 off-by-one 与「首现强制保留」均使对应用例失败；全量测试 + tsc 通过。
  - AC-002：`re_verified`。回写后所有 ref 均指向归档内实际写入文件（resolved_body_files 以 final 路径写入，网络行 ref 同步为 final 路径），无悬空引用。
  - `coverage = 2 / 2`

verdict: PASS
