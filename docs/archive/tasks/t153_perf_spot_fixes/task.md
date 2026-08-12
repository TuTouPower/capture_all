---
tid: "t153"
slug: "perf_spot_fixes"
title: "perf: 性能专项（压缩/格式化/扫描/渲染/轮询）"
status: "done"
branch: "t153_perf_spot_fixes"
worktree: ""
review_level: "single"
diff_anchor: "325e93bdc6fbed3d310752246d7aa082e2da3ccd"
depends_on: ""
conflicts_with: ""
note: "intensive-review 聚合：B1-M11 zipSync、B1-M12 system_time、B2-M18 app_log 全扫、B4-M8 O(n²)、B3-M5 hook 缓冲、B5-L2/L3 轮询、B5-I1 list 全量"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 8 项 AC 全部落地，均为行为等价优化：AC-001 archive_builder `zipSync`→异步 `zip`（Promise 包裹回调）；AC-002 system_time browser 分支复用 formatter 单例缓存；AC-003 app_log trim 增量估算字节、越限才全表扫描；AC-004 dashboard 时间线预建 `Map<event,idx>` 消 O(n²)；AC-005 network_hook 注入脚本流式读响应体、超 cap 短路 too_large + cancel reader；AC-006 popup `refresh_counts` 加 `poll_in_flight` 单飞；AC-007 `list_captures` 支持可选 `limit`，popup 拉最近 10 条。
- 关键决策：
  - AC-005 上限可注入（`build_page_script` 第 3 参、`start_network_hook` cfg 新增 `max_body_capture_bytes`），`content_script` 从 config 透传，默认 `MAX_BODY_CAPTURE_BYTES` 行为等价；非流式响应回退 `clone().text()` 整读截断保留。
  - AC-004 idx 映射用对象恒等 Map，与原 `indexOf` 的 `===` 语义严格等价（filter 返回同引用），行为不变。
  - AC-003 估算仅在 flush 成功后累计、扫描/clear 后归零、失败写入不累计；「越限才扫表」引入 ~2x 上限滞后为 spec 允许的增量计数固有代价（reviewer 确认接受）。
- 踩坑：源码结构锚点断言（`not.toMatch(/zipSync/)`、`not.toMatch(/detail_events\.indexOf/)`）会误命中自己写的注释 token，改用「import 形态」或措辞规避；Intl spy 需普通函数转发保持可构造。
- 验证：全量 `npm test` 152 files / 1539 tests 绿；`npx tsc --noEmit` exit 0；reviewer 独立复验同绿。

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

### Round 1 (2026-08-13 02:50 UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t153_gen_f001|minor|已修|AC-003 明示允许「增量计数」；增量估算越限才扫表导致的 ~2x 上限滞后为固有有界代价（扫描后归零重新累计），reviewer 判定接受|app_log_storage.ts:225-229|
|t153_gen_f002|minor|遗留|limit 入参无校验，现无调用方触发（popup 恒定 10）；防御性缺口登记|p039|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用；8/8 全部由 reviewer 独立复验（re_verified），见 `review_general.md` AC 复验方式小节。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A

`single`：

- Round 1 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 8 项性能优化全部行为等价落地，全量测试 + tsc 绿，reviewer Round 1 PASS（2 minor）。已知小瑕疵：`storage.ts:162` 上方 t153 注释「最旧优先倒序」措辞含糊（实际为 `started_at` 倒序=最新优先），reviewer 判定非 blocking cosmetic，为避免改动已审查 diff 不在此轮改。

