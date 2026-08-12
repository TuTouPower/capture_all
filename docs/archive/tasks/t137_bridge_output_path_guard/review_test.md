# Task review t137（reviewer_focus: 测试）

- task：`t137_bridge_output_path_guard`
- spec：`docs/tasks/t137_bridge_output_path_guard/spec.md`
- diff_anchor：`336d88dd4ea11dcd24d15ab2b62150362d99b673`
- target：`git diff 336d88dd4ea11dcd24d15ab2b62150362d99b673`
- round：1
- reviewed_at：2026-08-12 21:40 UTC+8

审查范围：`src/bridge/server.ts` diff + 新增 `tests/unit/t137_bridge_security.test.ts`（untracked 新文件，diff 不含，按任务指定纳入）。未运行测试（只读审查），以下全部基于代码与断言逻辑分析。

## Findings

### t137_test_f001 - AC-008 既有实例存活断言非判别性（假绿）：防护缺失时测试同样通过

- 严重度：important
- 锚点：AC-005「既有实例 token 不失效」；AC-008「label 冲突顶替路径同样防护」
- 位置：`tests/unit/t137_bridge_security.test.ts:135-148`（AC-008），判别点在 146-147
- 问题：AC-008 末断言 `re_enroll(inst_a, origin_a).status === 200` 在**有无 t137 防护两种实现下都通过**，无法证明「已绑定 origin_a 的真实实例未被删除」。
  - 有防护：label 顶替循环因 `origin_extension_id !== ext_id` 跳过 inst_a，inst_a 保留；随后同 origin 重 enroll → 200。
  - 无防护（把 t137 label 防护去掉）：攻击 enroll inst_evil（label 'work', origin_b）的 label 循环直接删除 inst_a；随后 `enroll(inst_a, origin_a)` 因 `instances.get('inst_a')` 为 undefined 走**首次 enroll 分支**（server.ts:324-350 的 existing 检查不触发）→ 同样 200。
  - 因此测试在防护被删除时仍 PASS——正是「测了假行为致 AC 看似覆盖」。146 行注释「验证 inst_a 仍在」与实际断言能力不符。
  - AC-005 同样只断言攻击 403（该断言判别性正确），但未验证既有实例存活 / 原 token 有效。
- 建议：捕获首次 enroll 的 `instance_token`，攻击后**用原 token 发 heartbeat → 期望 200**（inst_a 被删则 token_hash 无匹配 → 401，判别性成立）；或断言 `/mcp/status` 的 extensions 中仍含 inst_a。AC-005 可补同款原 token 存活断言。

### t137_test_f002 - 符号链接穿越向量未覆盖，且实现注释声称防御但实际未防御

- 严重度：important
- 锚点：AC-001「output_path 穿越导出目录时返回错误、不写文件」；审查重点「路径穿越向量覆盖（符号链接/绝对/../）」
- 位置：`src/bridge/server.ts:822-829`（safe_output_path 注释「防路径穿越任意写（绝对路径/..//符号链接）」）；`tests/unit/t137_bridge_security.test.ts:53-79`（无符号链接用例）
- 问题：`safe_output_path` 用 `path.resolve`（纯词法拼接），**不解析符号链接**。export_dir 内存在符号链接 `<base>/link -> /etc` 时，`output_path = 'link/cron.d/evil'` 词法解析结果为 `<base>/link/cron.d/evil`，startsWith `<base>/` → 通过校验；`write_result_to_file` 的 `writeFile` 跟随符号链接写 `/etc/cron.d/evil`——AC-001「穿越导出目录」语义被绕过，注释声称的符号链接防御与实现不符。测试只覆盖绝对路径与 `..`，无符号链接用例；若补一个「export_dir 内建 symlink 指向外部 + output_path 指向其内 → 期望 400」的用例，当前实现会 FAIL（guard 放行，命令走到 EXTENSION_OFFLINE 503），即现有测试无法兜住该向量。
- 建议：实现侧用 `fs.realpath` 对已存在前缀做真实路径收敛后再校验（或显式拒绝含符号链接前缀的路径），并补符号链接用例；若选择不防御，删除注释中符号链接 claim 并在 spec 注明边界。关联：自动路径 `resolve_auto_output_path`（server.ts:807-820）同样无符号链接防御，默认导出目录 `/tmp/capture-all-exports` 在共享 tmp 下存在被预置符号链接的经典攻击面，建议一并评估。

