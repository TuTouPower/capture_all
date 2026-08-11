---
tid: "t113"
slug: "logger_url_boundary_detection"
title: "修复 Logger URL 边界误判"
status: "done"
branch: "t113_logger_url_boundary_detection"
worktree: ""
review_level: "full"
diff_anchor: "8b794bc9c218d63936c0957506654b8a9f3f5068"
depends_on: ""
conflicts_with: ""
note: ""
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

### Round 1 (2026-08-11 12:27 UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t113_code_f001 | important | 已修 | lookbehind 白名单并入 `=`，`path=/login?token=x`、`url=?token=x` 等序列化形态恢复脱敏，测试补 3 例（等号前置 path/bare、引号内 path） | 源码:logger.ts / 测试:t113 测试文件 |
| t113_code_f002 | minor | 已修 | spike 脚本 import 路径修正为相对仓库根，`npx tsx code/spike.ts` 13/13 可复现 | 文档:spike code/spike.ts |
| t113_code_f003 | minor | 已修 | 带空格三元与独立 `?query` 同享 `\s` URL 边界语义，属用户确认的已知权衡；spec 上下文区与 spike 报告披露完整边界，测试固化该行为 | 文档:spec 上下文区 / 测试:t113 测试文件 |
| t113_test_f001 | minor | 已修 | 对象负例改 `toEqual` 逐字保留断言（防对象被吞/置空仍绿） | 测试:t113 测试文件 |
| t113_test_f002 | minor | 已修 | 补 Error 实例用例，直触达 logger.ts Error 分支（message/stack 路径） | 测试:t113 测试文件 |
| t113_test_f003 | minor | 已修 | 补行首 path/bare、方括号/尖括号/单引号前置边界用例；逗号用例保留（逗号被 URL 字符集吞入属实际行为，另补方括号/尖括号/引号验证前置边界） | 测试:t113 测试文件 |
| t113_code_f004 | minor | 已修 | spike.ts CANDIDATE 与 d001 规则文本同步为含 `=` 版本，报告主张可复现；review_test.md 指纹格式对齐 checker | 文档:spike code + d001 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~003 全部由 `tests/unit/t113_logger_url_boundary.test.ts` 23 用例覆盖（负例 5 + 正例 17 + Error 实例 1），黑盒 `npm test` 1289 passed + `tsc --noEmit` 通过

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001 important 未修）
- Round 1 test：PASS（3 minor 建议）
- Round 2 code：PASS（f004 minor 新增）
- Round 3 code（指纹回写）：PASS
- Round 2 test（指纹回写）：PASS

`single`：

- Round 1 general：N/A（review_level=full）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- Logger 任意文本 URL 扫描改为边界启发式（lookbehind `(?<=^|[=\s([,<"'])`），紧邻三元/可选链逐字保留，明确 URL 上下文与 `=` 前置序列化形态继续脱敏；spike s001 验证 13/13，23 用例锁定边界，4 轮审阅闭环（code 3 / test 2）。
