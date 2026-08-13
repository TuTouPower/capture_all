# repo_template 工具链缺陷详解（供执行 Agent 修复）

- 来源：`docs/reviews/review_20260813_114417/`（intensive-review 2026-08-13）
- 范围：`scripts/repo_template/` 工具链（task 状态机、ledger、integrate、pending/findings 取号、review 门禁、fingerprint、front matter 解析）
- 共 14 条：High 5、Medium 6、Low 3。承接 task 见每条末尾；**RT-006 未落入任何 task，需补**。

---

## High（必修，5 条）

### RT-001 — CI 不运行 Python 工具链测试，`tests/repo_template/` 全部在 main 门禁之外

- **Severity / Confidence:** High / 95%
- **定位:** `.github/workflows/ci.yml:15-29,31-42`；`docs/blueprint/testing.md:5-6`；`package.json:26`；`vitest.config.ts:6-7`；`tests/repo_template/package.json:1-6`

**根因与证据:**

1. `ci.yml` 只有两个 job：`quality`（`npm ci` → `scan:tracked-tree` → `npm test` → `npm run build` → `npm audit`×2）与 `e2e`（Playwright）。全程无 `setup-python`、无 `python3`、无 `pytest`（已 grep 确认 `.github/` 下零 python 引用）。
2. `npm test` = `vitest run`（`package.json:26`）；vitest 只收集 JS/TS，`tests/repo_template/test_*.py` 是 Python，永远不会被执行。
3. `docs/blueprint/testing.md:5-6` 明确声明工具链门禁命令：doctor 用 `python3 -m pytest tests/repo_template -q --collect-only`，test 用 `python3 -m pytest tests/repo_template/ -q`。**文档定义的门禁在 CI 中从未运行。**
4. `tests/repo_template/package.json` 只声明 `type: commonjs`，无 test script。

**影响:** 工具链（task 状态机、ledger、integrate/chain、pending/findings 取号、review 门禁）的任何回归——包括本清单全部 High——可静默合入 `main`。项目对工具链的信任完全依赖本地手动 pytest。

**修复:**
- `ci.yml` quality job 增加 `actions/setup-python` + `python3 -m pytest tests/repo_template/ -q`，或并入 `npm run test:toolchain` 统一入口。
- 模板同步后 CI 即验证，避免模板仓与消费仓工具链漂移。

**承接:** t162

---

### RT-002 — review scope 指纹不覆盖未跟踪文件，`git add -N` 漏做即静默绕过 review 门禁

- **Severity / Confidence:** High / 90%
- **定位:** `scripts/repo_template/check_review_status.py:306-334`（`current_scope_fingerprint`）；`scripts/repo_template/render_review_prompts.py:129-155`（`review_scope_fingerprint`）；`.agents/skills/task-work/SKILL.md:92`；对照 `repo_task/monitoring.py:63-66`

**根因与证据:**

1. 指纹 = `git diff --binary <diff_anchor> -- . <excludes>` 的 SHA-1 前 16 位。`git diff <commit>` 只比较 commit 与工作树中**已跟踪**文件的差异；**未跟踪文件对 diff 完全不可见**。
2. 新文件要进入被审 scope，必须先 `git add -N -- <path...>`；该动作只存在于 `task-work/SKILL.md:92` 的操作指引，无任何机械强制。
3. reviewer 写入的 `reviewed_scope:` 与 checker 重算的 `current_scope_fingerprint` 同口径——两侧对 untracked 同样失明；排除清单 `SCOPE_EXCLUDES` 声明「行为文件计入指纹」，但机制漏了未跟踪文件这一大类。
4. 同仓库已有正确口径：`monitoring.py:63-66` 的 `repository_fingerprint` 用 `git ls-files --others --exclude-standard` 显式把未跟踪文件纳入哈希。两种指纹并存且口径不一致，证明是遗漏而非设计意图。
5. 测试 `test_check_review_status.py:403-476` 全部 monkeypatch `current_scope_fingerprint`，从未用真实 git diff + 未跟踪文件跑过。

**影响:** 新源码（如新增 `src/extension/xxx_capture.ts`）若未 `git add -N`，reviewer 看不到、PASS 判定与指纹均不受影响；review 后 agent 继续添加文件也不改变指纹。review 门禁对「新增文件」这一最核心审查对象存在可静默绕过的盲区。

