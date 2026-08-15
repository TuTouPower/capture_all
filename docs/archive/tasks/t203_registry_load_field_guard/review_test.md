# Task review t203（reviewer_focus: 测试）

- task：`t203_registry_load_field_guard`
- spec：`docs/tasks/t203_registry_load_field_guard/spec.md`
- diff_anchor：`fdfeb323e17a241d863909cdc607dc07a954b99b`
- target：`git diff fdfeb323e17a241d863909cdc607dc07a954b99b`
- round：1
- reviewed_at：2026-08-16 02:21 UTC+8

## Findings

### t203_test_f001 - AC-002 部分损坏恢复未覆盖 null 数组元素场景

- 严重度：minor
- 锚点：AC-002「同文件含合法条目时,合法条目正常恢复,畸形条目被跳过(部分损坏恢复)」
- 位置：`tests/unit/bridge_registry_refactor.test.ts:246-262`（AC-002 用例）
- 问题：AC-002 用例只覆盖「畸形对象 + 合法对象」的混合文件，未覆盖 `null` 数组元素。文件为 `[null, {合法条目}]` 时 `is_valid_persisted_instance(null)` 在 `item.id` 处抛 TypeError，异常沿 `load_persisted` 外层 try/catch 被吞掉，null 之前的条目保留、之后的合法条目全部丢失——部分损坏恢复被破坏。此实现缺陷已由 code review `t203_code_f001`（重要）确认；本 finding 从测试角度指出：现有 AC-002 用例不足以锁定该行为，补一个含 null 元素的混合文件用例可捕获并防止回归。AC-002 本身已有通过的真实行为测试，故不构成「AC 完全无测试」，降为 minor。
- 建议：AC-002 用例追加 `[null, {合法条目}]` 混合文件，断言合法条目被恢复、size 为 1；修实现后此用例为绿灯，未修则红。

### t203_test_f002 - 字段校验的「类型错误」分支未被任何用例触发

- 严重度：minor
- 锚点：契约区「范围」逐字段校验（instance_id 非空字符串 / token_hash、browser_label、active_capture_id、origin_extension_id 为 string 或 null / extension_version 为 string）
- 位置：`tests/unit/bridge_registry_refactor.test.ts:230-279`（t203 全部三个用例）
- 问题：三个用例只覆盖缺字段（`token_hash: undefined` 经 JSON 序列化丢键）、空串（`id: ''`、`instance_id: ''`）与完全垃圾对象（`{ foo: 'bar' }`），从未触发守卫中「字段存在但类型错误」的拒绝路径——如 `token_hash: 42`、`browser_label: 5`、`origin_extension_id: 123` 等非 null 非 string 值。且 AC-003 用例首条目 `id` 与 `instance_id` 同为空串，空 id 先短路，`instance_id` 空串分支从未成为唯一拒绝原因。守卫的核心 `typeof` 分支实际只有缺失路径被覆盖，类型错误路径无测试锁定。
- 建议：任选字段补一个「存在但类型错误」的畸形条目用例（如 `token_hash: 42` 混入合法条目，断言被跳过）；可选把「instance_id 空、id 合法」单独成例。

## 结论

### 前轮 finding 复核（Round N≥2 才写）

不适用（首轮）。

### 改测方向复核

无。diff 未修改任何既有测试，仅追加 t203 describe 块；无「迁就实现」的改测。

### AC 复验方式

- AC-001（缺 token_hash / instance_id 空 畸形条目被跳过）：`re_verified`。重跑 `npx vitest run tests/unit/bridge_registry_refactor.test.ts` 15 通过；代码 trace 确认 `token_hash: undefined` 经 JSON.stringify 丢键，守卫按缺失路径拒绝；若删除守卫，size 为 1 而断言 0，测试会红，非恒真。
- AC-002（混合文件合法恢复畸形跳过）：`re_verified`。vitest 通过；trace 确认 `inst_ok` 逐字段通过校验被装载（size=1、browser_label='work'）、`inst_bad` 被跳过。注：null 元素子场景未覆盖，见 f001。
- AC-003（全畸形不抛错、从空开始）：`re_verified`。vitest 通过；两条全畸形条目均被拒绝，`load_persisted` resolve 不抛错（若 reject，`await` 会令用例失败），size=0。「bridge 正常启动」以 unit 层 load_persisted 不抛错代理（测试策略已限定在 registry 单测文件）。

