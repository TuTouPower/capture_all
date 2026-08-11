# Task review t109（reviewer_focus: 测试）

- task：`t109_archive_body_ref_consistency`
- spec：`docs/tasks/t109_archive_body_ref_consistency/spec.md`
- diff_anchor：`7de7117b9b169548962b4d5dba368bc97a079d19`
- target：`git diff 7de7117b9b169548962b4d5dba368bc97a079d19`
- round：1
- reviewed_at：2026-08-11 08:20 UTC+8
- reviewed_scope: fa5fe26a601c7c35

## Findings

### t109_test_f001 - AC-001 测试判别力缺口：相同 body fixture 掩盖 ref 交叉回写（swap），实测产生错误 body 引用

- 严重度：critical
- 锚点：范围「body 文件去重/改名后，JSONL（或清单）内对应 body_ref 字段更新为最终路径/文件名」——「对应」即每条记录 ref 须指向**自己**的最终路径；当前实现与测试均未保证，且测试无法察觉。
- 位置：`tests/unit/archive_body_ref_consistency.test.ts:71-104`（AC-001 用例，fixture `make_req('req_dup', same_body)` 两次）
- 问题：
  - 两个冲突请求使用**相同 body 内容**（`'x'.repeat(200)`）。回写逻辑把 ref 从旧名改成新名时，实际是**按冲突出现序整体错位**：第一个出现（保留 base 名）的记录被写成 `_2`，第二个（被改名为 `_2`）的记录却保留 base 名，ref 与记录交叉。
  - 我用真实 `build_archive` + `unzipSync` 独立复现（fixture：同 `request_id`、body1=`'A'.repeat(200)`、body2=`'B'.repeat(200)`）：line0（request1）的 `response_body_ref` 指向含 `'B'` 的文件，line1（request2）指向含 `'A'` 的文件——两条 ref 均解引用到**对方**请求的 body。archive 内 `bodies/response/req_dup_2.json` 内容为 `'B'`，`req_dup.json` 内容为 `'A'`。
  - 被审测试因两 body 内容相同，解引用结果无法区分正确/错误映射，全绿通过。即测试验证「ref 可解析到存在文件」，但未验证「ref 对应各自记录的真实 body」。
- 影响：重复 `request_id` 且 body 不同（重试改载荷等真实场景）时，归档两条记录 `response_body_ref` 均指向错误内容，消费方（dashboard、MCP get_record、读归档的 AI Agent）取到错 body。属数据完整性缺陷，且为 task 核心目的。
- 建议：新增/改写用例为「同 `request_id` + 不同 body」，断言 line0 解引用内容含 body1、line1 解引用内容含 body2（或断言 line0.ref 为 base 名、line1.ref 为 `_2` 名）。当前只断言 `refs` 集合含 base 与 `_2`、且均解析，不检查哪条记录对哪个文件。

### t109_test_f002 - AC-002 测试无判别力：删除 path_rewrite 回写后测试仍 PASS（纯存在性断言）

- 严重度：important
- 锚点：AC-002「body 改名后，不存在『JSONL 引用旧名且归档内无此文件』的条目」——测试存在但验证的是不随修复变化的恒真性质。
- 位置：`tests/unit/archive_body_ref_consistency.test.ts:106-128`（AC-002 用例）
- 问题：断言仅 `expect(files[ref]).toBeDefined()`（纯存在性断言当 AC 证据，命中危险模式）。本 fixture（两请求同 `request_id`）中，base 路径 `bodies/response/req_dup.json` 恒由第一个请求写入，旧代码未回写时两条记录 ref 也指向 base 名且文件存在——即**删除 T109 的 path_rewrite 回写块，本测试依旧通过**。该测试无法证明修复生效。
- 建议：与 f001 合并场景（同 id 异 body），断言每条 ref 解引用内容等于对应记录 body；或至少断言「存在一条 ref 指向 `_2` 文件」这类仅在回写后成立的性质。

### t109_test_f003 - 测试注释与 fixture 不符，且 AC-001 措辞「只保留一文件」与实现「保留两文件」不一致