**修复:**
- `current_scope_fingerprint` 改为 `git diff <anchor>` 与 `git ls-files --others --exclude-standard`（按相同 excludes）内容拼接后哈希，直接复用 `monitoring.repository_fingerprint` 构成方式，统一口径。
- 或 checker 先检测任务目录/排除清单外是否存在未 `add -N` 的 untracked 文件，存在则返回 `None`（保守不可验证）并提示。
- 补真实 git 行为测试：未跟踪文件加入后指纹必须变化。

**承接:** t164

---

### RT-003 — 单 task `integrate` 无 transaction，崩溃重入把任意当前 HEAD 记为 `merge_sha`

- **Severity / Confidence:** High / 90%
- **定位:** `scripts/repo_template/repo_task/integration.py:394-463`（重点 `:429`、`:436-438`、`:454-463`）；`attempts.py:168-187`（`require_exact_terminal(allow_integrated=True)`）

**根因与证据:**

1. `cmd_integrate` 全程无持久标记：`require_primary_worktree` → exact gate → `_resolve_integrate_branch` → `_verify_exact_handoff` → worktree 检查 → `merge --no-ff` → `_commit_index()` → `append_integrated(...)` → `_delete_branches`。任一步之后崩溃，无 transaction 文件可恢复。
2. 崩溃窗口：merge 成功但 `append_integrated` 未执行（进程被杀/断电/异常）。重入时：`_require_execution_gate`（`allow_integrated=True`）通过——ledger 中 state 仍是 `terminal` 且 terminal_status=completed、report=done；`_resolve_integrate_branch` 分支仍在；`_verify_exact_handoff` 通过；`_registered_for_branch` 为空。
3. 然后 `:436` 的 `merge-base --is-ancestor sha HEAD` 为真（已合并）→ 走「跳过 merge」分支，`:438` `merge_sha = _get_head()`——**把当前 HEAD 原样当作 merge_sha**。此时 HEAD 要么是本 task 的 index 维护 commit（崩溃发生在 `_commit_index` 之后），要么已被其他会话/操作推进到任意后续 commit。
4. `append_integrated`（`:457`）把该错误 merge_sha 永久写入 ledger。若崩溃发生在 merge 与 `_commit_index` 之间，重入的 `_commit_index` 会先产生 index commit，再把 index commit 记为 merge_sha——同样错误。
5. 现有测试 `test_dispatch_integration.py:406-424`（`test_integrate_skip_merge_also_appends_integrated`）**把这一行为固化为预期**：手动预 merge 后 integrate，断言 `merge_sha == preintegrate_head`。它只覆盖良性场景（预 merge 恰是本 task 的 merge），未覆盖「HEAD 已被无关 commit 推进」的崩溃窗口。

**影响:** ledger `integrated.merge_sha` 永久指向错误 commit，integration 溯源/审计失真；任何按 merge_sha 重建「task 由哪个 commit 合入」的消费方（含未来工具、`rev-list --grep merge({tid})` 审计）得到错误结果。

**修复:**
- 仿 chain 加最小持久标记：merge 前写 `.git/repo-task/integrate-{tid}.json`（含 base_head、branch sha、merge 前 HEAD），收尾后删除。
- skip-merge 分支改为解析真实 merge commit（`git rev-list --merges --max-count=1 --grep "merge({tid}):"` 或校验 HEAD 与 branch merge 的双亲关系），解析不到或 HEAD 与分支 merge 无对应关系时拒绝并要求人工确认，绝不无条件 `_get_head()`。
- 补崩溃窗口测试：`_commit_index` 后模拟中断，HEAD 前进后再重入，断言 merge_sha 仍为真实 merge commit。

**承接:** t165

---

### RT-004 — chain 锁不覆盖 single `integrate` 与其他主干写入，事务窗口内 `base_head` 快照可失效

- **Severity / Confidence:** High / 80%
- **定位:** `scripts/repo_template/repo_task/integration.py:487-506`（`_chain_locked`）、`:394`（`cmd_integrate` 无锁）、`:810-819`（tx 写 `base_head`）、`:688-698`（`_record_prepared_merge` 双亲校验）；`docs/blueprint/architecture_repo_template.md:15,61`

