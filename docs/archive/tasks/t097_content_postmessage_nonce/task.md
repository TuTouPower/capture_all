---
tid: "t097"
slug: "content_postmessage_nonce"
title: "security: content postMessage 全通道 per-page nonce 防伪造"
status: "done"
branch: "t097_content_postmessage_nonce"
worktree: ""
review_level: "full"
diff_anchor: "5293872288edec8c210f804969d0bebb4b2b37df"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P0-6 verified"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：page 注入通道（network/ws/storage）仅校验静态 SIGNAL，页面可 postMessage 伪造采集事件。
- 初版：per-start nonce + build_page_script(nonce) 注入闭包 NONCE + 接收端校验。审阅发现 stop→start（guard 阻止二次注入）与扩展重建两条路径失配 → 重构为「注入脚本 post 从 window 动态读 nonce，content 每次 start 写 window 变量」。
- Round 3 发现 http 非 secure context crypto.randomUUID undefined → generate_nonce fallback（能力检测 + Math.random）。
- jsdom 不执行注入 script 元素，window 变量写路径用手工设置模拟；测试钩子 _set_nonce_for_test 规避 jsdom crypto 污染。
- 全量 1186 通过，tsc 无错。
- 4 轮审阅：修 3 important（restart/重建失配、http crypto）、多处 minor；遗留 5 条登记 p010-p014。

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

### Round 1 (2026-08-11 04:10 UTC+8)

code FAIL（f001 important + 3 minor）；test FAIL（f001/f002 important + f003 minor）。

### Round 2 (2026-08-11 04:12 UTC+8)

code FAIL（f005 important，扩展重建）；test FAIL（f004 important，restart 无回归测试）。

### Round 3 (2026-08-11 04:13 UTC+8)

code FAIL（f006 important，http 页 crypto.randomUUID 不可用）；test PASS。

### Round 4 (2026-08-11 04:14 UTC+8)

code + test 均 PASS。累计处置：

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t097_code_f001 | important | 已修 | 动态 window nonce 方案解耦 stop→start | 三通道 update_page_nonce |
| t097_code_f002 | minor | 已修 | JSON.stringify 插值转义 | network_hook.ts:19 等 |
| t097_code_f003 | minor | 已修 | 测试钩子改 string\|null 语义 | 三通道 |
| t097_code_f004 | minor | 已修 | 重构消除 nonce 字面量缩进问题 | network_hook.ts |
| t097_code_f005 | important | 已修 | 动态 window nonce 方案解耦扩展重建 | 三通道 update_page_nonce |
| t097_code_f006 | important | 已修 | generate_nonce fallback 覆盖 http 页 | 三通道 generate_nonce |
| t097_code_f007 | minor | 遗留 | nonce 存 window 全局可直读，安全取舍 | p010 |
| t097_code_f008 | minor | 遗留 | generate_nonce 三通道重复 | p011 |
| t097_test_f001 | important | 已修 | ws/storage 补负向用例 | websocket_capture_page/storage_capture.test.ts |
| t097_test_f002 | important | 已修 | ws 逐条断言 nonce + network e2e | 各测试文件 |
| t097_test_f003 | minor | 遗留 | AC-003 用测试钩子未验证真实 randomUUID | p012 |
| t097_test_f004 | important | 已修 | 补 AC-003b restart 连续性回归 | content_postmessage_nonce.test.ts |
| t097_test_f005 | minor | 遗留 | AC-003b 手工写 window nonce（jsdom 限制） | p013 |
| t097_test_f006 | minor | 遗留 | AC-002http 注释高估「nonce 非空」证据 | p014 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL → Round 2 code：FAIL → Round 3 code：FAIL → Round 4 code：PASS
- Round 1 test：FAIL → Round 2 test：FAIL → Round 3 test：PASS → Round 4 test：PASS

### 结果摘要

- 三通道引入 per-start nonce：注入脚本 post 从 window 动态读，content 每次 start 更新 window 变量，接收端校验；generate_nonce fallback 覆盖 http 页。4 轮审阅修 3 个 important blocker（restart/重建 nonce 失配、http crypto.randomUUID），Round 4 PASS。

- 一句话；无额外说明可写「见上」