### t137_test_f003 - AC-002 仅断言「非 400」，未验证相对路径真实落盘

- 严重度：minor
- 锚点：AC-002「导出目录内相对路径正常工作」
- 位置：`tests/unit/t137_bridge_security.test.ts:81-94`
- 问题：`not.toBe(400)` 只证明 guard 对合法相对路径放行；无扩展在线使流程在写盘分支前返回 503（EXTENSION_OFFLINE），新增的显式路径写盘分支（server.ts:529-531 `explicit_path ? safe_output_path(...) : ...`）从未被执行，`ok.json` 是否实际写入 `<export_dir>/ok.json` 未被验证。
- 建议：复用既有全链路基础设施（`tests/unit/agent_bridge_server.test.ts:750` 的 enroll+heartbeat+command+result 回环，output_path 省略版已验证自动落盘），补一个显式 `output_path: 'ok.json'` 的全链路用例，断言文件落在 `<export_dir>/ok.json`。

### t137_test_f004 - 新分支「既有 origin 绑定实例被无 Origin（mcp token）重 enroll → 403」无测试

- 严重度：minor
- 锚点：AC-007 相关新防御分支（无 AC 直接对应）
- 位置：`src/bridge/server.ts:326-332`
- 问题：`if (existing) { if (ext_id === null) return 403 }` 是本次新增行为分支（此前无 Origin 重 enroll 会成功并轮换 token），无任何测试覆盖。行为变更方向与设计一致（无法验证同扩展则拒绝），但属「新增未测分支」。
- 建议：加一个用例：先以 chrome-extension origin 首次 enroll 既有 instance_id，再以纯 mcp token（无 Origin）重 enroll 同 instance_id → 期望 403。

## 结论

- 改测方向复核：无。diff 未修改任何既有测试（新增测试文件为 untracked 新文件；`src/bridge/server.ts` 改动不触及既有测试使用的自动落盘路径——`resolve_auto_output_path` 语义未变，`agent_bridge_server.test.ts` 全部 export 用例走 output_path 省略分支，不受影响）。无「迁就实现」的改测。
- 本轮新发现：4 条（f001-f004）。
- AC 复验方式：
  - AC-001：re_verified。逐行核对测试与 `server.ts:497-500` 守卫：绝对路径经 `path.resolve(base, abs)` 仍为绝对路径，不落入 base → 抛 BridgeHttpError(400, INVALID_QUERY)，守卫在 resolve_target 与 enqueue 之前，拒绝即不可能写文件；测试断言 400 + error.code INVALID_QUERY，触达真实防护。
  - AC-002：re_verified（守卫放行分支）。`ok.json` 词法解析落在 base 内不抛错，命令到 EXTENSION_OFFLINE 503，`not.toBe(400)` 成立；但写盘结果未验证（见 f003）。
  - AC-003：re_verified。`resolve_auto_output_path` 除格式串行外无逻辑变更，既有自动落盘用例（agent_bridge_server.test.ts:750、T096 系列）路径不受影响。
  - AC-004：re_verified。无既有测试传显式 output_path 到 `/mcp/command`（grep 全仓：仅 `export_large_fix.test.ts` 测 MCP schema 解析，不触 server）；既有导出用例全部走省略分支，diff 不改其行为。
  - AC-005：re_verified（拒绝分支判别性正确）。伪造 origin_b 不同扩展 ID 重 enroll 同 instance_id → `server.ts:333-338` 扩展 ID 不匹配 → 403；无防护时该请求会成功，故 403 断言可判别。既有实例存活未在 AC-005 内验证（见 f001）。
  - AC-006：re_verified。新 instance_id 首次 enroll → existing 未命中 → 200，零配置流程保留。
  - AC-007：re_verified。同 origin 同 instance_id 重 enroll → 扩展 ID 一致通过守卫 → 200；若守卫误伤会返回 403 使测试失败，可判别 accept 分支。
  - AC-008：re_verified（守卫路径可达），但存活断言非判别性（f001），「既有实例不被删除」未获真实验证。
  - coverage = 8 / 8 re_verified