**根因与证据:**

1. `_chain_locked` 只装饰 `cmd_integrate_chain`（`:754`）。`cmd_integrate`（`:394`）与 `_commit_index`（`:350-364`）均不获取该锁；agent 的手动 commit、`cmd_add` 等也不受约束。
2. chain 流程：预检 → `:810-819` 写 transaction（快照 `base_head = _get_head()`）→ `:821-837` 执行 `merge --no-ff`。若另一会话的 single `integrate`（其 merge + `_commit_index`）落在 tx 创建与 chain merge 之间，主干在事务窗口内被推进。
3. chain merge 本身仍会成功（git 三方 merge），但若进程此后崩溃、phase 停在 `prepared`，恢复时 `_record_prepared_merge`（`:688-698`）要求 `HEAD^1 == base_head && HEAD^2 == tail_sha`——第一父已被单 integrate 的 commit 顶掉，**恢复被永久拒绝**，只能按 skill 指引手动删 tx 重跑。
4. `architecture_repo_template.md:15,61` 写「多会话同时写主仓不互斥——合并撞车由 git 报错、人来收场」——文档承认的「不互斥」只覆盖 merge 冲突与 index 可重建性，**未覆盖 chain 事务快照不变量**（base_head、成员 SHA 锚定）。
5. `_ensure_primary_merge_ready`（`:371-379`）只检查 `MERGE_HEAD` 与已跟踪脏文件——该窗口内两者都为空（另一会话的 merge 已完成、index 已提交），形同虚设。

**影响:** 多会话并发（系统明确支持的模式）下，chain 事务崩溃恢复路径可能卡死，aggregate transaction「零 merge / 一次性合并」的原子性承诺在真实并发下不成立。

**修复:**
- 最小改动：`cmd_integrate`（及 `_commit_index` 调用方）在 merge/commit 前获取同一 `integrate-chain.lock` 排他锁；更彻底：抽出统一的主干写锁。
- 或 chain merge 前重读 HEAD 与 `base_head` 比对，漂移则拒绝并提示用户先处理并发 integrate。

**承接:** t166

---

### RT-005 — chain index 恢复只检查 `HEAD^1 == merge_sha`，可把无关紧邻 commit 误认为 index 维护 commit

- **Severity / Confidence:** High / 75%
- **定位:** `scripts/repo_template/repo_task/integration.py:701-713`（`_record_index_phase`，关键 `:711`）；`:716-725`（`_record_integrated_phase`）

**根因与证据:**

1. 崩溃于 `_commit_index()` 完成、`_update_chain_tx(payload, "indexed", ...)`（`:713`）之前时，恢复路径 `:707-712`：`HEAD != merge_sha` 则只检查 `HEAD^1 == merge_sha` 即认领为「紧邻 index 维护 commit」，写入 `index_sha`。
2. 该检查**不验证 commit 是否真的是工具链的 index commit**：无 subject 匹配（`chore(task): rebuild task indexes`）、无路径集合校验（只应含 `docs/tasks_index.json`、`docs/archive/tasks_index.json`）、无 author/时间窗校验。任何 first-parent 指向 chain merge 的 commit 都会被认领。
3. 具体交错：另一会话 single `integrate` 若其分支已合入（走 RT-003 的 `:436-438` skip-merge 分支）且其 `_commit_index` 恰好落在 chain merge commit 之上，该 index commit 的 `HEAD^1 == chain merge_sha` → chain 恢复把它认领为自己的 index commit，`index_sha` 归属错误。RT-004 的不互斥放大了这个窗口。
4. 多数错误交错会被后续 `_record_integrated_phase`（`:716-719`，要求 `_get_head() == index_sha`）与 finalize 检查 fail-closed 拦截，实际数据损坏有限；但「恢复时 provenance 校验」的语义被架空。

**影响:** 恢复路径无法保证 `index_sha` 归属；与 RT-004 组合时误认领概率上升。归属错误的 tx 在 finalize 时多数 fail-closed，但 audit 语义（谁、何时、以什么 commit 维护了 index）不可信。

**修复:**
- `:711` 分支加归属校验：`git show -s --format=%s HEAD` 必须等于 `chore(task): rebuild task indexes`，且 `git diff-tree --no-commit-id --name-only -r HEAD` 的路径集合 ⊆ {两个 index JSON}；不匹配则拒绝并要求人工确认。
- 补故障注入测试：在 index commit 后、phase 写入前中断，用无关 commit 推进 HEAD，断言恢复拒绝。

