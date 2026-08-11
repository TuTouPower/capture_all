---
tid: "t121"
slug: "content_message_hmac_auth"
title: "content 采集消息 per-message HMAC 认证"
status: "done"
branch: "t121_content_message_hmac_auth"
worktree: ""
review_level: "full"
diff_anchor: "0d2b4f4be83c58d16acf3a3a401bf77d61fdb517"
depends_on: ""
conflicts_with: ""
note: "p010 页面可伪造 nonce 门控，升级 per-message HMAC"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-11 18:25 UTC+8)

code 路 2 important + 1 minor；test 路 2 critical + 1 important + 1 minor。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t121_code_f001 | important | 已修 | stop→start 断流：注入脚本 guard 改为「还原上次 hook 后重装」，每次 start 持最新 SECRET；T121restart 回归 | src/extension/content/network_hook.ts / websocket_capture.ts / storage_capture.ts |
| t121_code_f002 | important | 已修 | JS 签名路径零执行测试：新增 content_hmac_vectors.test.ts（TS/JS 双实现对照标准向量）+ T121e2e（注入脚本 fetch hook 真实签名交叉校验） | tests/unit/content_hmac_vectors.test.ts |
| t121_code_f003 | minor | 已修 | websocket_capture_injected_script.test.ts build_page_script 无参调用 → 传 TEST_SECRET | tests/unit/websocket_capture_injected_script.test.ts |
| t121_test_f001 | critical | 已修 | 同 code_f001（restart 断流回归，T121restart 覆盖真实重注入签名路径） | tests/unit/content_postmessage_nonce.test.ts |
| t121_test_f002 | critical | 已修 | 同 code_f002（向量 + e2e 交叉验证） | tests/unit/content_hmac_vectors.test.ts |
| t121_test_f003 | important | 已修 | AC-001s 断言语义修正 + ADR-020 记录威胁模型边界（对抗性 DOM hook 窃取不在防御范围） | docs/blueprint/decisions.md ADR-020 |
| t121_test_f004 | minor | 已修 | storage/ws 补「正确 nonce + 签名缺失被拒」负向用例 | tests/unit/storage_capture.test.ts / websocket_capture_page.test.ts |

### Round 2 (2026-08-11 18:40 UTC+8)

code 路 2 minor；test 路 3 minor。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t121_code_f004 | minor | 已修 | T121restart 断言锁单条无双写（===1）+ storage secret 旋转回归；storage/ws 注入脚本级重注入用例未补（同构逻辑由 network T121restart 覆盖），登记遗留 | tests/unit/content_postmessage_nonce.test.ts / p031 |
| t121_code_f005 | minor | 已修 | spec 未知契约清单条目删除并注明结论 + ADR-020 | docs/tasks/t121_content_message_hmac_auth/spec.md |
| t121_test_f005 | minor | 已修 | 向量补跨块边界/长 key/多字节 UTF-8（JS/TS 双实现对照） | tests/unit/content_hmac_vectors.test.ts |
| t121_test_f006 | minor | 已修 | AC-001s 标题/注释与 ADR-020 威胁模型边界对齐 | tests/unit/content_postmessage_nonce.test.ts |
| t121_test_f007 | minor | 已修 | AC-003b 标题同步新 guard 语义 | tests/unit/content_postmessage_nonce.test.ts |

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t000_code_f001 | critical/important/minor | 已修 | 一句话 | 文件:行 |
| t000_test_f002 | minor | 遗留 | 一句话 | pNNN |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003/004 由向量测试、注入脚本 e2e、负向用例与旋转回归覆盖；ADR-020 记录取舍与威胁模型。`handoff.json` 的 `ac_evidence` 逐条给出引用。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001/f002 important 断流与签名路径零测试，已修）
- Round 1 test：FAIL（f001/f002 critical 同源，已修）
- Round 2 code：PASS（2 minor，已修）
- Round 2 test：PASS（3 minor，已修）
- Round 3 code：PASS（0 新 finding）
- Round 3 test：PASS（0 新 finding）

`single`：

- N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

content 三通道（network/ws/storage）per-message HMAC 认证升级：secret 每次 start 旋转、内联注入脚本闭包、同步 HMAC-SHA256 双实现（向量锁定）、重注入还原+重装防断流、ADR-020 记录威胁模型边界。全量 vitest 131 文件 1375 用例绿，tsc 0 错误。遗留 1 条：p031（storage/ws 注入脚本级重注入测试扩展）。
