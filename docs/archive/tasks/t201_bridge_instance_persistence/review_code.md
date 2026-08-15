# Task review t201（reviewer_focus: 代码）

- task：`t201_bridge_instance_persistence`
- spec：`docs/tasks/t201_bridge_instance_persistence/spec.md`
- diff_anchor：`2773813bed85a06347775688033769095051232a`
- target：`git diff 2773813bed85a06347775688033769095051232a`
- round：1
- reviewed_at：2026-08-16 01:15 UTC+8

## Findings

### t201_code_f001 - spec 范围「文档更新」缺失：mcp_usage.md / deployment.md 未补实例文件配置

- 严重度：minor
- 锚点：spec 契约区「范围」「文档更新:`docs/guides/mcp_usage.md`、`docs/guides/deployment.md` 补充实例文件配置」；「Finalization 时更新的 blueprint」两条
- 位置：`docs/guides/mcp_usage.md`、`docs/guides/deployment.md`（本次 diff 均未触及）
- 问题：本 diff 仅改 config.ts/registry.ts/两个测试/task.md。两份 guide 全文件检索 `CAPTURE_ALL_INSTANCES_FILE` 零命中：mcp_usage.md 无实例文件配置示例；deployment.md 的 systemd unit（`[Service]` 段）无 `Environment=` 实例文件路径。spec 范围与 Finalization 均明确列出该文档交付物，当前为零实现。
- 建议：spec 已将两条文档项归入 Finalization 阶段，确认在 finalization 时补上（mcp_usage.md 增 `CAPTURE_ALL_INSTANCES_FILE` 配置示例与默认路径说明；deployment.md systemd unit 增实例文件路径 Environment 或说明默认落在 `WorkingDirectory/.local/instances.json`），勿遗漏。属交付缺口，非代码缺陷。

### t201_code_f002 - load_persisted 对合法 JSON 但畸形结构的实例数据无字段守卫

- 严重度：minor
- 锚点：AC-004 语义（损坏文件应从空开始）；「行为缺陷」：畸形结构装载出垃圾实例
- 位置：`src/bridge/registry.ts:62-74`
- 问题：`JSON.parse` 成功后仅 `as` 强转、无字段校验。文件内容为合法 JSON 数组但条目字段缺失（如 `[{"id":"x"}]`）时，`for...of` 不抛错，装载出 `instance_id/browser_label/token_hash/origin_extension_id` 全 `undefined` 的实例：该实例出现在 `build_status`/`list_browsers` 中（垃圾行），且 `token_hash` 为 `undefined` 时 `resolve_extension_auth`（server.ts:625 `if (!inst.token_hash) continue`）恒跳过 → 该 id 的 heartbeat 恒 401，占注册表槽位至 35s 后 sweep。AC-004 只覆盖 parse 抛错的损坏 JSON 与缺失文件（均从空开始），此形态不满足「从空开始」。注：本缺口为 t169 遗留，本 diff 仅新增 seen_at 行，非 t201 引入。
- 建议：load 时对 `item.id`/`instance_id`/`token_hash` 等做最小形状守卫，畸形条目跳过而非装载（保持「恢复即在线」语义）。

## 结论

- 前轮 finding 复核：Round 1，无前轮
- 本轮新发现：2 条（均为 minor）
- 未进表的提示：
  - 文件过大：config.ts 176 行 / registry.ts 238 行 / 两个测试 280 / 172 行，均远低于 400/600 阈值。无
  - 复杂度：改动函数 `load_persisted`（CC≈3）、`parse_bridge_cli_args`（CC≈5）、`default_instances_file_path`（CC=1），均 <10。无
  - 测试层观察（交 test reviewer）：(a) AC-003 可测试性声明承诺「persist 产物校验含 token_hash 非明文 + 文件 mode 0600」，但 t201 新测试仅断言内存中 token_hash 往返，未断言文件内容与 mode 0600；(b) AC-002 可测试性声明承诺「load 后 heartbeat 返回 200 不 401」，diff 无对应端到端用例，仅 code-path 成立；(c) AC-006 测试以 50ms sleep 等待 fire-and-forget persist（registry.ts:45-56 persist 为 void async）
  - pre-existing 观察：`persist()` 对已存在文件不收紧权限（writeFile `mode` 仅新建生效），与 token 文件 `persist_bridge_token` 的显式 `chmod`（bridge_token_file.ts:60-64）不一致；AC-003 的 0600 仅对新建文件成立。本 diff 未引入
