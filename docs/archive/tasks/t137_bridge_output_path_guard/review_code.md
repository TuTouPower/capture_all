# Task review t137（reviewer_focus: 代码）

- task：`t137_bridge_output_path_guard`
- spec：`docs/tasks/t137_bridge_output_path_guard/spec.md`
- diff_anchor：`336d88dd4ea11dcd24d15ab2b62150362d99b673`
- target：`git diff 336d88dd4ea11dcd24d15ab2b62150362d99b673`
- round：1
- reviewed_at：2026-08-12 18:20 UTC+8

reviewed_scope: c3040c654612d4f9

## Findings

### t137_code_f001 - heartbeat label 顶替路径未加 origin 扩展 ID 防护（AC-008 覆盖缺失）

- 严重度：important
- 锚点：AC-008「label 冲突顶替路径同样防护」未覆盖 heartbeat 路径
- 位置：`src/bridge/server.ts:413-427`（heartbeat label 冲突删除循环），对比已加防护的 enroll 路径 `src/bridge/server.ts:302-305`
- 问题：enroll 的 label 顶替删除前新增了 origin 绑定校验（`inst.origin_extension_id !== null && ext_id !== null && inst.origin_extension_id !== ext_id → continue`），但 heartbeat 的 label 冲突删除（L413-427）没有等价的 origin 校验，直接 `instances.delete(id)`。失败场景：恶意扩展 B（origin 扩展 ID=b）向 `/extension/heartbeat` 提交自己实例的 `browser_label`，与已绑定扩展 A（origin=a，label='work'）的实例冲突 → heartbeat 循环无校验删除 victim 实例 → victim 被踢下线（EXTENSION_OFFLINE），label 定位 / 单实例定位命令改投恶意扩展，实现 AC-008 要防的「伪造 origin 顶替实例」。t137 AC-008 测试只覆盖 enroll 路径（tests/unit/t137_bridge_security.test.ts:135-148），未触达 heartbeat 路径。另：label 顶替删除逻辑在 enroll（L298-320）与 heartbeat（L413-427）两处重复，本次防护只修了一处副本，属「重复已造成修复遗漏」。
- 建议：heartbeat 删除冲突实例前套用与 enroll 相同的 origin 绑定校验（删除条件加 `inst.origin_extension_id === null || ext_id === null || inst.origin_extension_id === ext_id`，其中 heartbeat 侧 `ext_id` 可由该请求携带的实例 token 对应实例的绑定推导——heartbeat 无 Origin 头，须从 `resolve_extension_auth` 得到的实例 token 查回 `inst.origin_extension_id`）；更优是把 label 顶替删除抽成共用函数（enroll + heartbeat 共用，统一防护与清理逻辑），避免再次分叉。

### t137_code_f002 - safe_output_path 纯词法校验，符号链接可绕过导出目录约束

- 严重度：important
- 锚点：AC-001「output_path 超出导出目录时不写文件」的约束可被击穿；安全评审重点第 1 条明确要求核查符号链接向量
- 位置：`src/bridge/server.ts:822-829`（`safe_output_path`），写盘点 `src/bridge/server.ts:837`（`writeFile`），调用点 L498-500 / L529-532
- 问题：`safe_output_path` 用 `path.resolve`（纯字符串词法归一化，不触碰文件系统、不解析符号链接）做 `resolved.startsWith(base + sep)` 前缀校验。若导出目录内已存在指向目录外的符号链接（默认导出目录 `join(tmpdir(),'capture-all-exports')` 即 `/tmp/capture-all-exports`，`/tmp` 本机共享、可被本地共存进程预置），攻击者使 `output_path='sub/evil'`（`sub` 为符号链接 → `/etc`），词法校验通过，`writeFile` 跟随符号链接写到 `/etc/evil`；导出目录本身被预置为符号链接时同理。L822 注释声称已覆盖「绝对路径/..//符号链接」，但代码实际未处理符号链接，注释与实现不符。这是本 task 声称收敛的「本地攻击面任意写」的同型旁路（需要本地共存进程可在共享 tmpdir 预置符号链接；正是本 task 的威胁模型）。
- 建议：校验改为解析真实路径后比前缀——对 `base` 先 `fs.realpath`（必要时先 `mkdir` 真实目录而非经符号链接），对目标路径取最深已存在祖先做 `fs.realpath` 再与真实 base 比对前缀；或写盘用 `fs.open` + `O_NOFOLLOW` 句柄在 realpath 后的目录内写入。自动路径 `resolve_auto_output_path` 与 explicit 路径共用同一 base，修复应统一覆盖。