**承接:** t166

---

## Medium（6 条）

### RT-006 — attempt reserve 可在 start 之前执行，产生无 worktree 的孤儿 running identity ⚠️ 未落入任何 task

- **Severity / Confidence:** Medium / 90%
- **定位:** `scripts/repo_template/repo_task/control.py:115-117`；`attempts.py:190-246`（`reserve_attempt`）；`tests/repo_template/test_task_start_flow.py:1796-1807`

**根因与证据:**

1. `cmd_attempt_reserve`（`control.py:115-117`）只做 `require_primary_worktree()` + `reserve_attempt(...)`，不检查 task 是否已 `start`。
2. `reserve_attempt`（`attempts.py:190-246`）在 `TASKS_DIR` 存在时校验 tid 存在且未归档（`:198-207`），但**不校验 status 是否为 active、不校验 worktree 是否已登记**——backlog 状态即可 reserve。
3. `test_task_start_flow.py:1796-1807`（`test_attempt_reserve_and_start_are_separate_events`）明确演示 reserve-before-start 是受支持的顺序（ledger 事件序 `attempt_reserved, start`）。
4. 若 reserve 后 `start` 失败（分支/路径冲突、磁盘满、文档校验失败），identity 已以 `state=running` 写入 ledger，但没有对应 worktree/分支；`_require_exact_current`（`attempts.py:150-165`）挡住该 tid 后续执行直到人工介入。

**影响:** 崩溃/乱序调用留下孤儿 running identity，阻塞该 tid 后续执行直到人工介入；多会话并发下掩盖真实执行状态，与控制面「exact identity」的严谨性不符。

**修复:**
- `reserve_attempt` 增加 start 门禁：task 有效状态必须为 `active` 且 worktree 已登记（`worktree_paths()` 含 `effective_worktree`）。
- 或允许 backlog reserve 但要求 `start` 事件已存在于 ledger。
- 补「reserve 后 start 失败 → identity 自动失效或可一键清理」路径。

**承接:** **无**。需补入 t167 或单独建 task。

---

### RT-011 — 原生 Windows 上空 lock 文件上 `msvcrt.locking` 失败，`id_lock` 不可用

- **Severity / Confidence:** Medium / 90%
- **定位:** `scripts/repo_template/_id_scan.py:71-78`（`_lock_fh`）、`:89-99`（`id_lock`）；对照 `repo_task/ledger.py:95-108`（`_with_lock`，`:99-101` 注释）、`repo_task/integration.py:497-500`（`_chain_locked`）

**根因与证据:**

1. `id_lock`（`_id_scan.py:94`）以 `open(lock_path, "w")` 打开——生成**空文件**且从不写入字节；`_lock_fh`（`:75`）随即 `msvcrt.locking(fd, LK_LOCK, 1)` 锁定 1 字节。Windows 上锁区超出 EOF 会抛 `OSError`。
2. 仓库内另两处锁实现都先写 1 字节再锁：`ledger.py:99-102`（写入 `\0` 后 `_ledger_lock_fh`），`integration.py:498-500`（同模式）；`ledger.py:99-101` 注释明确写着「空 lock 文件上 Windows msvcrt.locking(1 字节) 会失败，先写入 1 字节」——`_id_scan.id_lock` 遗漏了同一处理。
3. 影响面：`pending.py new`、`findings.py new`、`spikes.py new` 在原生 Windows 上全部失败（`os.name == "nt"` 分支遍布全仓库，平台是被支持的）。WSL/Unix 走 fcntl 不受影响。

**影响:** 模板消费方在原生 Windows 运行即踩；取号锁失败 → 并发取号保证（`conventions.md:10` 承诺）在 Windows 上直接失效。

**修复:**
- `id_lock` 照抄 `ledger._with_lock`：`open(lock_path, "a+")`，`tell() == 0` 时写 `\0` 再锁。
- 补 Windows 路径注释或抽象共享锁 helper 消除三份重复。

**承接:** t167

---

### RT-007 — 派生 index 写非原子，并发 rebuild 可落盘损坏 JSON