coverage = 3/3

### 本轮新发现

2 条（均 minor）。

### 未进表的提示

- `is_valid_persisted_instance` 未校验 `seen_at` 为数字（契约区「范围」列出）。实际无功能影响：`load_persisted` 用 t201 的 `const seen_at = Date.now()` 整体覆盖，持久化 seen_at 是死数据。code review `t203_code_f002` 已提 spec-实现不一致，此处不重复出 test finding。
- AC-003「bridge 正常启动」未跑完整 bridge 启动流程，仅以 load_persisted 不抛错为 unit 层代理；AC 可测试性声明为全部可自动测试，此代理方式与测试策略一致。

### 总体判断

三条 AC 各有真实行为测试，测试可信（真文件 IO、直触生产 `load_persisted`/守卫、无 mock、无危险模式命中），断言均有区分度（删守卫即红）。仅有两条 minor 覆盖扩展建议，无未解决 critical/important。

### 系统性 follow-up

无。

reviewed_scope: dd4fc536dccccab3
verdict: PASS

## Round 2 (2026-08-16 02:27 UTC+8)

- round：2
- reviewed_at：2026-08-16 02:27 UTC+8

### 前轮 finding 复核（以 diff 与代码为准）

- **t203_test_f001（minor，AC-002 null 元素子场景缺测试）**：已消除。`tests/unit/bridge_registry_refactor.test.ts:281-299` 新增用例 `[{合法1}, null, {合法2}]`，断言 size 2、`inst_ok1`/`inst_ok2` 均恢复——null 置于数组中间，直接锁定「循环越过 null、后续合法条目恢复」。区分度已独立复验：node 模拟 pre-fix 守卫（首行 `typeof item.id`，无 null 保护）在 null 处抛 TypeError，循环中止，size=1，测试必红；当前守卫（`registry.ts:244` `item === null || typeof item !== 'object'` 首行短路）size=2 通过。非恒真、非弱化。
- **t203_test_f002（minor，字段「存在但类型错误」分支无测试）**：已消除。`tests/unit/bridge_registry_refactor.test.ts:301-316` 新增用例 `extension_version: 42` 混入合法条目，断言 size 1、`inst_ok` 恢复。`registry.ts:247` `typeof item.extension_version !== 'string'` 命中真类型错误路径（字段存在、值非 string）。删守卫则两条目全装载 size=2，测试红，区分度充分。
- 前轮无 blocker；code review `t203_code_f001`（important）对应的守卫 null 保护已落实于 `registry.ts:244`，且被 f001 用例守住。

### 本轮新发现

1 条（minor）。

### t203_test_f003 - Round 2 新增用例名内嵌 review finding ID，跨轮语义泄漏

- 严重度：minor
- 锚点：无 AC 差距；测试可维护性
- 位置：`tests/unit/bridge_registry_refactor.test.ts:282`（`it('code f001: …')`）、`:301`（`it('test f002: …')`）
- 问题：两条新增用例的 it 标题以「code f001:」「test f002:」开头，引用的是跨 review 轮的临时 finding ID。合并后这些 ID 不再有上下文载体，未来维护者读测试名无法还原其含义；行为描述部分（「null 数组元素不中止循环…」「字段类型错误…被跳过」）本身已准确完整，前缀属冗余噪音。
- 建议：去掉 finding ID 前缀，仅保留行为描述；如想追溯可把 finding ID 写进注释。

### 改测方向复核

无。diff 仅新增两个 describe 块（Round 1 t203 块 + Round 2 块）与 `src/bridge/registry.ts` 守卫（含 null 保护重排），未修改或删除任何既有测试，无「迁就实现」的改测。

### AC 复验方式