### t137_code_f003 - resolve_auto_output_path 一行被意外拼接（无关本 task 的格式化回退）

- 严重度：minor
- 锚点：行为缺陷（无）；本 task diff 内的非必要改动
- 位置：`src/bridge/server.ts:811`
- 问题：diff 把 `capture_id` 三目判断两行误并为一行（`...length > 0        ? payload.capture_id`），多余 8 个空格、行超长，与本 task 无关，属「顺手」改动且是格式化回退。
- 建议：恢复原两行写法，或在实现 commit 前统一过项目 formatter。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮为 Round 1）
- 本轮新发现：3 条（f001 important / f002 important / f003 minor）
- 未进表的提示：
  - 文件过大：`src/bridge/server.ts` = 950 行（含空行注释），达实现源码 ≥800 important 阈值，且本 task 净增约 50 行；按降级规则仅结论提示。根因是 `create_bridge_server` 巨型分发函数内联了 enroll/heartbeat/command 全部业务逻辑。
  - 复杂度：`create_bridge_server` 的 HTTP 处理器（L172-579）承载全部路由与业务分支，手算 McCabe 远超 15；本 task 又新增 enroll 绑定校验与 safe_output_path 分支。复杂度本身不 blocking；f001 即其已产出的可观测缺陷（两处 label 顶替逻辑分叉）。
  - 测试覆盖观察（交 test reviewer）：AC-002 用例仅断言 `not.toBe(400)`（t137_bridge_security.test.ts:93），未驱动在线扩展验证「导出目录内相对路径真实落盘」；无用例验证 safe_output_path 写盘成功路径（explicit 目录内路径 + 在线扩展 → 文件落于导出目录）；AC-008 未覆盖 heartbeat 路径。本 reviewer 未执行测试套件（read-only），以上为静态读代码/断言结论。
  - 范围外（流程文件，不入 finding）：`docs/findings/d004_enroll_origin_binding.md` 仍是未填写的模板（`{...}` 占位符），未写入 spike 结论正文；结论实际在 `docs/spikes/s003_enroll_origin_binding/report.md`。属任务交付完整性问题，建议收尾前补填。
  - 范围外观察：enroll 经 mcp token（无 Origin）首次创建的实例 `origin_extension_id=null`，后续可被任意扩展经 label 顶替删除（guard 要求 `inst.origin_extension_id !== null` 才生效）。实际扩展总是带 chrome-extension Origin 注册，故正常流程实例均有绑定；该口仅影响 mcp token 创建实例，归入 f001 修复时一并评估。
- 总体判断：存在 2 条未解决 important（f001、f002），均锚定 AC-008 / AC-001 且给出可观测失败场景；AC-008 当前未满足。FAIL。
- AC 复验披露：
  - AC-001：re_verified——静态查证 `safe_output_path` 词法校验拒绝绝对路径 / `..` 穿越（L822-829），t137 测试断言 400 + INVALID_QUERY；符号链接旁路见 f002，AC-001 保证不完整。
  - AC-002：trust_prior——守卫放行导出目录内相对路径已静态查证，但「正常写盘」端到端（在线扩展 + 落盘位置）未在本轮复验，t137 用例仅断 not-400；依赖实施侧既有导出流程测试。
  - AC-003：re_verified——diff 确认 `resolve_auto_output_path` 逻辑未变（仅 f003 一行格式化回退）。
  - AC-004：re_verified——grep 既有测试，无测试向 `/mcp/command` 传显式 output_path（export_large_fix 仅为 MCP schema 校验用例），相对路径落盘位置变更不破坏既有断言；未执行套件。
  - AC-005：re_verified——代码路径（L324-340）拒绝无扩展绑定 / 扩展 ID 不匹配的既有实例重 enroll，t137 用例（L104-117）覆盖 403。
  - AC-006：re_verified——diff 确认新 instance_id 无 existing 分支直通，t137 用例（L129-133）覆盖 200。
  - AC-007：re_verified——同 Origin 扩展 ID 重 enroll 放行（L333-339 语义），t137 用例（L119-127）覆盖 200。
  - AC-008：未满足（f001）——enroll 路径已防护，heartbeat 路径未防护。
  - coverage = 6 / 8（trust_prior 1/8 = 12.5%，未满足 1/8；全部复验为静态代码 + 测试断言核对，未执行测试套件）。