- 总体判断：实现与 spec 契约区一致，六条 AC 均有对应实现，未发现 critical/important；2 条 minor 不阻断
- 系统性 follow-up：无

### AC 复验方式

- AC-001：re_verified — 默认路径接线（config.ts:78）＋ persist/load 往返与 label/origin 保留单测通过（`tests/unit/bridge_registry_refactor.test.ts` t201 首条；两测试文件 35 passed）；进程级 kill/重启未实测，由 registry 重建模拟覆盖（见 spec 可测试性声明）
- AC-002：re_verified（code-path）— 追踪 `resolve_extension_auth`（server.ts:615-638）以 token_hash timingSafeEqual 认证 + `load_persisted` 保留 token_hash（registry.ts:70）→ 重启后 heartbeat 命中 200；无自动化端到端测试，见结论测试层观察
- AC-003：re_verified — `persist()`（registry.ts:45-56）写 JSON 且字段为 `token_hash`（非明文 token）、`writeFile { mode: 0o600 }`；已存在文件不收紧权限为 pre-existing，见结论观察
- AC-004：re_verified — 新测试覆盖损坏 JSON（`'{not valid json'` → size 0）；缺失文件走 readFile 抛错 → catch → 从空开始（registry.ts:75-77）
- AC-005：re_verified — `npm run bridge`（package.json:32 `tsx src/bridge/main.ts`）与 manual（`node artifacts/bridge/bridge.mjs`，esbuild bundle of main.ts）均入 `run_bridge_main` → `parse_bridge_cli_args` 单一解析路径（main.ts:25）；SessionStart hook 与 systemd unit 亦经 bridge.mjs
- AC-006：re_verified — 新测试断言 load 后 `seen_at` 落在 load 时刻附近（registry.ts:63）且 `build_status` 仍列出（首次 sweep 不清除）；60s 旧时间戳 > 35s TTL+grace 能抓出未重置回归

coverage = 6 / 6

reviewed_scope: c13df9d50a8201bd

verdict: PASS

## Round 2 (2026-08-16 01:13 UTC+8)

- round：2（追加，不覆盖 Round 1）
- target：`git diff 2773813bed85a06347775688033769095051232a`（当前工作区）
- 复核对象：前轮 f001 / f002 处置落实情况；扫描修复过程引入的新问题

## Findings

### t201_code_f003 - f002「记 pending」处置未落地：无 pending 条目，fix_ref p052 指向无关条目

- 严重度：minor
- 锚点：Round 1 f002 处置指令（pre-existing 记 pending）；task.md 处置表「t201_code_f002 | minor | 遗留 | …记 pending | p052」
- 位置：`docs/tasks/t201_bridge_instance_persistence/task.md`（处置表）；`docs/pending/todo/`（应建未建）
- 问题：处置表声称「记 pending | p052」，但全仓检索零命中可验证的 follow-up 载体：
  - worktree `docs/pending/todo/` 仅 `.gitkeep`，无任何新条目；
  - 主仓 `docs/pending/todo/` 仅 `p052_browser_label_backfill_not_show.md`——内容是「浏览器编号回填后设置页不显示」，与 load_persisted 畸形守卫无关；
  - `docs/pending/`、`docs/archive/pending/` grep「畸形 / 字段守卫 / load_persisted」零命中。
  - 结论：f002 的 pre-existing 畸形 JSON 守卫缺口没有任何跟踪载体，处置计划将静默丢失。
- 建议：在 pending 总账实际建条目（主仓下一可用编号 p053）记录「load_persisted 对合法 JSON 但畸形结构无字段守卫」，或澄清 fix_ref 真实意图；处置表 fix_ref 不再指向无关的 p052。