- **Severity / Confidence:** Medium / 85%
- **定位:** `scripts/repo_template/repo_task/store.py:146-173`（`rebuild_index`，写点 `:169-172`）；`repo_task/goal.py:95-97`（同模式）；`repo_task/integration.py:350-364`（`_commit_index` 依赖）

**根因与证据:**

1. `rebuild_index` 对 `docs/tasks_index.json` 与 `docs/archive/tasks_index.json` 直接 `path.write_text(json.dumps(...))`——truncate + 整块写，**无临时文件 + `os.replace` 原子替换**。`goal.py:95-97` 写 `goal_queue.json` 同模式。
2. 崩溃（SIGKILL/断电）于写入中途 → 截断/半写 JSON 落盘；随后 `_commit_index`（`:353-363`）`git add` + commit 把损坏文件固化进 main 历史。
3. 多会话并发（RT-004 不互斥）同时 `rebuild_index` → 交错 truncate/write → 损坏概率显著上升。
4. 程序侧无读 index 的消费方（`scan_tasks()` 直接扫目录；index 只被 git diff/排除清单/人引用），因此损坏影响限于版本库垃圾与 merge 冲突处置时的报错，但「派生缓存撞了重建」的承诺在崩溃/并发下不成立。

**影响:** 截断 JSON 进入版本库；冲突处置中依赖「脚本重建覆盖」的路径可能读到坏文件报错；审计历史被垃圾 commit 污染。

**修复:**
- 与 `_write_chain_tx`（`:509-523`）同模式：写 `.tmp` + `os.replace`。
- `_commit_index` 前校验 JSON 可解析，解析失败拒绝 commit。
- `goal_queue.json` 同样处理。

**承接:** t167

---

### RT-008 — `edit` 多文件反向边更新非原子，中途崩溃留半同步冲突边

- **Severity / Confidence:** Medium / 85%
- **定位:** `scripts/repo_template/repo_task/lifecycle.py:230-259`（反向边计算）、`:321-325`（写盘序列：先 peers 循环、再 owner、再 `rebuild_index`）

**根因与证据:**

1. `cmd_edit` 修改 `conflicts_with` 时，把每个 peer 的反向边 front matter 更新收集进 `peer_updates`，随后 `:321-322` 逐个 `write_front_matter(peer_path, ...)`，`:323` 再写 owner，`:324` `rebuild_index`。
2. 任一步崩溃（写盘中途进程死亡）→ 部分 peer 已加反向边、owner 未写（或反之）→ 双向冲突边单向残留。
3. 调度图 `scheduling.py:75-77` 按「并集」双向展开冲突，残留单边会让 `view`/`start` 的冲突判定与声明不一致。
4. 恢复途径只有人工核对多个 front matter；无自动修复命令。测试只覆盖完整成功路径（`test_task_start_flow.py:1316-1388`），无中途失败用例。

**影响:** 崩溃后调度图脏数据残留，`conflicts_with` 声明与生效行为不一致；多会话并发编辑同 task 时窗口放大。

**修复:**
- 先在内存完成全部新 front matter 内容，再一次性顺序落盘（owner 最后）。
- 或引入「同步反向边」幂等命令供恢复。
- 对每个 front matter 写盘用临时文件 + rename，降低半写风险。

**承接:** t167

---

### RT-009 — task ID 取号无锁，并发 `add` 撞号

- **Severity / Confidence:** Medium / 80%
- **定位:** `scripts/repo_template/repo_task/lifecycle.py:37-45`（`:41-42` `n = max(...) + 1` / `tid = f"t{n:03d}"`）；对照 `_id_scan.py:234-254`（锁内分配）；`docs/blueprint/conventions.md:10`

**根因与证据:**

1. `cmd_add` 从 `scan_tasks()` 计算 `max(tid)+1`，全程无锁；同一仓库内 pending/findings/spikes 的取号（`_id_scan.allocate`）都在 git 公共目录排他锁内完成（`conventions.md:10` 明确「并发 worker 不会撞号」）——task tid 是唯一无锁取号的序列。
2. 两会话并发 `task.py add`（多会话 `task-create` 是文档支持模式）→ 同 tid 两个目录（slug 不同）→ 下次任意 `scan_tasks` 触发 `_validate_task_records`「重复 tid」错误，整个工具链 fail-closed；`rebuild_index` last-writer-wins，索引丢一项。
3. `test_pending.py:186`（`test_concurrent_allocation_yields_unique_ids`）用进程池验证了 pending 的并发取号；`cmd_add` 无对应测试。