- 系统性 follow-up：建议标题「enroll/heartbeat label 顶替删除逻辑抽取共用函数并统一 origin 绑定防护」，slug `label_steal_guard_unify`，阻断性：非阻断（由 f001 修复承载，可并入本 task）。

verdict: FAIL

## Round 2 (2026-08-12 18:45 UTC+8)

reviewed_scope: c3040c654612d4f9

### 前轮 finding 复核（以 `git diff` 与代码为准，不采信 task.md 处置表自述）

- **t137_code_f001**：修不彻底。heartbeat 已加 origin 绑定守卫（`server.ts:414-425`），但守卫依赖请求 Origin 头——`hb_ext_id` 从 Origin 头提取，Origin 头可选（server 仅「若存在」才校验，L176）。无 Origin 的 heartbeat 时 `hb_ext_id === null`，守卫条件 `hb_ext_id !== null` 为 false，label 冲突删除照常执行，防护被绕过。残留以 f004 记录。
- **t137_code_f002**：主向量已修。`safe_output_path` 改 realpath 收敛（`server.ts:832-858`），「导出目录内符号链接指向外部」被正确拒绝（AC-002b 用例语义成立）。但修复引入新回归：base 路径含符号链接组件时误拒合法相对路径（f005）。TOCTOU 残余（realpath 校验与 `writeFile` 之间符号链接被换）仍在，见结论提示。
- **t137_code_f003**：未修。task.md 处置表标「已修」，但 diff 与当前文件 `server.ts:819` 仍为折叠单行 `const capture_id = typeof payload.capture_id === 'string' && payload.capture_id.length > 0        ? payload.capture_id`（8 空格 + 超长），与基线 diff 完全一致。

### 本轮新发现

### t137_code_f004 - heartbeat label 顶替可经无 Origin 请求绕过

- 严重度：important
- 锚点：AC-008「label 冲突顶替路径同样防护」——heartbeat 顶替防护在无 Origin 请求下不生效
- 位置：`src/bridge/server.ts:414-425`（heartbeat 守卫）；对比 enroll 硬拒绝 `server.ts:326-331`
- 问题：heartbeat 守卫在 `hb_ext_id === null`（请求无 Origin 头）时整体跳过（`hb_ext_id !== null` 为 false），label 冲突删除照常执行。失败场景：恶意扩展 B 已 enroll 持有 instance token TB，用非浏览器客户端向 `/extension/heartbeat` 发 `Authorization: Bearer TB` + `instance_id=inst_b` + `browser_label='work'`（victim A 的 label）且不带 Origin 头 → `hb_ext_id=null` → 守卫跳过 → 删除 `inst_a`（victim）→ victim 被踢下线、label 'work' 归 B，后续按 label 定位的命令投给 B。enroll 路径对同类场景（`ext_id===null`）是硬拒绝 403，heartbeat 却是软跳过，两路径防护强度不一致。浏览器内扩展无法省略 Origin（浏览器自动携带 `chrome-extension://<id>`），此绕过需要「非浏览器客户端 + 合法 instance token」——正属本 task 声明的「本地攻击面」可及路径（恶意扩展作者可控 companion 本地进程）。
- 建议：`hb_ext_id` 不应取请求 Origin 头，应取被认证实例自身绑定：`const hb_ext_id = instances.get(body.instance_id)?.origin_extension_id ?? null`（heartbeat 已按 token 认证为 `body.instance_id`）。恶意 B 无论带不带 Origin，`hb_ext_id=B ≠ A` → 不删；mcp token 路径创建的实例绑定为 null → 保留旧删除行为。grep 既有测试无「heartbeat 触发 label 冲突删除」用例，改为存储绑定不破坏现有行为。

