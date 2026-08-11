---
tid: "t111"
slug: "har_started_datetime_encoding"
title: "fix: HAR startedDateTime 与 base64 content.encoding"
status: "done"
branch: "t111_har_started_datetime_encoding"
worktree: ""
review_level: "full"
diff_anchor: "aceba36f99e96e118dc042624facb366442aea4e"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P1-16"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- HAR 绝对开始时间链：exporter `build_har_entry` 增加 `started_at_ms` 参数，解析 `absolute_time(number) → start_time_ms(绝对 epoch 直接用) → started_at_ms + relative_time → started_at_ms 回退`；修正 R1 f001（websocket start_time_ms 双计）。
- 接线：`handle_network_request`（service_worker.ts）写前补 `request.absolute_time = started_at + event.relative_time_ms`，守卫 `!(start_time_ms>0)` 保留 websocket 绝对 epoch（R2 f002 遮蔽回归）。
- base64 编码：`response_body_encoding==='base64'` 时 `content.encoding='base64'`；`content.size` 缺失 bytes 时用 `base64_decoded_len` 解码字节数（R1 f004）。
- R1 code f001（critical）/test f001（important）揭示 start_time_ms 生产语义（websocket=绝对 epoch，cdp primary 恒 null），为字段真实语义留证。

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

### Round 1 (2026-08-11 09:20 UTC+8)

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t111_code_f001 | critical | 已修 | start_time_ms 绝对 epoch 直接用，不再双计 | src/extension/background/exporter.ts:326-333 |
| t111_code_f002 | important | 已修 | handle_network_request 补 absolute_time 接线 | src/extension/background/service_worker.ts:906-911 |
| t111_code_f003 | minor | 已修 | 移除字符串 absolute_time fixture | src/extension/background/exporter.ts:317 |
| t111_code_f004 | minor | 已修 | base64 体 content.size 用 base64_decoded_len | src/extension/background/exporter.ts:22-26,351 |
| t111_test_f001 | important | 已修 | AC-001 改三用例覆盖真实生产形状（absolute_time/websocket/回退） | tests/unit/exporter.test.ts AC-001a/b/c |

### Round 2 (2026-08-11 09:30 UTC+8)

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t111_test_f002 | important | 已修 | 接线守卫 `!(start_time_ms>0)` 保留 websocket 绝对 epoch | src/extension/background/service_worker.ts:907-910 |

### Round 3 (2026-08-11 09:42 UTC+8)

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t111_test_f003 | minor | 已修 | AC-001a/b fixture 改独立值，锁定字段优先级 | tests/unit/exporter.test.ts AC-001a/b |
| t111_test_f004 | minor | 遗留 | 接线守卫无单测锁定（未来移除守卫遮蔽回归） | p025 |

### Round 4 (2026-08-11 09:52 UTC+8)

零新 finding，code/test 均 PASS，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL → Round 2 code：PASS → Round 3 code：PASS → Round 4 code：PASS
- Round 1 test：FAIL → Round 2 test：FAIL → Round 3 test：PASS → Round 4 test：PASS

### 结果摘要

- HAR startedDateTime 用真实绝对开始时间（absolute_time→start_time_ms→relative 链），修复 CDP-primary 1970 退化与 websocket 双计回归；base64 响应体设 content.encoding 且 size 按解码字节。4 轮审阅修 websocket 双计、primary 无时间、接线遮蔽与测试碰撞。