**影响:** 并发立项场景下工具链整体不可用（重复 tid 抛错），且需人工清理重复目录；与总账取号的并发保证不一致。

**修复:**
- 复用 `_id_scan.id_lock`（或独立 `task_id.lock`）覆盖「取号 + 建目录」。
- 或 `task_dir` 创建用 `mkdir` O_EXCL 原子占位 + 冲突重试。
- 补并发 `add` 测试（复用 `test_pending.py` 的 ProcessPoolExecutor 模式）。

**承接:** t167

---

### RT-010 — pending 批量迁移（archive/park/revive）无锁、非原子

- **Severity / Confidence:** Medium / 75%
- **定位:** `scripts/repo_template/pending.py:166-197`（`_apply` 批量循环）、`:199-231`（`cmd_archive`/`cmd_park`/`cmd_revive`）；对照 `:130-140`（`cmd_new` 走锁内 `allocate`）

**根因与证据:**

1. `archive`/`park`/`revive` 的 `--write` 分支（`_apply`）不取 `id_lock`，逐条 `git mv`（`move_entry`）→ `set_field` 改写状态行 → `git add`；中途崩溃 → 部分条目已迁、部分未迁（迁移状态不一致，可重入修复，但无批量原子性）。
2. 并发窗口：`cmd_new`（持锁，扫描全部分支 + worktree 文件取号）与 `archive`（无锁，`git mv` 移动文件）同时进行时，`scan_max_id` 可能观察到移动中间态（文件短暂不在原目录/新目录），配合 `move_entry` 的 TOCTOU（`destination.exists()` 检查与 `git mv` 之间），极端交错下产生「同号多处」歧义——`find_entry`（`:87-100`）对此 fail-closed 拒绝。
3. 测试覆盖并发 `new`（`:186`）与单线程 CLI 迁移，无并发迁移/中断用例。

**影响:** 批量闭环/暂搁在半途失败时留下部分迁移状态；并发下可能触发「同号多处」拒绝，需人工核对恢复。影响有限（条目文件可重跑），但破坏「一条目一文件 + 三态目录」的总账不变量边界。

**修复:**
- 批量迁移整体持 `id_lock`。
- `move_entry` 改为目标不存在则 `os.replace`/`git mv` 幂等重试。
- 命令末尾输出「已完成 N 条 / 未完成 M 条」。
- 补并发 `archive` vs `new` 测试。

**承接:** t167

---

## Low（3 条）

### ARCH-006 — 三份 front matter parser 形成重复真相源且转义语义已漂移

- **Severity / Confidence:** Low / 97%
- **定位:** canonical `scripts/repo_template/repo_task/documents.py:10-74`；副本 `scripts/repo_template/render_review_prompts.py:39-57`、`scripts/repo_template/check_review_status.py:84-104`

**根因与证据:**

1. 三处 docstring 明确写「改解析规则需三处同步」，即代码主动承认重复真相源。
2. canonical `_quote/_unquote` 对双引号与反斜杠做对称转义（`documents.py:10-31`），`dump_front_matter()` 统一用该规则输出。两个简化副本仅执行 `strip('"').strip("'")`，不会还原 `\"`/`\\`。
3. 可静态复现：canonical 写入 `title: "a\\\"b"` 后会读回 `a"b`；两个副本会保留反斜杠。任务标题、slug、路径或 note 若含这类字符，task CLI、prompt 渲染、review status 会对同一 `task.md` 得到不同值。
4. canonical 有 quote/backslash round-trip 测试（`test_task_save.py:50-51,73-87`）；render 副本只测普通引号与行内注释；status 副本没有 parser parity 测试。

**影响:** task 状态权威是 `task.md` front matter，但不同工具会解释成不同值；错误可能表现为 prompt 占位内容漂移、fingerprint/status 判断异常，排查困难。每次 parser 规则变化都需手动同步三处。