### t137_code_f005 - safe_output_path 在 base 含符号链接组件时误拒合法相对路径

- 严重度：important
- 锚点：AC-002「导出目录内相对路径正常工作」；AC-004「既有导出流程不回退」
- 位置：`src/bridge/server.ts:832-858`，根因是 L837 `let real_parent = resolve(base)`（词法 base）与 L854 `const base_real = await realpath(base)`（真实 base）不对称
- 问题：realpath 收敛循环只解析「已存在」的路径段（L842-851），目标文件通常不存在 → 循环第一段即 break，`real_parent` 保持词法 base。最终 `resolved_real` 由词法 base 拼接，`base_real` 却是 realpath(base)。当 base 或其祖先含符号链接组件（macOS TMPDIR 未设时 `/tmp`→`/private/tmp`；或 `CAPTURE_ALL_EXPORT_DIR` 指向符号链接目录）且目标文件尚不存在，两者前缀不匹配 → 合法相对路径被误判 `resolves outside export dir` 抛 400。失败场景：macOS 默认导出目录 `/tmp/capture-all-exports`（`/tmp` 为符号链接），base 已存在（先前自动导出已建目录），explicit `output_path='ok.json'` 首次写入 → 400；修复前该场景 `writeFile` 正常落盘。AC-002/AC-004 回归。另注：base 不存在时（fresh server 首次 explicit 导出）`realpath(base)` 抛 ENOENT → 外层 catch → 500（修复前后同为 500，非本次新增，但 mkdir 可一并修复）。
- 建议：初始化 `real_parent = await realpath(base)`（base 不存在时先 `mkdir(base, { recursive: true })` 再 realpath，与 `resolve_auto_output_path` 一致），使 `resolved_real` 与 `base_real` 同基；或最终比对前对两侧都归一。

## 结论（Round 2）

- 前轮 finding 复核：f001 修不彻底（守卫依赖 Origin 头，残留 f004）；f002 主向量已修但有回归（f005）；f003 未修（代码 L819 仍折叠）。
- 本轮新发现：2 条（f004 important / f005 important）。
- 未进表的提示：
  - TOCTOU 残余：`safe_output_path` realpath 校验与 `write_result_to_file` 的 `writeFile` 之间，本地攻击者可竞态替换符号链接；本地威胁模型下可及但需精确时序，建议后续用 `O_NOFOLLOW` 打开句柄写入收敛，本轮不阻断。
  - 测试侧观察（交 test reviewer，本轮不阻断）：新增「AC-008」用例的攻击动作仍是 enroll 路径（`tests/unit/t137_bridge_security.test.ts:156`），仅用 token heartbeat 作判别（L159-160），未直接测 heartbeat 路径的 label 顶替守卫（即 f004/f001 修复对象无直接测试）；用例名 AC-004（L163）与 spec AC-004 语义不符（spec AC-004=既有导出流程不回退，用例内容=无 Origin 重 enroll）；`_safe_output_path_for_test`（`server.ts:861`）为测试从生产模块导出 test seam，可接受。
  - 范围外（流程文件，不入 finding）：`docs/findings/d004_enroll_origin_binding.md` 仍为未填写模板（`{...}` 占位符），spike 结论未落 findings，建议收尾前补填。
