# Task review t201（reviewer_focus: 测试）

- task：`t201_bridge_instance_persistence`
- spec：`docs/tasks/t201_bridge_instance_persistence/spec.md`
- diff_anchor：`2773813bed85a06347775688033769095051232a`
- target：`git diff 2773813bed85a06347775688033769095051232a`
- round：1
- reviewed_at：2026-08-16 01:04 UTC+8

## Findings

### t201_test_f001 - AC-003「文件权限 0600」「文件含 token_hash 而非明文」无文件级断言

- 严重度：important
- 锚点：AC-003（实例文件以 JSON 写入，含 `token_hash` 而非明文 token，文件权限 0600）；可测试性声明 AC-003（"persist 产物校验含 token_hash 非明文 + 文件 mode 0600"）
- 位置：`tests/unit/bridge_registry_refactor.test.ts:105-128`（t201 describe 第一个用例）
- 问题：t201 新增 3 个用例全部只在内存字段上做 persist→load 往返，从未读回文件内容（`readFile`/`stat`），也未断言文件 mode。AC-003 的「权限 0600」与「文件内容含 token_hash、无明文 token」两项由 spec 可测试性声明明确定义的断言在 diff 中完全缺失——若 `persist()` 退化写 0644、或文件泄漏明文 token 字段，现有测试全部仍绿。spec 风险区明言「回退：文件 mode 0600 已限制」，该安全缓解无任何测试兜底。测试仅验证了内存字段往返（`expect(inst?.token_hash).toBe('deadbeef')` 复读测试自己写入的值），未验证 AC 声明的持久化产物属性。
- 建议：新增断言读回落盘文件——`JSON.parse(await readFile(file))` 含 `token_hash` 字段且无 `token`/明文字段；`await stat(file)` 断言 `mode & 0o777 === 0o600`。

### t201_test_f002 - default_instances_file_path 期望值自证式，默认路径契约与 env 读取无独立断言

- 严重度：important
- 锚点：AC-005 测试策略（"单测覆盖 config 读取 env"）；spec「默认路径决定」（main.ts 未设 env 时默认 `instances_file`，对齐 token 文件 `$XDG_RUNTIME_DIR/capture-all/instances.json`，四条启动路径共享）
- 位置：`tests/unit/agent_bridge_config.test.ts:75`、`tests/unit/agent_bridge_config.test.ts:86`
- 问题：两处期望值 `instances_file: default_instances_file_path()` 直接调用被测函数自身——被测函数回归（目录/文件名算错）时等式两侧同步变化，该断言对 `default_instances_file_path()` 的正确性永不可能失败，属自证式断言。默认路径契约（`dirname(token_path)/instances.json`、与 token 文件同目录、XDG 对齐）全仓无一条具体路径断言（对比 `default_token_file_path` describe 在 XDG 下断言 `/run/user/1000/capture-all/bridge_token`）。同时无任何用例设置 `CAPTURE_ALL_INSTANCES_FILE` env 断言其值被读取——AC-005 测试策略声称的「config 读取 env」行为未被覆盖。
- 建议：仿 `default_token_file_path` describe 增加对 `default_instances_file_path()` 的具体路径断言（set `XDG_RUNTIME_DIR` → 断言 `/run/user/1000/capture-all/instances.json`）；补一条 `parse_bridge_cli_args` 传 `{ CAPTURE_ALL_INSTANCES_FILE: '/custom/inst.json' }` 断言 `instances_file === '/custom/inst.json'`。

### t201_test_f003 - AC-001「两实例含零配置场景」组合恢复无自动测试

- 严重度：minor
- 锚点：AC-001（首次 enroll 两个实例后 kill 重启，list 能列出两个实例含零配置实例且 label 保留）；测试策略（"验证两个实例含零配置场景的 label/绑定"）
- 位置：`tests/unit/bridge_registry_refactor.test.ts:106-128`
- 问题：新增用例仅往返**一个**带显式 label 的实例；`tests/unit/t137_bridge_security.test.ts:254-277`（t169 AC-003b，本 task 之前已有）覆盖**单个**零配置（label=null）实例重启后 heartbeat 200。两者均未覆盖「两实例（一零配置一标号）同时恢复、`build_status`/list 仍为 2 且 label 保留」——即 p052 来源的 "list_browsers 从 2 掉到 1" 回归场景。机制本身（persist/load 往返）已测，故标 minor，不阻断。
- 建议：补一条 registry 级用例：`instances.set` 两个实例（一个 `browser_label: null` 模拟零配置），persist→load→断言 `size === 2` 且 `build_status(...).extensions` 含两个 instance_id、label 保留。