### t201_code_f004 - f001 处置表状态标「已修」与实际不符：docs/guides 未在 diff 改动

- 严重度：minor
- 锚点：Round 1 f001（Finalization 阶段文档交付物）；task.md 处置表「t201_code_f001 | minor | 已修 | Finalization 阶段补 mcp_usage/deployment 文档 | docs/guides/*.md」
- 位置：`docs/tasks/t201_bridge_instance_persistence/task.md`（处置表）；`docs/guides/mcp_usage.md`、`docs/guides/deployment.md`
- 问题：`git diff 2773813bed85a06347775688033769095051232a` 不含 docs/guides 两文件；全文件 grep `CAPTURE_ALL_INSTANCES_FILE` / `instances.json` 在 `docs/guides/` 零命中。f001 实际是 Finalization 待办（spec「Finalization 时更新的 blueprint」已将两文档归入该阶段），与 Round 1 判定一致；但处置表状态标「已修」，与 diff 矛盾，集成门禁若按「已修」采信会误判文档已交付。
- 建议：状态改标「遗留 / Finalization」，与 f002 的「遗留」口径一致，fix_ref 保留 docs/guides/*.md；Finalization 收尾时补 mcp_usage.md 配置示例与 deployment.md systemd Environment 路径。

## 结论

- 前轮 finding 复核：
  - f001（minor，文档待 Finalization）：**仍存在，处置语义正确但状态标签错**。文档确认未在 diff 改动（guides grep 零命中），符合 spec「Finalization 时更新的 blueprint」的归期；disposal rationale「Finalization 阶段补」与 spec 一致。仅状态「已修」标注与实际不符，见本轮 f004。
  - f002（minor，pre-existing 记 pending）：**处置未落地**。任务表自称「记 pending | p052」，但 pending 无对应条目且 p052 指向无关的浏览器编号回填条目，见本轮 f003。原缺口本身仍存在（registry.ts:62-74 无字段守卫），本 diff 未触及，属 t169 pre-existing，非本轮引入。
- 本轮新发现：2 条（t201_code_f003、t201_code_f004，均 minor）
- 未进表的提示：
  - 源码 diff 与 Round 1 完全一致（config.ts 增 `default_instances_file_path`、registry.ts:63 seen_at 重置），无新增源码路径，无新增安全/契约/性能面。
  - 修复过程新增两个测试文件改动（address test reviewer t201_test_f001..f005），源码侧无可观测问题。残留测试侧观察（交 test reviewer）：(a) `default_instances_file_path` 用例就地改 `process.env.XDG_RUNTIME_DIR` / `CAPTURE_ALL_BRIDGE_TOKEN_FILE` 后仅 delete、不还原原值，同进程内后续用例依赖时易污染；(b) `wait_for_file` 轮询以 readFile 成功为就绪判据，writeFile 未落完时理论上可读到半截内容（小文件概率极低），仍属 flake 面。
  - 文件过大 / 复杂度：config.ts 176 行、registry.ts 238 行，均低于 400 阈值；改动函数 CC 均 <10。无。
- 总体判断：源码与 Round 1 一致，无新增 critical/important；f001 归期正确仅标签错、f002 处置未落地均为 minor，不阻断。
- 系统性 follow-up：无（f002 的 pending 建条目即 f003 建议，不另建 task）

### AC 复验方式（Round 2）

- AC-001 / AC-002 / AC-005：re_verified（Round 1）——本轮源码未变；新增双实例组合恢复用例（tests/unit/bridge_registry_refactor.test.ts AC-001）独立复验 size/label 保留，`npx vitest run` 两文件 40 passed。
- AC-003：re_verified——新增用例断言文件内容含 `token_hash`、无明文 token 字段（`raw[0].token` / `raw[0].instance_token` toBeUndefined）、`stat(file).mode & 0o777 === 0o600`；`default_instances_file_path` 断言对齐 token 文件目录（XDG 与 .local 回退两路径）。
- AC-004：re_verified——损坏 JSON（`{not valid json`）与缺失文件（ENOENT）两用例均断言 instances.size===0，不抛错。
- AC-006：re_verified——persist 60s 旧 seen_at 后 load，断言 seen_at 重置到 load 时刻 ±1s 且实例不被首次 sweep 删除。

coverage = 6 / 6

reviewed_scope: 38d66a50073bd84d

verdict: PASS

## Round 3 (2026-08-16 01:17 UTC+8)

- round：3（追加，不覆盖前轮）
- target：`git diff 2773813bed85a06347775688033769095051232a`（当前工作区）
- 复核对象：Round 2 f003 / f004 处置落地；处置表 Round 2 行格式与指向；修复过程引入的新问题

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核（以主仓 pending 与 worktree diff 为准，不采信处置表自称）：
  - f003（minor，f002 fix_ref 改指 p053）：**已消除**。
    - 主仓 `/home/karon/karson_ubuntu/capture_all/docs/pending/todo/p053_instances_file_load_no_field_guard.md` 已存在（926B，2026-08-16 01:14 建），内容标注来源「t201 Round 2 code review t201_code_f002（pre-existing，非 t201 引入）」，含现象/影响/根因/已扫同类/测试缺口/线索 `src/bridge/registry.ts:62-74`，处理「未开」——即 Round 2 f003 建议的跟踪载体真实落地，非仅改标。
    - 处置表 Round 1 行 f002：`fix_ref` 已从 p052 改为 `p053`，与主仓条目编号一致。
    - 处置表 Round 2 行 f003：status「已修」与事实相符（fix_ref 改指 + pending 条目已建），fix_ref 指向 p053 文件路径。
  - f004（minor，f001 状态改「遗留 / Finalization」）：**已消除**。处置表 Round 1 行 f001 状态改为「遗留」，rationale「Finalization 阶段补 mcp_usage/deployment 文档」，fix_ref 保留 `docs/guides/*.md`——与 spec「Finalization 时更新的 blueprint」归期及 Round 1 判定一致；`git diff` 确认 docs/guides 两文件仍未在 diff 改动，「遗留」与实际相符。
  - test_f006（minor，wait_for_file 轮询防空串，test 领域顺带确认）：wait_for_file 已改为「readFile + trim 非空 + JSON.parse 可解析」判定，注释标注 f005/f006，规避 create/truncate 间隙读到空串；与处置表 rationale 相符。
- 本轮新发现：0 条
- 未进表的提示：
  - Round 2 未进表提示中残留的测试侧观察 (a)（`default_instances_file_path` 用例就地改 `process.env.XDG_RUNTIME_DIR` / `CAPTURE_ALL_BRIDGE_TOKEN_FILE` 后仅 delete、不还原原值，同进程内后续用例潜在污染）仍存在，属 test reviewer 领域、非 blocking；可顺带在后续 test review 中提示还原原值。
  - task.md diff 其余改动仅 front matter（status/branch/worktree/diff_anchor 置 active）与处置表新增，无流程外写入。
  - 文件过大 / 复杂度：源码 config.ts 176 行 / registry.ts 238 行低于阈值，改动函数 CC <10。无。
- 总体判断：Round 2 全部 finding（f003/f004）已按建议真实落地（pending 条目已建、fix_ref 一致、f001 状态改「遗留」），处置表 Round 2 行格式与指向正确，修复过程未引入新源码问题；无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

本轮复核范围仅为流程文件（task.md 处置表、主仓 pending 条目）与处置表指向，不涉及源码/测试行为变更，AC 行为复验沿用 Round 2 结论：

- AC-001 / AC-002 / AC-003 / AC-005 / AC-006：re_verified（Round 2）——本轮源码与测试 diff 未变，`npx vitest run` 两文件通过结论沿用。
- AC-004：re_verified（Round 2）——损坏/缺失文件两用例继续有效；f002 的畸形结构守卫缺口已建 pending p053 跟踪，不属本 task AC 阻断。

coverage = 6 / 6

reviewed_scope: 152399c9bb30660d

verdict: PASS

## Round 4 (2026-08-16 01:24 UTC+8)

- round：4（追加，不覆盖前轮）
- target：`git diff 2773813bed85a06347775688033769095051232a`（当前工作区）
- 复核对象：处置表修正后 status=遗留 行 fix_ref 合法性（check_review_status 报错点）；review_scope=stale 根因；修复过程引入的新问题

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核（以 diff / 指纹 / 主仓 pending 为准，不采信处置表自称）：
  - f001（minor，guides 文档 7a 补）：**已消除**。处置由「遗留」改「已修」，fix_ref 由通配 `docs/guides/*.md` 改指 `docs/guides/mcp_usage.md, docs/guides/deployment.md`，rationale「7a 收尾阶段补 mcp_usage/deployment 文档」。7a 收尾文档（`task-work` Step 7a）明确要求更新受影响的 `docs/guides/`，且属于本 task 执行 commit 前的收尾——f001 在本 task 内闭环，非跨 task 遗留，标「已修」+ rationale 自洽。`docs/guides/` 两文件当前仍未补（grep `CAPTURE_ALL_INSTANCES_FILE` 零命中、未入 diff），需 7a 落地，不阻断。
  - f002（minor，pre-existing 畸形守卫，遗留）：**保持合法**。fix_ref=p053，匹配 `p[0-9]+`；主仓 pending p053 条目存在（Round 3 已核实），check_review_status 遗留行校验通过。
  - f003 / f004（Round 2 minor）：Round 3 已判消除，本轮源码 diff 未变，保持。
  - test 侧 f001-f006：test 报告 Round 4 已复核无回归，保持。
- 本轮新发现：0 条
- 未进表的提示：
  - **review_scope=stale 根因 = code 报告 Round 3 reviewed_scope 转录笔误，非处置表变更、非源码变更**。当前指纹（render_review_prompts / check_review_status 单一真相源重算，3 次稳定）`152399c9bb306d60`；test 报告 Round 3（`152399c9bb306d60`）一致；code 报告 Round 3 写 `152399c9bb30660d`（末三位 `60d`，应为 `d60`，转置错位）。SHA 内容变化雪崩式全变，仅末三位转置只可能是手录笔误。`task.md` 处置表（含 code f001 fix_ref/status 修正）被指纹排除列表覆盖，不是 stale 成因。`check_review_status.py` 取报告全文**最后一条** `reviewed_scope` 比对，故 Round 4 本小节写入正确指纹即可消除 stale；历史 Round 3 行保持笔误无害（脚本只取最后一条，不回溯历史）。源码/测试自 Round 3 起字节级未变（指纹一致即证）。
  - 处置表 f001 状态由 Round 2 的「遗留/Finalization」改回「已修」，与 test reviewer 提示一致存在表内语义张力——「已修」按 task.md 定义应为「本 task 内已按 finding 改完」，而 guides 文档在 7a 才落地。因 7a 属本 task 收尾、fix_ref 精确、rationale 明确，判定不阻断；7a 执行时若 guides 未补，f001 即未真闭环，须由 7a 落地兜底。
  - 源码侧：config.ts / registry.ts / 两测试与 Round 3 逐字节一致，无新增安全 / 契约 / 性能面。文件过大（config.ts 176 行 / registry.ts 238 行）、复杂度（改动函数 CC <10）均不达阈值。无。
- 总体判断：处置表修正后唯一 status=遗留 行（f002→p053）fix_ref 合法，check_review_status 遗留行校验报错点已消除；review_scope=stale 为 code 报告 Round 3 指纹转录笔误，Round 4 写回正确指纹即解除；无未解决 critical/important → PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 4）

本轮复核范围仅为处置表修正与指纹比对，源码/测试 diff 自 Round 3 起字节级未变（当前指纹 `152399c9bb306d60` 与 Round 3 test 报告一致），AC 行为复验沿用 Round 3 结论：

- AC-001 / AC-002 / AC-003 / AC-004 / AC-005 / AC-006：re_verified（Round 3）——指纹逐字节一致证明被审 diff 未变，`npx vitest run` 两文件 40 passed 结论沿用；AC-005 进程级等价为 trust_prior（依赖「四启动路径共用 config 解析路径」设计），沿用前轮。

coverage = 6 / 6

reviewed_scope: 152399c9bb306d60

verdict: PASS