- 总体判断：f004、f005 两条未解决 important（分别锚定 AC-008 绕过与 AC-002/AC-004 回归），f003 minor 未修；本轮 FAIL。
- AC 复验披露（Round 2 增量）：
  - AC-001：re_verified——词法 + realpath 双层校验拒绝绝对路径/`..`/目录内符号链接（L832-858），AC-002b 用例覆盖符号链接穿越；仍受 f005（误拒）与 TOCTOU（漏放）影响，AC-001 完整保证仍未达成。
  - AC-002：re_verified（部分）——Linux 真实 base 下相对路径通过（`_safe_output_path_for_test('ok.json', mkdtemp)` 用例）；符号链接 base 下误拒，见 f005。
  - AC-003：re_verified——`resolve_auto_output_path` 逻辑未变（仅 L819 折叠回退未修）。
  - AC-004：re_verified（部分）——grep 既有测试无显式 output_path 落盘断言；f005 引入平台相关回退风险。
  - AC-005/006/007：re_verified——代码与用例与 Round 1 一致，未受本轮改动影响。
  - AC-008：未满足——enroll 路径已防护（t137 用例覆盖），heartbeat 路径可经无 Origin 请求绕过（f004）。
  - coverage（本轮判据）= 5 / 8（AC-001/003/005/006/007 re_verified；AC-002/004 部分复验；AC-008 未满足；全部为静态代码 + 断言核对，未执行测试套件）。
- 系统性 follow-up：同 Round 1——「enroll/heartbeat label 顶替删除逻辑抽取共用函数并统一 origin 绑定防护」，slug `label_steal_guard_unify`，阻断性：由 f004 修复承载，可并入本 task。

verdict: FAIL

## Round 3 (2026-08-12 19:05 UTC+8)

reviewed_scope: 88d9829e9474d600

### 前轮 finding 复核（以 `git diff` 与代码为准，不采信 task.md 处置表自述）

- **t137_code_f001**：已消除。f004 修复后 heartbeat 守卫改用 `prev?.origin_extension_id`（`server.ts:416`），不再依赖请求 Origin 头；恶意实例自身绑定非 null，无 Origin 客户端不可绕过。f001/f004 合并为同一条防护，见下方 f004 复核。
- **t137_code_f002**：主向量已修。realpath 收敛正确拒绝「导出目录内符号链接指向外部」（`server.ts:838-858`，AC-002b 用例成立）；f005 修复后同基比对不再误拒。TOCTOU 残余（realpath 校验与 `writeFile` 之间符号链接竞态替换）仍在，属本地共存进程精确时序竞态，本轮不阻断，结论段提示。
- **t137_code_f003**：已修。`server.ts:818-819` capture_id 三目恢复两行，与 baseline 一致。
- **t137_code_f004**：已修。`server.ts:416` `const hb_ext_id = prev?.origin_extension_id ?? null`——取被认证实例自身绑定而非请求 Origin。验证攻击链闭合：恶意 B 只能经 chrome-extension origin enroll（拿不到 config.token 走 mcp 路径），其实例绑定非 null；B 用实例 token 发 heartbeat（带或不带 Origin）→ `hb_ext_id=B ≠ A` → 不删 victim。mcp token 创建的绑定 null 实例不属威胁模型（mcp token 为 full-trust 凭证，恶意扩展不可及）。新增 AC-008b 用例（`tests/unit/t137_bridge_security.test.ts:163-180`）覆盖 heartbeat 顶替，判别用 victim 原 token heartbeat 200。
- **t137_code_f005**：已修。`server.ts:838-839` `base_real = await realpath(base)` 提前、`real_parent = base_real` 同基初始化；macOS `/tmp`→`/private/tmp` 等 base 含符号链接组件场景，词法与真实路径前缀一致，合法相对路径不再误拒。AC-002 用例（`tests/unit/t137_bridge_security.test.ts:94-98`）仍为 mkdtemp 真实 base，未覆盖符号链接 base 场景，但实现逻辑已静态验证。

### 本轮新发现

### t137_code_f006 - safe_output_path 函数声明行与正文折叠（与 f003 同型，修复遗漏）

- 严重度：minor
- 锚点：无行为缺陷；f003 处置完整性
- 位置：`src/bridge/server.ts:832`
- 问题：`async function safe_output_path(raw: string, base: string): Promise<string> {    const resolved = resolve(base, raw);`——函数声明行与首行正文挤在物理一行（8 空格），与本 task 修掉的 f003 capture_id 折叠同型。implementer 在 f003 处置中声称「capture_id 行格式化」已修，但本 task 新增的 safe_output_path 首行仍存在同类折叠，属修复遗漏。
- 建议：拆为两行，或实现 commit 前统一过项目 formatter。