- 未进表的提示：
  - `docs/findings/d004_enroll_origin_binding.md` 为未填写的模板文件（过程文件，非测试 scope，未纳入 finding）。
  - `/mcp/command` 在校验点与写盘点两次调用 `safe_output_path`（server.ts:499、530），重复守卫的一致性属 code review 范围，未进表。
  - AC-001b 只断言 status 400 未断言 error.code，与 AC-001 不一致（可加，minor 以下）。
- 总体判断：两条 important 未解决——AC-008 既有实例存活断言为假绿（防护删除仍 PASS），符号链接穿越向量未被实现防御亦无测试兜底。测试整体可信度不足以支撑 PASS。
- 系统性 follow-up：无（f002 的符号链接防御缺口若按「不做符号链接防御」处置，建议在 `docs/blueprint/decisions.md` 记录导出目录信任边界）。

reviewed_scope: c3040c654612d4f9

verdict: FAIL

## Round 2 (2026-08-12 22:05 UTC+8)

### 前轮 finding 复核（以当前 diff 与代码为准，未运行测试）

- t137_test_f001（AC-008 存活断言非判别性）→ **已消除**。复核：AC-008 现保存首次 enroll 的 `real_token`，攻击后用原 token 发 heartbeat（`tests/unit/t137_bridge_security.test.ts:147-161`）。判别性验证：inst_a 若被 label 顶替删除，`resolve_extension_auth`（server.ts:635-662）无 token 匹配 → 401；存活则 200。防护删除时该断言 FAIL，判别成立。
- t137_test_f002（符号链接向量未防御未测）→ **已消除**。复核：`safe_output_path` 增加 realpath 收敛（server.ts:831-858），对 raw 的已存在父段逐段 `realpath` 后校验真实路径在 `base_real` 内；新增 AC-002b 符号链接用例（test:100-106），`evil_link→outside` 时词法校验放行、realpath 校验拒绝并抛含 'output_path' 的 BridgeHttpError，`.rejects.toThrow('output_path')` 判别成立。
- t137_test_f003（AC-002 仅断言非 400）→ **已消除**。复核：AC-002 直测 `_safe_output_path_for_test('ok.json', base) === join(base, 'ok.json')`（test:94-98），`_safe_output_path_for_test = safe_output_path`（server.ts:861）为生产函数直接导出，非平行实现、非 mock，符合「生产逻辑可达」。守卫核心（合法相对路径放行）被直接触达。E2E 显式路径落盘仍未走通（extension offline），属可选覆盖扩展，不再阻断。
- t137_test_f004（无 Origin 重 enroll 403 无测试）→ **已消除**。复核：新增 AC-004 用例（test:163-176）——首 enroll origin_a 后无 Origin（纯 mcp token）重 enroll 同 instance_id 期望 403；命中 server.ts:326-332 `ext_id===null` 分支，防护删除则返回 200，判别成立。

### 本轮新发现

### t137_test_f005 - heartbeat label 顶替新增的 origin 防护分支无判别性测试

- 严重度：important
- 锚点：AC-008「label 冲突顶替路径同样防护」（plural「路径」：enroll 与 heartbeat 两条 label 顶替路径）
- 位置：`src/bridge/server.ts:411-430`（heartbeat label 顶替 origin 校验分支）；测试仅覆盖 enroll 路径
- 问题：本轮修复在 heartbeat 的 label 顶替循环额外加 origin 绑定校验（`hb_ext_id` 不匹配则 `continue`），堵住「持自己合法 token 的攻击者用冲突 label 经 heartbeat 顶替删除已绑定实例」的向量。但该分支**无判别性测试**：
  - AC-008 的 heartbeat（inst_a 存活断言）确实经过该循环（inst_a heartbeat 时 inst_evil 同 label 'work'），但断言目标是 inst_a 返回 200，未断言 inst_evil 是否被删。若删除 heartbeat 防护分支，inst_evil 被删、inst_a 仍 200，AC-008 依旧全绿。
  - 即：heartbeat 防护的删除不影响任何现有测试结果。
- 建议：加用例——enroll inst_a（origin_a, label 'work'）取 token；enroll inst_evil（origin_b, label 'other'）取 token；用 inst_evil 的 token + Origin origin_b + label 'work' 发 heartbeat（模拟经 heartbeat 顶替 inst_a）；随后用 inst_a 原 token 发 heartbeat 期望 200（若 heartbeat 防护缺失，inst_a 已被删 → 401，判别成立）。