### t201_test_f004 - AC-004 缺失文件（ENOENT）分支未测

- 严重度：minor
- 锚点：AC-004（"实例文件损坏或缺失时"）；测试策略（"覆盖损坏文件、缺失文件、正常恢复、seen_at 过期重置四条路径"）
- 位置：`tests/unit/bridge_registry_refactor.test.ts:157-171`
- 问题：仅覆盖损坏 JSON（JSON.parse 抛错分支）；「缺失文件」（readFile 抛 ENOENT 分支）无用例。两条路径落同一 catch，行为等价，结构性已覆盖，故 minor。
- 建议：补一条不写文件直接 `new BridgeRegistry(file)` + `load_persisted()` 断言 `instances.size === 0`。

### t201_test_f005 - persist fire-and-forget 固定 sleep 等落盘，潜在 flake

- 严重度：minor
- 锚点：spec 风险区（"persist 为 fire-and-forget(registry.ts:48)... AC-001 测试避免'persist 后立即 kill'窗口"）
- 位置：`tests/unit/bridge_registry_refactor.test.ts:116`、`tests/unit/bridge_registry_refactor.test.ts:140`
- 问题：`persist()` 异步 fire-and-forget 写盘，两用例用固定 `setTimeout(50)` 等待落盘后 load；文件系统慢于 50ms 时 load 读到空文件 → 断言失败，属时序 flake。spec 已认可该模式，但固定 sleep 比轮询/等待文件存在更脆。
- 建议：改为轮询 `readFile` 直到文件存在/可解析，或让 `persist()` 返回可 await 的句柄。

## 结论

- 前轮 finding 复核（Round 1，无）
- 改测方向复核：无「迁就实现」的改测。`agent_bridge_config.test.ts` 两处新增 `instances_file` 期望为对**新行为**（env 缺失时产出默认路径）的断言，非把旧预期改成新输出。
- 本轮新发现：5 条（2 important + 3 minor）
- 未进表的提示：
  - AC-002 由既有 t169 AC-003b 服务级用例覆盖（enroll→重启→heartbeat 200、无 token re-enroll 200），已实跑 `t137_bridge_security.test.ts`（14 passed），本次未新增重复测试，合理。
  - t201 三用例反复 `await import('node:fs/promises')` 等，可提到文件头一次性导入（风格，未入表）。
  - 新用例默认 TTL 5s + grace 30s 未缩短，AC-006 用 60s 旧 seen_at 越过 35s 阈值验证 sweep，逻辑成立，无问题。