**修复:**
- 两个脚本直接 import `repo_task.documents.parse_front_matter` / `parse_front_matter_text`，仅在 CLI 边界转换 `TaskDataError` 为各自错误文案。
- 增加共享 corpus/parity 测试，至少覆盖双引号、反斜杠、单引号、冒号、`#` 与未闭合 front matter。

**承接:** t188

---

### RT-012 — `render_review_prompts --out-dir` 无仓库 containment 校验，可写仓库外

- **Severity / Confidence:** Low / 90%
- **定位:** `scripts/repo_template/render_review_prompts.py:321-328`（`--out-dir` 处理）；对照 `:94-105`（`resolve_repo_path`）、`check_review_status.py:337-351`（`resolve_task_dir` 拒绝仓库外）

**根因与证据:**

1. `--task`/`--task-dir`/`spec_path` 全部经过 `resolve_repo_path` 的 containment 校验（`:94-105`，仓库外路径直接 `sys.exit`）；唯独 `--out-dir`（`:321-325`）裸 `Path(args.out_dir)` + `mkdir(parents=True, exist_ok=True)` + 写入，**不校验是否在仓库内**。
2. `--out-dir ../.ssh` 或绝对路径即可把 `code_review_prompt.md`/`test_review_prompt.md` 写到仓库外任意位置。默认 stdout 模式无此问题，但 agent 误传或路径注入（prompt 渲染是 agent 高频调用）会越界写。
3. 同目录 `check_review_status.py` 的 `resolve_task_dir` 显式 `candidate.relative_to(root)` 拒绝越界——同一批工具 containment 纪律不一致。

**影响:** 越界写两个 prompt 文本文件（非破坏性内容，无凭据）；最大风险是 agent 场景下的路径误写污染其他目录。

**修复:**
- `--out-dir` 复用 `resolve_repo_path` 校验（或要求仓库相对路径）。
- 拒绝绝对路径与非仓库内路径。

**承接:** t168

---

### RT-013 — `view --serve` 非 loopback 绑定暴露 task 文档，仅打印警告

- **Severity / Confidence:** Low / 85%
- **定位:** `scripts/repo_template/repo_task/view_server.py:227-247`（`_is_loopback_host` + `serve` 警告后仍绑定）；`:204-220`（`/task-doc` 返回 spec/task 正文）；`repo_task/cli.py:122-125`（`--host` 可传任意值，默认 `127.0.0.1`）

**根因与证据:**

1. `serve` 对非 loopback host 打印 WARNING 后照常 `ThreadingHTTPServer` 绑定；`cli.py:122-125` 的 `--host` 无约束，`--host 0.0.0.0`/局域网 IP 即对网络开放。
2. `/task-doc` 返回任意 task 的 `spec.md`/`task.md` 全文（契约区、上下文区常含外部依赖细节、环境信息、未完成需求）；无认证、无 CORS 限制（同源页面可直接 fetch）。
3. 代码自知风险（警告文案明确「只读但会暴露 task spec/task 正文，确认网络边界后再用」），属**已警告的运维风险**，非无意识漏洞，故 Low。

**影响:** 局域网内任何主机可读全部 task 文档；task spec 属内部需求信息，泄漏敏感度中等。作者已警告，用户显式传非 loopback host 即视为知情。

**修复:**
- 非 loopback 绑定要求显式 `--allow-non-loopback` 确认开关。
- 或对该模式强制 Bearer token。
- 至少把警告提升为需要确认的交互。

**承接:** t168

---

## 修复承接总览

| Finding | Severity | 承接 task | 状态 |
|---|---|---|---|
| RT-001 | High | t162 | 已落盘 |
| RT-002 | High | t164 | 已落盘 |
| RT-003 | High | t165 | 已落盘 |
| RT-004 | High | t166 | 已落盘 |
| RT-005 | High | t166 | 已落盘 |
| RT-006 | Medium | **无** | ⚠️ 遗漏，需补 |
| RT-007 | Medium | t167 | 已落盘 |
| RT-008 | Medium | t167 | 已落盘 |
| RT-009 | Medium | t167 | 已落盘 |
| RT-010 | Medium | t167 | 已落盘 |
| RT-011 | Medium | t167 | 已落盘 |
| ARCH-006 | Low | t188 | 已落盘 |
| RT-012 | Low | t168 | 已落盘 |
| RT-013 | Low | t168 | 已落盘 |