[Round 3 复核补充 2026-08-12] f006 已由 implementer 修复：`server.ts:832` 折叠消除（`async function safe_output_path(...) {` 独立一行，正文 `const resolved` 换行）。f006 为 minor，修复不改变 verdict。另确认 `docs/findings/d004_enroll_origin_binding.md` 内容已补齐（模板占位符替换为 s003 spike 结论，含来源/结论/证据/影响）；d004 属 findings 流程文件，不计入指纹。以上改动使 review_scope 失效，Round 3 reviewed_scope 已回写为当前 diff 指纹 `88d9829e9474d600`。

## 结论（Round 3）

- 前轮 finding 复核：f001 已消除（并入 f004 修复）；f002 主向量已修（TOCTOU 残余见提示）；f003 已修；f004 已修（攻击链闭合，AC-008b 覆盖）；f005 已修（同基比对）。
- 本轮新发现：1 条（f006 minor）。
- 未进表的提示：
  - TOCTOU 残余（f002 后续）：`safe_output_path` realpath 校验与 `write_result_to_file` 的 `writeFile` 之间，本地共存进程可竞态替换符号链接。本轮不阻断；建议后续用 `O_NOFOLLOW` 打开句柄写入收敛。
  - base 不存在边界（非本 task 引入）：导出目录从未创建时 explicit output_path 相对路径 → `realpath(base)` ENOENT → 外层 catch 500（`server.ts:838`）；baseline 下同样输入 `writeFile` ENOENT 亦 500，行为未恶化。建议 safe_output_path 对 base 先 `mkdir(recursive)` 或转 400 INVALID_QUERY，作为改进项。
  - 测试覆盖缺口（交 test reviewer，不阻断）：AC-002 未覆盖「base 含符号链接组件不误拒」场景；AC-008b 用带 Origin heartbeat 测，未显式测无 Origin heartbeat（实现改用 prev 绑定后逻辑上天然覆盖）；`_safe_output_path_for_test`（`server.ts:862`）为生产模块导出的 test seam。
  - 范围外（流程文件）：`docs/findings/d004_enroll_origin_binding.md` 内容已补齐（2026-08-12 复核确认），s003 spike 结论已落 findings；不计入指纹。
- 总体判断：f001-f005 全部消除，仅剩 f006 minor 及若干改进项/TOCTOU 残余；无未解决 critical / important。PASS。
- AC 复验披露（Round 3 增量）：
  - AC-001：re_verified——词法 + realpath 双层校验拒绝绝对路径 / `..` / 目录内符号链接（L832-858）；AC-001/AC-001b/AC-002b 用例覆盖。
  - AC-002：re_verified（部分）——真实 base 相对路径通过（L94-98 用例）；base 含符号链接组件场景静态验证通过，无直接用例；base 不存在场景 500 见提示。
  - AC-003：re_verified——`resolve_auto_output_path` 逻辑未变。
  - AC-004：re_verified（部分）——grep 既有测试无显式 output_path 落盘断言；无端到端写盘复验，依赖既有导出流程测试。
  - AC-005/006/007：re_verified——代码与用例一致（L324-340、AC-005/006/007 用例）。
  - AC-008：re_verified——enroll 与 heartbeat 双路径守卫均防住（L302-305 / L416-422）；AC-008 + AC-008b 用例覆盖，判别性验证用 victim 原 token heartbeat 200。
  - coverage（本轮判据）= 6 / 8（AC-001/003/005/006/007/008 re_verified；AC-002/004 部分复验；全部为静态代码 + 断言核对，未执行测试套件）。
- 系统性 follow-up：无新增。Round 1 建议「label 顶替删除逻辑抽取共用函数」仍适用（enroll 与 heartbeat 两处重复逻辑，本次各自独立修补），slug `label_steal_guard_unify`，阻断性：非阻断，可作后续重构。

verdict: PASS