- 总体判断：新增 3 个 registry 级用例方向正确、真实触达生产逻辑且全绿（`bridge_registry_refactor.test.ts` + `agent_bridge_config.test.ts` 35 passed）；但 AC-003 的权限/文件内容断言与默认路径契约断言缺失（spec 可测试性声明明确要求的断言未落地），未解决 important → FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`（机制）——实跑新用例，persist→load 往返字段断言通过；「两实例含零配置」组合缺覆盖（f003）。
- AC-002：`re_verified`——实跑 `tests/unit/t137_bridge_security.test.ts` 14 passed，其中 t169 AC-003b 用例 enroll→重启→heartbeat 200 / 无 token re-enroll 200。
- AC-003：`re_verified`（部分）——JSON 往返经测试实跑通过；「mode 0600」与「文件含 token_hash 非明文」文件级断言缺失，未独立复验（f001）。
- AC-004：`re_verified`（部分）——损坏 JSON 分支实跑通过；缺失文件分支无用例（f004）。
- AC-005：`re_verified`（config 解析）——`parse_bridge_cli_args` 两用例实跑通过；默认路径具体值与 env 读取未独立复验（f002）。`npm run bridge` 与 manual 的进程级一致性依赖 config 共用解析路径的设计而非独立进程测试。
- AC-006：`re_verified`——实跑新用例，seen_at 重置断言 + `build_status` 含恢复实例（未被 sweep）通过。

coverage = 6 / 6（AC-003/004/005 为部分复验，缺项见对应 finding）

reviewed_scope: c13df9d50a8201bd

verdict: FAIL

## Round 2 (2026-08-16 01:14 UTC+8)

### 前轮 finding 复核（以 `git diff 2773813bed85a06347775688033769095051232a` 与实跑为准）

- **t201_test_f001（important，AC-003 文件级断言）——已消除**。`tests/unit/bridge_registry_refactor.test.ts:130-137` 读回落盘文件：`JSON.parse(await readFile(file,'utf8'))` 断言 `raw[0].token_hash === 'deadbeef'`、`raw[0].token`/`raw[0].instance_token` 均 undefined（无明文）、`(await stat(file)).mode & 0o777 === 0o600`。直接覆盖可测试性声明 AC-003 全部三项（token_hash 非明文 + 权限 0600 + JSON 写入）。实跑通过。
- **t201_test_f002（important，默认路径自证式 + env 读取）——已消除**。新增 `default_instances_file_path` describe（`tests/unit/agent_bridge_config.test.ts:152-182`）：XDG 分支 set `XDG_RUNTIME_DIR='/run/user/1000'` + 删 token file env 后断言具体字符串 `/run/user/1000/capture-all/instances.json`（不调被测函数，独立于实现）；`.local` fallback 断言 `toContain('.local/instances.json')`；`parse_bridge_cli_args` 传 `{ CAPTURE_ALL_INSTANCES_FILE: '/custom/inst.json' }` 断言 `instances_file === '/custom/inst.json'`（AC-005 测试策略「config 读取 env」落地）。残余：`parse_bridge_config` 两用例（line 75/86）仍以 `default_instances_file_path()` 作期望值、属自证，但该函数正确性已被独立 describe 具体值断言覆盖，自证不再构成唯一证据，不阻断。
- **t201_test_f003（minor，双实例组合恢复）——已消除**。`tests/unit/bridge_registry_refactor.test.ts:151-173` 建 `inst_zero`（label=null 模拟零配置）+ `inst_labelled`（'work'），persist→load 后断言 `size===2`、`build_status.extensions` 含两 instance_id、label 分别保留 null/'work'。p052「list 从 2 掉到 1」场景有对应覆盖。
- **t201_test_f004（minor，ENOENT 分支）——已消除**。`tests/unit/bridge_registry_refactor.test.ts:212-222` 不写文件直接 `load_persisted()`，断言 `size===0` 不抛错。
- **t201_test_f005（minor，固定 sleep）——主体已消除，留残余**。persist 等待改 `wait_for_file` 轮询（`tests/unit/bridge_registry_refactor.test.ts:109-119`，50×10ms 可读即返回），去固定 sleep flake。残余：轮询只等「可读」不等「可解析」，首个 readFile 若命中 writeFile 的 create/truncate 间隙读到空串会提前返回 → 测试侧 `JSON.parse('')` 抛错。已转入新 f006（minor）。

### 改测方向复核

无「迁就实现」改测。`parse_bridge_config` 两用例（line 75/86）追加 `instances_file: default_instances_file_path()` 是对新行为（env 缺失时产出默认路径）的断言，非把旧预期改成当前输出。

### 本轮新发现

1 条（minor）：t201_test_f006。

### 未进表的提示

- `[e2e-coverage] ORPHAN e2e-orphan-guard-test.spec.ts` 告警为既存、非本 diff 引入，范围外。
- env 内联清理（set XDG_RUNTIME_DIR 后 delete）无 finally 兜底，断言失败时 env 泄漏；`default_token_file_path` describe 既有同款模式，且后续用例自清理，未入表。

### 总体判断

Round 1 两条 important（f001/f002）经 diff/代码与实跑核实已消除，三条 minor（f003/f004/f005）均已落地；相关用例 `bridge_registry_refactor.test.ts` + `agent_bridge_config.test.ts` 40 passed，`t137_bridge_security.test.ts` 14 passed，全量单测 204 文件 1936 passed。本轮仅新增 1 条 minor（f006），无未解决 critical / important → PASS。

### AC 复验方式

- AC-001：`re_verified`——双实例（零配置+标号）persist/load 用例实跑通过，size 与 label 保留（line 151-173）。
- AC-002：`re_verified`——t137 t169 AC-003b 服务级用例 enroll→重启→heartbeat 200 实跑 14 passed（复用既有覆盖，未新增重复）。
- AC-003：`re_verified`——文件级断言实跑通过：读回文件含 token_hash、无明文 token/instance_token、stat mode 0600（line 130-137）。
- AC-004：`re_verified`——损坏 JSON 与缺失文件（ENOENT）两分支均实跑通过（line 199-222）。
- AC-005：`re_verified`（config 解析）——`default_instances_file_path` 具体路径断言 + `parse_bridge_cli_args` env 读取断言实跑通过（line 152-182）。`npm run bridge` 与 manual 的进程级一致性为 `trust_prior`，依赖「四启动路径共用 config 解析路径」的设计，无独立进程测试。
- AC-006：`re_verified`——persist 写入 60s 旧 seen_at → load 后断言 seen_at 重置为启动时刻附近、`build_status` 含恢复实例未被 sweep（line 175-197）。

coverage = 6 / 6（AC-005 进程级等价为 trust_prior，见上）

- 系统性 follow-up：无

reviewed_scope: 38d66a50073bd84d

verdict: PASS

## Round 3 (2026-08-16 01:20 UTC+8)

### 前轮 finding 复核（以 `git diff 2773813bed85a06347775688033769095051232a` 与代码为准）

- **t201_test_f006（minor，wait_for_file 只等可读不等可解析）——已消除**。当前 `wait_for_file`（`tests/unit/bridge_registry_refactor.test.ts:110-124`）改为「内容非空且 `JSON.parse` 成功才返回」，逐路径核实：
  - 文件未出现（ENOENT）→ `readFile` 抛错 → catch → 重试；
  - 空串（create/truncate 间隙）→ `content.trim()` 为 falsy，不 return，落到 sleep → 重试（原 f006 的精确失败场景已堵住）；
  - 半截/部分写入 JSON → `content.trim()` truthy → `JSON.parse` 抛错 → catch → 重试；
  - 有效 JSON → `JSON.parse` 成功 → return。
  - 50×10ms 超时后显式 `throw` 带清晰错误信息（响亮失败，非静默吞掉）。
  生产侧 `persist()`（registry.ts:48-56）单次 `writeFile` 写完整 JSON 数组，任一严格前缀都不是合法 JSON 文档，故 parse 成功即保证整份文件已落盘，紧随其后的 `readFile`/`stat` 断言读到的必是完整内容。修复为彻底修，非「换形式弱化」。
- **f001-f005（Round 1 两条 important + 三条 minor，Round 2 已判消除）——无回归**。本轮改动仅 `wait_for_file` 主体，AC-003/001/006 断言集与 Round 2 完全一致，未弱化；实跑 `bridge_registry_refactor.test.ts` + `agent_bridge_config.test.ts` 40 passed，`t137_bridge_security.test.ts` 沿用既有 14 passed 覆盖。

### 改测方向复核

无「迁就实现」改测。`wait_for_file` 变更属测试基础设施加固（修 flake），未改动任何断言预期值。

### 本轮新发现

0 条。

### 未进表的提示

- `wait_for_file` 的宽 catch 吞掉 readFile/JSON.parse 之外的真实错误，但以超时响亮 throw 兜底，轮询 helper 可接受。
- 500ms（50×10ms）总等待依赖 persist 单次 `writeFile`；若未来 persist 重构为增量/多段写入，parseable 轮询仍成立（直到完整可解析才返回），无新风险。

### 总体判断

Round 2 唯一遗留 minor f006 经代码逐路径核实已彻底消除，修复未引入新问题（0 新 finding），无未解决 critical / important → PASS。

### AC 复验方式

- AC-001/002/003/004/006：`re_verified`——实跑两个相关测试文件 40 passed，覆盖文件级 mode/token_hash 断言、双实例恢复、seen_at 重置、损坏/缺失文件、parseable 轮询落盘；AC-002 由 t137 既有服务级用例（14 passed）覆盖。
- AC-005：`re_verified`（config 解析）——`default_instances_file_path` 具体路径 + `parse_bridge_cli_args` env 读取断言实跑通过；`npm run bridge` 与 manual 进程级等价为 `trust_prior`，依赖「四启动路径共用 config 解析路径」设计。

coverage = 6 / 6（AC-005 进程级等价为 trust_prior，见上）

- 系统性 follow-up：无

reviewed_scope: 152399c9bb306d60

verdict: PASS

## Round 4 (2026-08-16 01:21 UTC+8)

### 前轮 finding 复核（以 `git diff 2773813bed85a06347775688033769095051232a` 与指纹为准）

- **f001-f006（Round 2/3 已判消除）——全部保持，无回归**。复核方式：用 `repo_task.monitoring.review_scope_fingerprint`（check_review_status / render_review_prompts 单一真相源）计算当前指纹，排除 task.md / review 报告 / handoff.json / pending / findings / archive / spikes / .scratch 等流程文件后，`git diff 2773813...` + untracked 内容 SHA1 = `152399c9bb306d60`，与 Round 3 测试报告末条 `reviewed_scope: 152399c9bb306d60` **逐字节一致**。测试文件（`agent_bridge_config.test.ts` / `bridge_registry_refactor.test.ts`）与生产文件（`config.ts` / `registry.ts`）自 Round 3 起内容零变化——AC-003 文件级断言、wait_for_file parseable 轮询、双实例组合恢复、ENOENT 分支、default 路径断言均无退化，前轮判定成立。

### 改测方向复核

无「迁就实现」改测——本轮无任何测试文件改动，指纹不变即为证。

### 本轮新发现

0 条。

### 未进表的提示

- **review_scope=stale 真因非处置表变更，而是 code 报告手录笔误**。`check_review_status.py` 的 `scope_ok` 要求 review_code.md 与 review_test.md 末条 `reviewed_scope` 都等于当前计算值。当前值 `152399c9bb306d60`；test 报告 Round 3 一致（ok）；code 报告 Round 3 写的是 `152399c9bb30660d`（末尾三位 `60d`↔`d60` 转置错位）。SHA 内容变化产生完全无关的散列，不可能仅差末三位转置——这是转录笔误，非被审 diff 内容变化。task.md 处置表（含 code f001 fix_ref 修正）属于被指纹排除的流程文件，**不是** stale 成因。解除 overall=INCOMPLETE 需 code 侧将其报告 Round 3 指纹修正为 `152399c9bb306d60`，属 code 轴报告问题，不属本测试 review 范围，不进 finding 表。
- 处置表 code f001 行 status「已修」与 Round 2 记录 f004「f001 改『遗留/Finalization』」存在表内语义张力，属 code 轴处置一致性议题，非测试 scope。

### 总体判断

测试侧被审 diff 自 Round 3 起字节级未变（指纹一致），处置表修正属流程文件不影响测试范围，无新测试问题；前轮 6 条 finding 均已消除且无回归，本轮 0 新 finding，无未解决 critical / important → PASS。

### AC 复验方式

- AC-001/002/003/004/006：`re_verified`——指纹与 Round 3 逐字节一致，证明测试与生产文件未变；沿用 Round 3 已实跑证据（`bridge_registry_refactor.test.ts` + `agent_bridge_config.test.ts` 40 passed；AC-002 由 t137 既有 14 passed 服务级用例覆盖）。
- AC-005：`re_verified`（config 解析）——沿用 Round 3 实跑证据；`npm run bridge` 与 manual 进程级等价为 `trust_prior`，依赖「四启动路径共用 config 解析路径」设计。

coverage = 6 / 6（AC-005 进程级等价为 trust_prior，见上）

- 系统性 follow-up：无

reviewed_scope: 152399c9bb306d60

verdict: PASS
