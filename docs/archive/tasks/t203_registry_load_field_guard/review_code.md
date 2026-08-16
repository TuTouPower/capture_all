# Task review t203（reviewer_focus: 代码）

- task：`t203_registry_load_field_guard`
- spec：`docs/tasks/t203_registry_load_field_guard/spec.md`
- diff_anchor：`fdfeb323e17a241d863909cdc607dc07a954b99b`
- target：`git diff fdfeb323e17a241d863909cdc607dc07a954b99b`
- round：1
- reviewed_at：2026-08-16 02:20 UTC+8

reviewed_scope: dd4fc536dccccab3

## Findings

### t203_code_f001 - is_valid_persisted_instance 对 null 数组元素抛 TypeError,后续合法条目静默丢失（部分损坏恢复缺口）

- 严重度：important
- 锚点：AC-002（"同文件含合法条目时,合法条目正常恢复,畸形条目被跳过"）+ 契约区「范围」不变量"畸形条目跳过(不装载),不影响其余合法条目与 bridge 启动"
- 位置：`src/bridge/registry.ts:243-244`（`is_valid_persisted_instance` 首行 `typeof item.id` 直接解引用）;中止点 `:64-77`（for 循环 + 外层 catch）
- 问题：`JSON.parse` 可产生 `null` 作为数组元素（外部篡改/损坏文件,而非程序自身 persist 产物）。守卫首行 `typeof item.id !== 'string'` 对 `null` 求值 `item.id` → 抛 `TypeError: Cannot read properties of null (reading 'id')`,被 `load_persisted` 外层 `catch`（:77,注释"无文件/损坏：从空开始"）吞掉,整段 for 循环中止。文件 `[{合法}, null, {合法2}]` 时 `合法2` 静默丢失。node 复现确认：`for (item of [valid, null, valid2])` 在 null 处抛 TypeError,循环不再继续。守卫只覆盖"缺字段/类型错",未覆盖"条目本身非对象(null)"。
- 建议：守卫首行加 `if (typeof item !== 'object' || item === null) return false;`;并在 t203 describe 追加一条混合文件含 `null` 元素的用例（断言 null 跳过、后续合法条目保留）以守住 AC-002。

### t203_code_f002 - 契约区要求 seen_at 为数字,守卫未校验

- 严重度：minor
- 锚点：契约区「范围」"seen_at 为数字";无 AC-001/002/003 直接观测差距
- 位置：`src/bridge/registry.ts:243-252`
- 问题：契约区明列 seen_at 须校验为数字,`is_valid_persisted_instance` 未校验。实际无功能影响：`load_persisted` 用 t201 的 `const seen_at = Date.now()`（:63）整体覆盖,持久化的 seen_at 是死数据,类型错误也不会毒化 registry。属 spec-实现不一致,按「实现合理但 spec 过时」处置。
- 建议：二选一对齐——(a) 在守卫补一行 `if (typeof item.seen_at !== 'number') return false;` 字面满足契约;(b) 改 spec 契约区「范围」删除 seen_at 一项（该字段 load 时被覆盖,校验无意义）。推荐 (b) 更贴近真实语义。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：2 条（1 important、1 minor）
- 未进表的提示：
  - 文件过大：`src/bridge/registry.ts` 252 行、`tests/unit/bridge_registry_refactor.test.ts` 279 行,均远低于阈值（400/600）,无
  - 复杂度：`is_valid_persisted_instance` 近似 McCabe ≈ 8（基数 1 + 7 个 if）,低于 10,无
  - 范围外观察：无。diff 仅触及 `src/bridge/registry.ts`、测试文件、`task.md`（front matter 状态/分支）,无与本 task 无关的模块改动
- 总体判断：字段校验主体正确、三 AC 测试全绿（vitest 15/15 通过）,但守卫对 null 数组元素抛异常致部分损坏恢复失效,违反 AC-002,须修
- 系统性 follow-up：无

### AC 复验方式