- 严重度：minor
- 锚点：非 blocking；spec 措辞问题。
- 位置：`tests/unit/archive_body_ref_consistency.test.ts:73` 注释「两个不同 request_id 但 body 相同」
- 问题：
  - fixture 实际是**相同** `request_id`（`make_req('req_dup', ...)` 两次）。若真用不同 request_id，safe_id 不同、路径不冲突，根本不会触发去重/改名。注释误导。
  - AC-001 字面「去重只保留一文件」，实现为路径冲突改名**保留两文件**（base + `_2`），测试断言 `body_entries.length` 为 2。此为 spec 措辞与实现不符（实现合理，F006 描述即为改名保留两文件），建议校正 spec 措辞为「去重/改名后 body_ref 指向各自保留文件」，不计 FAIL。
- 建议：改注释为「相同 request_id 触发路径冲突」；spec 措辞按范围「改名后 body_ref 更新为最终路径」对齐。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：无（diff 仅新增测试文件，未修改既有测试；无「迁就实现」改测）
- 本轮新发现：3 条（f001 critical / f002 important / f003 minor）
- 未进表的提示：
  - AC-001 字面场景「只保留一文件」在当前实现不可达，建议改 spec 措辞（见 f003），不改动不计 FAIL。
  - `path_rewrite` 消费逻辑对 3 次及以上冲突同样错位（line0→`_2`、line1→`_3`、line2→base），属 f001 同根实现缺陷，建议 code reviewer 复核。
  - AC-001 用例中 `expect(paths[0]).toContain('bodies/response/')` 为弱断言（无害），若未来扩展 fixture 文件数，`paths[1]` 含 `_2` 的断言将变脆。
- 总体判断：测试真实调用生产 `build_archive` + `unzipSync`，AC-001 对「无回写」有判别力；但核心的「ref 对应各自记录」契约未被验证，且 AC-002 为恒真存在性断言。存在未解决 critical / important，FAIL。
- 系统性 follow-up：无（测试基础设施无缺口；本 task 缺陷为单点实现+fixture 问题）
- AC 复验方式：
  - AC-001：`re_verified`——独立运行 `npx vitest run tests/unit/archive_body_ref_consistency.test.ts`（2 passed）；并另写 scratch 探针复现「同 id 异 body」swap。但 AC-001 字面「只保留一文件」场景不可达，实际验证的是改名保留两文件场景。
  - AC-002：`re_verified`——运行通过；逐行核对其断言仅存在性，并据代码证明 base 名恒有文件、回写移除后仍 PASS（非判别）。
  - `coverage = 2 / 2`（两项均独立复验；复验结果暴露覆盖缺口，见 f001/f002）

verdict: FAIL

## Round 2 (2026-08-11 08:22 UTC+8)

reviewed_scope: e7a7f0c37de7d5f4

### t109_test_f004 - 遮蔽冲突模式无测试覆盖，该模式实现产生错误归属

- 严重度：important
- 锚点：范围「单测覆盖去重冲突样例」——现用例仅覆盖同路径 2-way；遮蔽样例（改名目标命中后续自然路径）未覆盖，且该模式实现错误
- 位置：`tests/unit/archive_body_ref_consistency.test.ts`（AC-001/AC-002/f001 三用例均用 `req_dup`×2 同路径 2-way）
- 问题：三用例冲突形态均为「同 request_id 同路径 2-way」，未覆盖「改名目标遮蔽后续自然路径」（`req`×2 + `req_2`）。真实 `build_archive`+`unzipSync` 下该 fixture 第三条记录 ref=`req_2.json`，但归档内 `req_2.json` 存第二条记录 body、第三条自身 body 存于 `req_2_2.json`——实现归属错误，现有测试全绿掩盖。
- 建议：补遮蔽用例：requests `req`(A)、`req`(B)、`req_2`(C)，断言三行 ref=`[req.json, req_2.json, req_2_2.json]`，且各 ref 解引用内容等于对应记录 body。

## 结论