## Round 2 结论

- 改测方向复核：无迁就实现。AC-002 从 E2E 改为函数级直测，直测对象为生产函数本体（直接导出），非测试内复制逻辑，符合「生产逻辑可达」。
- 本轮新发现：1 条（f005）。
- 未进表的提示：
  - 实现侧 `safe_output_path` 对「绝对路径且位于 base 内」的 raw 会误拒（realpath 收敛把绝对路径首段相对 base 解析后越界），但 AC-001 本就要求绝对路径拒绝，属保守拒绝、不违反 AC；如后续需支持可优化。
  - TOCTOU（realpath 校验与 writeFile 之间的符号链接替换竞态）未覆盖，属文件系统级竞态，建议 `docs/blueprint/decisions.md` 记录导出目录信任边界。
  - 未运行测试（只读审查），「9 测试全绿」为 implementer 自述，未独立复验；本复核以代码/断言逻辑为准。
- 总体判断：f001-f004 已真修（代码逻辑复核）；新增 f005 未解决 important → FAIL。
- 系统性 follow-up：无。

reviewed_scope: c3040c654612d4f9

verdict: FAIL

## Round 3 (2026-08-12 22:30 UTC+8)

### 前轮 finding 复核（以当前 diff 与代码为准，未运行测试）

- t137_test_f005（heartbeat label 顶替 origin 防护分支无判别性测试）→ **已消除**。复核：新增 AC-008b（`tests/unit/t137_bridge_security.test.ts:163-180`），且 heartbeat 辅助函数已更新接收第 5 参 `label`（test:46,55），AC-008b line 175 以 `browser_label: 'work'` + evil_token + origin_b 发 heartbeat。判别性验证：
  - 生产路径：inst_evil heartbeat 经 `resolve_extension_auth`（token 匹配 inst_evil）→ `provided_label='work'` → label 顶替循环命中 inst_a → t137 校验 `inst_a.origin_extension_id(origin_a) !== hb_ext_id(origin_b)` → `continue`，inst_a 不删（server.ts:411-430）。
  - 判别：删除 heartbeat origin 防护后，inst_a 被删 → 末断言 `heartbeat(inst_a, real_token) === 200` 变 401 而 FAIL。判别成立。
  - 边界核实：AC-008b 依赖 enroll 防护先保住 inst_a（step 2 同 label enroll 不删 inst_a），末断言针对的是 heartbeat 防护——enroll 防护被破坏时同样 FAIL，属保守、非假绿。

### 本轮新发现

无。逐条扫描新增与既有测试：无 skip/only/恒真断言/弱化断言/`@ts-ignore`/`eslint-disable`；断言均判别性可达生产守卫（`_safe_output_path_for_test` 直测生产函数本体，heartbeat/enroll 走真实 HTTP + token 鉴权）。

## Round 3 结论

- 改测方向复核：无迁就实现。
- 本轮新发现：0 条。
- 前轮 finding 全部消除：f001-f005。
- 未进表的提示：
  - AC-008b 同时依赖 enroll 防护（step 2）与 heartbeat 防护（step 3）才存活到末断言；两者独立判别未隔离，但任一被破坏都会 FAIL，作为回归守卫足够。如需逐分支隔离可拆两用例，属可选扩展。
  - 「10 测试全绿」为 implementer 自述，只读审查未独立运行；复核基于代码与断言逻辑。
- 总体判断：f001-f005 全部经代码逻辑复核消除，无未解决 critical / important。
- 系统性 follow-up：无。

[Round 3 指纹回写 2026-08-12] 实施方后续改动使 diff 指纹变化：code 轴 f006 minor（`src/bridge/server.ts:832` `safe_output_path` 函数声明行折叠为纯格式修复，不改变任何行为）与 `docs/findings/d004_enroll_origin_binding.md`（流程文件，不计入指纹）。测试文件 `tests/unit/t137_bridge_security.test.ts` 未变（仍 10 个 it，AC-008b/AC-002b/AC-004 断言完好），test 轴已审行为逻辑与 verdict 不受影响。reviewed_scope 已回写为当前 diff 指纹。

reviewed_scope: 88d9829e9474d600

verdict: PASS