- AC-001（缺 token_hash / instance_id 空 → 跳过）：`re_verified`。跑 `npx vitest run tests/unit/bridge_registry_refactor.test.ts` 全绿;代码 trace 确认 `token_hash: undefined` 经 `JSON.stringify` 真正缺键,守卫 `item.token_hash !== null && typeof item.token_hash !== 'string'` 判 true 拒绝
- AC-002（混合文件,合法保留畸形跳过）：`re_verified`。vitest 对应用例通过;代码 trace 确认逐字段检查后 `instances.set` 仅对合法条目生效。注：AC-002 的 null 元素子场景被 f001 覆盖（本 AC 通过,但存在重要缺口）
- AC-003（全畸形不抛错,registry 从空开始）：`re_verified`。vitest 用例通过;代码 trace 确认守卫 return false 分支 + 外层 catch 兜底,异常不外逸

coverage = 3 / 3

verdict: FAIL

## Round 2 (2026-08-16 02:31 UTC+8)

reviewed_scope: c687d9f5ffec13d2

### 前轮 finding 复核（以 git diff 与代码为准，不采信处置表自述）

- **t203_code_f001（important，null 元素抛错中止循环）— 已修**。`src/bridge/registry.ts:244` 首行新增 `if (item === null || typeof item !== 'object') return false;`，在 `item.id` 解引用前过滤 null / 非对象元素。新增用例 `code f001` 以 `[{ok1}, null, {ok2}]` 写真实文件跑 `load_persisted()`，断言 `instances.size === 2` 且两合法条目 browser_label 均保留。`npx vitest run tests/unit/bridge_registry_refactor.test.ts` 17/17 全绿；`npx tsc --noEmit` 0 错误。
- **t203_code_f002（minor，spec seen_at 校验未实现）— 已修**（按 f002 建议 b 处置）。`docs/tasks/t203_registry_load_field_guard/spec.md` 契约区「范围」移除 `seen_at 为数字` 校验要求，补充说明「载入时由 t201 统一重置为启动时刻，属死数据」；实现 `registry.ts:73` 以 `Date.now()` 覆盖 seen_at，与更新后契约一致。缺 seen_at 校验无功能影响（guard 不查 seen_at，载入后该字段恒被重写）。

### 本轮新发现

- **0 条**。修复引入面扫描结论：
  - null 守卫首行置前且 `item === null` 在 `typeof` 检查前（`typeof null === 'object'` 不会漏放）；数组元素/原始值（string/number/boolean）元素均在 `item.id` 访问前被 `typeof !== 'object'` 过滤，无新增解引用崩溃路径。
  - guard 新增 `id`/`instance_id` 非空校验（`:245-246`）不构成回归——合法实例 id 恒非空（`inst_` 前缀生成），空串只会产生垃圾 Map 键。
  - 外层 catch（`:77`）吞掉「loaded 非可迭代（JSON 顶层非数组）」属既有行为，与 AC-003「全畸形文件不抛错、registry 从空开始」语义一致，非本 task 引入。
  - 修复仅触及 `registry.ts` / `spec.md` / `task.md` / 测试文件，无与本 task 无关模块改动。

### 结论

- 前轮 finding 复核：f001 已修、f002 已修（均按 diff 核实）
- 本轮新发现：0 条
- 契约区 drift 核对：范围变更（移除 seen_at 校验 + 补「含 null 元素」描述）即 Round 1 f001/f002 的处置落地，属 reviewer 建议的 spec 对齐，非未经确认的需求变更，不构成 blocking
- 未进表的提示：
  - 复杂度：`is_valid_persisted_instance`（`registry.ts:243-253`）为线性字段校验链，8 个独立 if、无嵌套无共享状态；按本 task Round 1 计数口径（仅计 if）≈9，按短路 `||`/`&&` 各计边界约 16——纯谓词校验链，控制流无纠缠，不构成 minor
  - 文件过大：`registry.ts` 253 行、测试文件 317 行，均远低于阈值（400/600），无
  - 范围外观察：无