- 前轮 finding 复核（Round 2）：
  - t109_test_f001（critical）：已消除。新增 f001 用例（同 id 异体 A/B）断言 `first_bytes=A`、`second_bytes=B`。突变验证：改回 off-by-one 后 f001 失败（AC-001 亦失败），判别力成立。
  - t109_test_f002（important）：已消除（判别由 f001 承担）。f001 实现 f002 建议的判别场景（同 id 异 body、断言 ref 内容）；AC-002 用例仍为纯存在性断言，但「引用可解析」恰是 AC-002 的可观察契约，且不再孤立——与 f001 互补。残留：AC-002 单独对「删回写」无判别力，已由 f001 覆盖，不阻断。
  - t109_test_f003（minor）：修不彻底。AC-001 标题改为「去重改名」；但 line73 注释仍写「两个不同 request_id」，fixture 实为相同 `request_id`，注释仍误导（应改为「相同 request_id 触发路径冲突」）。
- 改测方向复核：无迁就实现改测。新增 f001 为独立用例；未就地改写旧断言预期。
- 本轮新发现：1 条（t109_test_f004，important）
- 未进表的提示：
  - 全量 1235 测试 1 失败（`logger.test.ts` 慢测超时，与 T109 无关，见 code 报告）。
  - 可选扩展：3-way 同路径（`req3`×3）已探针验证实现正确，可补进用例锁定；非阻断。
- 总体判断：f001 判别测试有效，但遮蔽冲突模式无覆盖且实现错误（t109_test_f004 important 未解决），FAIL。
- 系统性 follow-up：无
- AC 复验方式：
  - AC-001：`re_verified`。运行测试文件 3 passed；独立探针覆盖 2-way 异体、3-way 同路径、遮蔽；遮蔽场景归属错误（f004）。
  - AC-002：`re_verified`。运行通过；断言仅存在性，据代码证明 base 名恒有文件（对「删回写」非判别），判别由 f001 承担。
  - `coverage = 2 / 2`

verdict: FAIL

## Round 3 (2026-08-11 08:40 UTC+8)

reviewed_scope: 152cd516aad9d9cd

## 结论

- 前轮 finding 复核（Round 3）：
  - t109_test_f001（critical）：已消除。f001 用例（同 request_id 异体 A/B）断言 `first_bytes=A`、`second_bytes=B`；突变验证（消费序号 +1）使 f001/AC-001 失败，判别力成立。
  - t109_test_f002（important）：已消除。判别由 f001 承担；AC-002 用例为纯存在性断言，但其断言对象恰为 AC-002 契约「引用可解析到文件」，判别由 f001/f003 互补覆盖，可接受。
  - t109_test_f003（minor）：仍存在。line73 注释仍写「两个不同 request_id 但 body 相同」，fixture 实为相同 `request_id`（`make_req('req_dup', ...)` ×2）；若真为不同 request_id，safe_request_id 结果不同、路径不冲突，不会触发改名。注释仍误导（应改为「相同 request_id 触发路径冲突」）。AC-001 用例标题「去重改名」措辞亦不精确（实现为路径改名保留两文件，无内容去重）。minor 非阻断。
  - t109_test_f004（important）：已消除。f003 用例（`req`×2 + `req_2`）断言三行 ref 解引用内容为 A/B/C；突变验证（首现强制保留原路径）使 f003 失败，判别力成立。
- 改测方向复核：无迁就实现改测。本轮无对既有断言预期的就地改写；f003 为新增独立用例。
- 本轮新发现：0 条
- 未进表的提示：request_body_ref 路径（`bodies/request/...`）无测试覆盖；代码与 response 走同一 final_seq/seen 逻辑（键为完整路径、两侧前缀不串扰），实现对称，可选补 1 例锁定，非阻断。
- 总体判断：f001/f004 两个阻断项均已修复且经突变验证；f003 为残留 minor（注释误导），无未解决 critical/important，PASS。
- 系统性 follow-up：无
- AC 复验方式：
  - AC-001：`re_verified`。运行测试文件 4 passed；突变验证 off-by-one 使 AC-001/f001 失败、「首现强制保留」使 f003 失败，f001/f003 用例判别力成立。
  - AC-002：`re_verified`。运行通过；断言为存在性，与 AC-002「引用可解析」契约一致；判别由 f001/f003 互补。
  - `coverage = 2 / 2`

verdict: PASS