- AC-001（缺 token_hash / instance_id 空 → 跳过）：`re_verified`。用例 `:231-244`，vitest 通过；守卫 `token_hash !== null && typeof !== 'string'` 对丢键后的 undefined 拒绝。
- AC-002（混合文件合法恢复畸形跳过）：`re_verified`。`:246-262` 混合文件 size=1、合法保留；本轮新增 null 元素子场景 `:281-299` 验证循环跨 null 恢复后续合法条目。
- AC-003（全畸形不抛错、从空开始）：`re_verified`。`:264-279` size=0、`load_persisted` 不抛错（await 未 reject 用例才通过）。

coverage = 3/3

### 契约区 drift 核对

当前契约区相对 anchor 的两处变更均已核实为一致需求：`seen_at` 移出校验范围（load 时由 t201 `Date.now()` 整体覆盖，属死数据；与 Round 1 未进表提示一致）；「畸形条目(含 null 元素…)」显式化（与本次 null 保护修复对应）。测试与实现均符合当前契约区，无未经确认的 AC 变更。

### 危险模式扫描（本轮 diff）

逐条核对：无恒真/反转/注释断言、无 `.skip`/`.only`、无 eslint-disable/ts-ignore、无 mock（真临时目录 + 文件 IO 直触生产 `load_persisted`/守卫）、无阈值掩盖、无条件跳过、无 `.value=` 冒充交互。未命中任何危险模式。

### 未进表的提示

无。

### 总体判断

前轮两条 minor 均以真实行为用例补齐并锁定（区分度经 node 复验），代码 null 保护落实，无未解决 critical/important；仅 1 条 minor（测试命名）。14/17 基线用例 + 3 条新增全部通过（vitest 17/17），tsc --noEmit 干净。

reviewed_scope: c687d9f5ffec13d2
verdict: PASS

## Round 3 (2026-08-16 02:29 UTC+8)

- round：3
- reviewed_at：2026-08-16 02:29 UTC+8

### 前轮 finding 复核（以 diff 与代码为准）

- **t203_test_f003（minor，Round 2 用例名内嵌 finding ID）**：已消除。`tests/unit/bridge_registry_refactor.test.ts:282` it 标题为 `null 数组元素不中止循环,后续合法条目恢复`，`:301` 为 `字段类型错误(非 null 非 string)条目被跳过`——两处均已去掉「code f001:」「test f002:」前缀，仅保留行为描述。断言体逐条与 Round 2 报告核对一致（null 用例断言 size=2、`inst_ok1`/`inst_ok2` 恢复；类型错误用例 `extension_version: 42`、断言 size=1、`inst_ok` 恢复），行号与用例结构未变，**测试行为零变化**，纯标题噪音清理。

### 本轮新发现

0 条。

### 改测方向复核

无。本轮 diff 对测试文件仅改两处 it 标题字符串，无断言增删改、无「迁就实现」的改测；registry.ts 相对 Round 2 无新改动。

### 危险模式扫描（本轮 diff）

逐条核对：本轮测试改动仅标题字符串，无恒真/反转/注释断言、无删测试、无 `.skip`/`.only`、无 eslint-disable/ts-ignore、无 mock 误用、无阈值掩盖、无条件跳过、无 `.value=` 冒充交互。未命中任何危险模式。重跑 `npx vitest run tests/unit/bridge_registry_refactor.test.ts` 17/17 通过（与 Round 2 一致，无用例丢失或行为漂移）。

### AC 复验方式

本轮仅测试命名变更、行为未动，复用 Round 2 已复验结论（AC-001/002/003 均 `re_verified`），并重跑同一测试文件确认 17/17 全绿、无回归。契约区相对 anchor 的两处变更（seen_at 移出校验、null 元素显式化）Round 2 已核实为一致需求，本轮无新 drift。

coverage = 3/3（沿用 Round 2 复验 + 本轮重跑确认）

### 未进表的提示

无。

### 总体判断

f003（minor）已按建议落地：两处 it 标题去掉 finding ID 前缀，行为描述完整保留，测试行为未变、17/17 全绿，无新引入问题。当前无未解决 critical/important，无 minor 遗留。

reviewed_scope: f3142434bc49cd9d
verdict: PASS