- 总体判断：两项前轮 blocker/minor 均真修，修复未引入新问题，AC-001/002/003 及 null 元素场景测试全绿
- 系统性 follow-up：无

### AC 复验方式

- AC-001（缺 token_hash → 跳过）：`re_verified`。`JSON.stringify` 将 `token_hash: undefined` 的对象键省略，guard `item.token_hash !== null && typeof item.token_hash !== 'string'` 判 true 拒绝；vitest 对应用例 size=0 通过
- AC-002（混合文件，合法保留畸形跳过）：`re_verified`。新增 `[{ok1}, null, {ok2}]` 用例断言 null 跳过、两合法条目恢复（size=2）；原始 AC-002 用例 size=1 亦通过
- AC-003（全畸形不抛错、从空开始）：`re_verified`。`[{id:'',instance_id:'',token_hash:null},{foo:'bar'}]` 两元素均被跳过、size=0、无异常；vitest 通过

coverage = 3 / 3

verdict: PASS

## Round 3 (2026-08-16 02:29 UTC+8)

reviewed_scope: f3142434bc49cd9d

### 前轮 finding 复核（以 git diff 与代码为准，不采信处置表自述）

- **t203_code_f001（important，null 元素抛错中止循环）— 仍已修**。`src/bridge/registry.ts:244` null/非对象守卫首行短路保持原样，`:245-251` 字段链与 Round 2 复核态逐字一致。`git diff fdfeb32 -- src/` 仅 `registry.ts` +15 行，无任何源码改动。
- **t203_code_f002（minor，spec seen_at 校验）— 仍已修**。spec 契约区「范围」保持「seen_at 不校验（t201 统一重置）」对齐态，无回退。
- **t203_test_f003（test reviewer Round 2 minor，it 标题去 finding ID 前缀）— 本轮变更**。`tests/unit/bridge_registry_refactor.test.ts:282` 标题由「code f001: null 数组元素…」改为「null 数组元素不中止循环,后续合法条目恢复」，`:301` 由「test f002: 字段类型错误…」改为「字段类型错误(非 null 非 string)条目被跳过」。仅标题改名，`it` 内断言体逐字未动：null 中置混合文件断言 `size=2`、两合法条目 browser_label 保留；type 错误断言 `size=1`、合法条目保留。属测试层命名噪音消除（test reviewer 职责），非源码改动。

### 本轮新发现

- **0 条**。源码 scope 确认未变：`git diff --stat` 仅 4 文件（spec.md / task.md / registry.ts / 测试文件），`src/` 下只 registry.ts +15 行即 t203 守卫本身，无与本 task 无关模块改动。无新源码问题。独立复验 `npx vitest run tests/unit/bridge_registry_refactor.test.ts` 17/17 通过、`npx tsc --noEmit` 0 错误。

### 结论

- 前轮 finding 复核：f001 已修、f002 已修（源码未变）；t203_test_f003 由测试侧本轮闭环
- 本轮新发现：0 条
- 未进表的提示：无（registry.ts 253 行、测试文件 318 行，均远低于阈值 400/600；守卫 CC 与 Round 2 相同）
- 总体判断：源码 scope 未变，无新源码问题；测试标题改名未触及断言，无回归，AC-001/002/003 及 null/type 场景测试全绿
- 系统性 follow-up：无

### AC 复验方式

- AC-001（缺 token_hash / instance_id 空 → 跳过）：`re_verified`。用例 `:231-244`，vitest 通过；守卫 `token_hash !== null && typeof !== 'string'` 拒绝丢键 undefined
- AC-002（混合文件，合法保留畸形跳过）：`re_verified`。`:246-262` 混合文件 size=1；null 中置用例 `:282-299` 断言 size=2、后续合法条目跨 null 恢复
- AC-003（全畸形不抛错、从空开始）：`re_verified`。`:264-279` size=0、load 不抛错；vitest 通过

coverage = 3 / 3

verdict: PASS
