---
tid: "t098"
slug: "network_hook_config_gate"
title: "fix: network_hook 遵循 capture_network 与 body 配置门控"
status: "done"
branch: "t098_network_hook_config_gate"
worktree: ""
review_level: "full"
diff_anchor: "6774a8057b94f883181c005194dae48999b5cbf7"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P0-7 verified"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：content_script.start_capture 无条件 start_network_hook，无视 capture_network。
- 修复：门控 if(config.capture_network) 包 network_hook/websocket，else 显式 stop；network_hook 加 capture_response_body 参数 → build_page_script 注入 CAPTURE_BODY 控制 body 采集。
- Round 1 审阅 FAIL：AC-003 body 语义缺失（network_hook 自称 body 采集器但未按 capture_response_body 门控）+ 测试误标。修后 Round 2 出 XHR body_status 不一致 minor（Round 3 修）。
- 静态扫描测试为主（content_script 顶层副作用无法 import）；行为测试 jsdom 验证门控与 body 语义。
- 全量 1193 通过，tsc 无错。

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

### Round 1 (2026-08-11 04:44 UTC+8)

code FAIL（f001 important body 语义缺失 + f002 minor）；test FAIL（f001/f002 important）。

### Round 2 (2026-08-11 04:45 UTC+8)

code PASS / test PASS；f001 修（CAPTURE_BODY 注入脚本控制）、新增 2 minor。

### Round 3 (2026-08-11 04:46 UTC+8)

code PASS / test PASS；f003（XHR body_status 对齐）修。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t098_code_f001 | important | 已修 | build_page_script(capture_response_body) 注入 CAPTURE_BODY，body 关闭跳过采集 | network_hook.ts |
| t098_code_f002 | minor | 已修 | 静态断言重写为单一门控正则 | network_hook_config_gate.test.ts |
| t098_code_f003 | minor | 已修 | XHR body_status 默认对齐 not_enabled | network_hook.ts:206 |
| t098_test_f001 | important | 已修 | 删恒真断言，改门控正则 | network_hook_config_gate.test.ts |
| t098_test_f002 | important | 已修 | 行为测试补 AC-003/003b | network_hook_gate_behavior.test.ts |
| t098_test_f003 | minor | 遗留 | 静态测试未断言调用次数 | p015 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL → Round 2 code：PASS → Round 3 code：PASS
- Round 1 test：FAIL → Round 2 test：PASS

### 结果摘要

- content_script 门控 network_hook/websocket 按 capture_network；network_hook 注入脚本按 capture_response_body 控制 body 采集（CAPTURE_BODY）。3 轮审阅修 body 语义缺失与测试误标，Round 3 PASS。

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
