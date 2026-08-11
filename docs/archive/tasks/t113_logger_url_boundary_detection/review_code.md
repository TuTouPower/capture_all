# Task review t113（reviewer_focus: 代码）

- task：`t113_logger_url_boundary_detection`
- spec：`docs/tasks/t113_logger_url_boundary_detection/spec.md`
- diff_anchor：`8b794bc9c218d63936c0957506654b8a9f3f5068`
- target：`git diff 8b794bc9c218d63936c0957506654b8a9f3f5068`
- round：1
- reviewed_at：2026-08-11 12:25 UTC+8
- reviewed_scope: `71bd02274bd37989`

## Findings

### t113_code_f001 - lookbehind 实际收缩面大于 spec/d001/spike 披露范围，`=`/字母等前置的 path-query 与裸 query 敏感值明文残留

- 严重度：important
- 锚点：AC-002「/path?... 片段脱敏」承诺 + spec「依赖与约束」安全编码约定「敏感 URL query 必须脱敏」；spec 上下文区「已确认收缩面：无斜杠相对路径（`file?token=x`）退出任意文本扫描」披露与实际不符
- 位置：`src/shared/logger.ts:36`（URL_SUBSTRING_PATTERN lookbehind 白名单 `(?<=^|[\s([,<"'])` 不含 `=`）
- 问题：规则字符类 `[\s([,<"']` 不含 `=`，故 `key=value` 序列化中常见的 `path=/login?token=SECRET`、`url=?token=SECRET&k=2`、`src=?token=SECRET` 形态，其 `/path?...` 与 `?query` 片段因前置 `=` 退出任意文本扫描，敏感 query **明文残留日志**。实测（tsx 直调生产 `redact_url` + 新正则）：
  - `path=/login?token=SECRET&x=1` → 输出原样（`SECRET` 明文）
  - `url=?token=SECRET&k=2` → 输出原样
  - `src=?token=SECRET` → 输出原样
  - `state=ready?token=SECRET`（字母前置）→ 输出原样
  - 对照：换行/tab/引号/括号前置（白名单内）均正常脱敏。
  spec 上下文区（已批准决策）只披露「无斜杠相对路径（`file?token=x`）退出扫描」一个收缩形态，未披露 `=`/字母等前置的**带斜杠** path-query 同样退出；d001 结论同口径。spike 13 用例与 t113 测试均未覆盖 `=` 前置形态。实现与已批准候选规则逐字符一致（非实现偏离规则），但规则附带的额外收缩面既未验证也未披露，且真实覆盖常见诊断文本形态的脱敏能力，违反 spec「依赖与约束」的安全约定。
- 建议：将 `=` 加入 lookbehind 白名单（`(?<=^|[\s([,=<"'])`，三元反例 `cond?token=x:y` 前置为字母不受影响，无新增误匹配）并补 spike/t113 正例；或经用户明确确认该额外收缩后，修订 spec 上下文区「已确认收缩面」、`docs/findings/d001`、blueprint `docs/specs/privacy_logger_stack_redact_url.md` 三处披露口径并补测试固化行为。无论何种处置，`=` 前置形态必须补测试用例。

### t113_code_f002 - spike 证据脚本 import 路径损坏，报告声称的复现命令不可执行

- 严重度：minor
- 锚点：重点核对项 3「SPIKE 结论写入是否准确」——结论数值可独立复验，但证据文件不可复现
- 位置：`docs/spikes/s001_logger_url_boundary_heuristic/code/spike.ts:3`；`docs/findings/d001_logger_url_boundary_lookbehind.md:5`
- 问题：`import { redact_url } from '../src/shared/redaction'` 相对 `code/` 目录解析到 `docs/spikes/s001_logger_url_boundary_heuristic/src/shared/redaction`（不存在）。实测 `npx tsx docs/spikes/s001_logger_url_boundary_heuristic/code/spike.ts` 从仓库根运行报 `ERR_MODULE_NOT_FOUND`。文件头注释（第 1 行）仍写 `.scratch/t113_url_boundary_spike.ts`，为从 `.scratch/` 复制后未修正相对路径的残留。spike report「证据」节与 d001「证据」行声称的「`npx tsx code/spike.ts` 13/13 通过」在入库状态下不可复现。
- 建议：修正 import 为仓库根相对路径 `../../../src/shared/redaction`，更新头注释，重跑确认 13/13。

### t113_code_f003 - 带空格三元变体 `cond ?token=x:y` 被改写为 `cond ?token=[REDACTED]`，AC-001「同类三元形态」边界未明示

- 严重度：minor
- 锚点：AC-001「同类三元形态均不被 [REDACTED] 改写」字面承诺与实现行为差异；`\s` 在 lookbehind 白名单内属用户确认语义（空白=URL 边界），实现未偏离批准规则
- 位置：`src/shared/logger.ts:36`；测试负例仅覆盖无空格形态（`tests/unit/t113_logger_url_boundary.test.ts:17-19`）
- 问题：`cond ?token=x:y`（`?` 前一个空格、合法 JS 三元，与 `cond?token=x:y` 同类）中 `?token=x` 前置空白命中 lookbehind `\s`，被按裸 query 脱敏。实测 `branch result: cond ?token=x:y` → `branch result: cond ?token=[REDACTED]`。这是用户确认「空白前置=URL 上下文」语义的固有结果，但 AC-001 措辞「同类三元形态均不被改写」未排除该变体，测试与 spike 均未覆盖，行为预期未固化。
- 建议：补该反例测试固化行为；若该形态也应保留，则需在 AC-001 或 spec 上下文区明示边界（如「`?` 紧贴前置字符的三元形态」），由用户确认。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 本轮新发现：3 条（important 1 / minor 2）
- 未进表的提示：
  - 相邻裸 query `?a=b?token=SECRET` 第二段、双斜杠 `foo//bar?token=SECRET` 漏脱敏——与 f001 同类（非白名单字符前置退出），并入 f001 处置，不单列。
  - 绝对 URL 脱敏后 `[REDACTED]` 经 URL API 编码为 `%5BREDACTED%5D`（d001/spike 已披露，实测确认），`REDACTED` 占位子串保留，符合 AC-002「保留占位」语义。
  - AC-003 的冒号/base64/`=` padding 正例均以绝对 URL 形态覆盖；bare-query 冒号形态测试未直接覆盖，但 `redact_url` 手动分支按敏感 key 匹配后整值替换、与值内容无关，无静默 false negative 风险，不单列。
  - 文件过大/圈复杂度：无（logger.ts 188 行 < 400；本次改动无新增分支函数）。
  - 范围外观察：diff 仅触及 `src/shared/logger.ts` + 新增测试 + task 相关文档（spec/task/d001/spike），无与本 task 无关模块改动；「非范围」项（p018 嵌套 query、`redact_url` 调用契约、JS parser）均未触碰。
  - `docs/specs/privacy_logger_stack_redact_url.md` 未在 diff 中更新——属契约区「Finalization 时更新的 blueprint」，为预期，finalization 阶段执行；但 f001 建议该文件披露口径需与收缩面实测一致。
- 总体判断：AC-001~003 核心形态实现正确、测试 13/13 通过，但 lookbehind 引入的额外收缩面（`=`/字母前置）未披露未验证且覆盖常见日志形态的敏感 query 脱敏，存在未解决 important，FAIL。
- AC 复验方式：
  - AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/t113_logger_url_boundary.test.ts` 13/13 通过；实测 `cond?token=x:y`、`user?.token`、`file?token=x` 逐字保留。
  - AC-002：`re_verified` — 测试正例通过；实测绝对 URL → `%5BREDACTED%5D`、空白/括号/引号/逗号/换行前置的 `/path` 与裸 query 均脱敏（`= `前置除外，见 f001）。
  - AC-003：`re_verified` — 测试正例（合法冒号 `abc:def`、data URL/base64 `QUJDRA==`、`=` padding）通过；`redact_url` 手动分支按 key 匹配整值替换逻辑查证，值内容无关，无静默 false negative。
  - coverage = 3/3 = 100%
- 系统性 follow-up：无等价 task（t114 为 p018 嵌套 query 机制，与本 finding 不同）。f001 处置若选改规则，可建议 follow-up：`fix: logger URL 边界 `=` 前置脱敏缺口`（slug 候选 `logger_url_boundary_equals_prefix`）。

verdict: FAIL

## Round 2 (2026-08-11 12:34 UTC+8)

- round：2
reviewed_scope: 42461545c8f7f94d
（与当前 `git diff 8b794bc9c218d63936c0957506654b8a9f3f5068` 排除流程文件后重算一致，范围未漂移）

### 前轮 finding 复核（以 diff/代码/实测为准，不采信处置表）

- **f001（important）已修**。生产 `URL_SUBSTRING_PATTERN` 两分支 lookbehind 均已并入 `=`（`src/shared/logger.ts:36` `(?<=^|[=\s([,<"'])`）；实测 `path=/login?token=SECRET&k=2` → `path=/login?token=[REDACTED]&k=2`、`url=?token=SECRET&k=2` → `url=?token=[REDACTED]&k=2`、`src=?token=SECRET` → `src=?token=[REDACTED]`、`src="/login?token=SECRET"` → 脱敏。t113 测试补 3 例 `=` 前置正例，23/23 通过。f001 问题清单中的字母前置形态 `state=ready?token=SECRET` 仍明文，但该形态即已披露收缩面（`ready?token=SECRET` 属无斜杠相对路径形态，`?` 前为字母与 AC-001 要求保留的三元同界），修复方案 A（`=` 入白名单）固有残余，非未修项。
- **f002（minor）已修（import 路径）**。`docs/spikes/s001_logger_url_boundary_heuristic/code/spike.ts:3` import 修正为 `../../../../src/shared/redaction`，头注释（第 1 行）同步为仓库根相对命令；按注释命令 `npx tsx docs/spikes/s001_logger_url_boundary_heuristic/code/spike.ts` 从仓库根实测 13/13 通过。但证据链出现新不一致，见 f004。
- **f003（minor）已修（披露完整）**。spec 上下文区「已确认收缩面」明示带空格三元与独立 `?query` 同享 `\s` URL 边界语义会被脱敏（`docs/tasks/t113_logger_url_boundary_detection/spec.md` 未知契约清单节），spike report 结论节同口径披露；t113 测试固化该行为（`带空格三元（已知边界）` 用例断言脱敏）。实测 `cond ?token=x:y` → `cond ?token=[REDACTED]`，与披露一致。

### 本轮新发现

#### t113_code_f004 - spike 证据脚本与 d001 规则文本停留在无 `=` 版本，与 report/spec 声称的最终规则不一致，`=` 形态无法由入库脚本复现

- 严重度：minor
- 锚点：f002 修复完整性——脚本已可运行，但复现的是修复前规则；f001 建议「并补 spike/t113 正例」中 spike 侧未执行
- 位置：`docs/spikes/s001_logger_url_boundary_heuristic/code/spike.ts:8`；`docs/findings/d001_logger_url_boundary_lookbehind.md:4`
- 问题：spike.ts `CANDIDATE` 正则 lookbehind 仍为 `(?<=^|[\s([,<"'])`（不含 `=`），13 用例亦无任何 `=` 前置形态；而 spike report「尝试」节与 spec 上下文区声称候选规则为 `(?<=^|[=\s([,<"'])` 且「`=` 纳入边界以保证 `path=/login?token=x`、`url=?token=x` 等序列化形态脱敏」——该主张对入库脚本不成立（实测该脚本对 `path=/login?token=SECRET` 不脱敏）。d001 结论行同样写 `(?<=^|[\s([,<"'])`，与生产 `logger.ts:36` 的实际规则 `(?<=^|[=\s([,<"'])` 不符，d001 明言「后续涉及日志脱敏边界调整时复用」，文本失真会误导后续复用者。生产行为正确（t113 测试 23/23 覆盖 `=` 形态），此为本 task 证据/文档链未同步到最终规则。
- 建议：spike.ts `CANDIDATE` 并入 `=` 并补 `=` 前置正例后重跑 13+ 用例；d001 规则文本同步为 `(?<=^|[=\s([,<"'])`。

### 结论（Round 2）

- 前轮 finding 复核：f001 已修（`=` 入白名单 + 3 正例测试 + 实测脱敏）；f002 import 路径已修（13/13 可复现）；f003 披露完整（spec 上下文区 + spike report + 测试固化）。
- 本轮新发现：1 条（minor 1 / important 0）
- 未进表的提示：
  - 新正则 `(?<=^|[=\s([,<"'])` 无新引入误匹配：对抗探测 `k=cond?token=x:y`（字母在 `=` 后）保留、`k=?token=x`/`a==?token=x`（真序列化）脱敏、`x = cond ? token=x : y`（`?` 后带空格）保留、`v1.2.3?build=4`（数字前置）保留——`=` 只放行紧贴 `=` 的 `/path?...`/`?query`，未波及三元/可选链。
  - 冒号（`key:?token=x`）与反引号（`` `?token=x` ``）前置不脱敏为白名单外预存行为，非本次引入。
  - `k=/login?x=`（空值 path-query）匹配后因 key 非敏感不改写，属 `redact_url` 按敏感 key 替换的正常行为。
  - `state=ready?token=SECRET` 字母前置明文为已披露收缩残余（见 f001 复核），不单列。
  - 文件过大/圈复杂度：无（logger.ts 188 行；本次无新增分支函数）。
  - 范围外观察：diff 仍仅触及 `src/shared/logger.ts` + t113 测试 + task 相关文档（spec/spike/d001），「非范围」项未触碰；`docs/specs/privacy_logger_stack_redact_url.md` 未在 diff 更新属 finalization 预期。
- 总体判断：前轮重要 blocker（f001）已消除，剩余唯一新发现为 minor 级证据文档不一致（f004），生产行为与测试均正确，PASS。
- AC 复验方式：
  - AC-001：`re_verified` — `npx vitest run tests/unit/t113_logger_url_boundary.test.ts` 23/23；实测 `cond?token=x:y`、`user?.token`、`file?token=x` 逐字保留；`cond ?token=x:y` 按披露边界脱敏。
  - AC-002：`re_verified` — 测试正例通过；实测 `path=/login?token=SECRET&k=2`、`url=?token=SECRET&k=2`、`src=?token=SECRET`、`src="/login?token=SECRET"` 均脱敏且占位保留。
  - AC-003：`re_verified` — 测试正例（合法冒号 `abc:def`、data URL/base64 `QUJDRA==`、`=` padding）通过；`redact_url` 按 key 整值替换逻辑查证，与值内容无关。
  - coverage = 3/3 = 100%
- 系统性 follow-up：无。f004 可在本 task 内处置（spike.ts + d001 文本同步），不建新 task。

verdict: PASS

## Round 3 (2026-08-11 12:37 UTC+8)

- round：3
reviewed_scope: 42461545c8f7f94d
（与当前 `git diff 8b794bc9c218d63936c0957506654b8a9f3f5068` 排除流程文件后重算一致——重算指纹 42461545c8f7f94d，与 Round 2 相同，f004 修复的 spike.ts/d001/review_test.md 均在被排除集合内，不改变指纹）

### 前轮 finding 复核（以 diff/代码/实测为准，不采信处置表）

- **f001（important）已修，无回退**。生产 `src/shared/logger.ts:36` `URL_SUBSTRING_PATTERN` 两分支 lookbehind 仍为 `(?<=^|[=\s([,<"'])`（含 `=`），与 Round 2 核实时逐字符一致；指纹重算 42461545c8f7f94d 相同，证明生产源码与测试自 Round 2 起零改动。t113 测试 23/23 复跑通过（含 `=` 前置正例 `path=/login?token=SECRET&k=2`、`url=?token=SECRET&k=2`、`src="/login?token=SECRET"`）。字母前置形态 `state=ready?token=SECRET` 保持明文为已披露收缩残余，非未修项。
- **f002（minor）已修，无回退**。spike.ts:3 import 为 `../../../../src/shared/redaction`，按头注释命令 `npx tsx docs/spikes/s001_logger_url_boundary_heuristic/code/spike.ts` 从仓库根复跑 13/13 通过。
- **f003（minor）已修，无回退**。spec 上下文区「已确认收缩面」披露完整（无斜杠相对路径退出扫描、带空格三元与独立 `?query` 同享 `\s` 语义），spike report 结论节同口径；测试 `带空格三元（已知边界）` 用例断言脱敏，复跑通过。
- **f004（minor）已修**。`docs/spikes/s001_logger_url_boundary_heuristic/code/spike.ts:8` `CANDIDATE` 正则 lookbehind 已并入 `=`（`(?<=^|[=\s([,<"'])`），与 spike report「尝试」节、spec 上下文区、生产 `logger.ts:36` 三处口径一致；`docs/findings/d001_logger_url_boundary_lookbehind.md:4` 规则文本同步为 `(?<=^|[=\s([,<"'])` 且明示「含 `=` 前置序列化形态 `path=/login?token=x`」。实测 `=` 形态在入库脚本规则下可复现：`path=/login?token=SECRET&x=1` → `path=/login?token=[REDACTED]&x=1`、`url=?token=SECRET&k=2` → 脱敏、`src=?token=SECRET` → 脱敏；`k=cond?token=x:y`（字母前置三元）保留，无新误匹配。f004 建议中「补 `=` 前置正例进 spike 用例表」未执行——13 用例表仍无 `=` 形态；该缺口不改变结论：核心缺陷（证据脚本/规则文本与最终规则不一致、`=` 形态无法由入库脚本复现）已消除，报告主张经实测成立，用例补强属建议级覆盖增强，不单列。

### 本轮新发现

- 无（0 条）。全 diff（logger.ts 5 行 + 测试 84 行新建 + spec 上下文区披露 + task 流程文件 + spike/d001/report 同步）复读，未发现新问题；生产源码零新增改动。

### 结论（Round 3）

- 前轮 finding 复核：f001/f002/f003/f004 全部已修且无回退（以 diff、复跑与实测为准）；无未解决 critical / important，无遗留 minor。
- 本轮新发现：0 条
- 未进表的提示：
  - `check_review_status.py` 报 `review_scope=stale` 的根因在 **review_test.md**：其最后一条指纹仍为 Round 1 的 `71bd02274bd37989`（f001 修复前口径），与当前 `42461545c8f7f94d` 不符；code 报告 Round 2 指纹与当前一致，非 code 轴过期。test 轴需 test reviewer 追加一轮（或回写指纹）后整体 `overall` 才闭环——本报告只负责 code 轴。
  - 文件过大/圈复杂度：无（logger.ts 188 行 < 400；本轮无新增分支函数）。
  - 范围外观察：diff 仍仅触及 `src/shared/logger.ts` + t113 测试 + task 相关文档，「非范围」项（p018 嵌套 query、`redact_url` 调用契约、JS parser）未触碰；`docs/specs/privacy_logger_stack_redact_url.md` 未在 diff 更新属 finalization 预期。
- 总体判断：f004 修复准确无误，证据链（spike 脚本 / d001 / report / spec 上下文区）与生产规则口径完全一致；生产代码与 Round 2 逐字符一致、无新增改动；测试 23/23、spike 13/13 复跑通过，无新问题，PASS。
- AC 复验方式：
  - AC-001：`re_verified` — 复跑 `npx vitest run tests/unit/t113_logger_url_boundary.test.ts` 23/23；负例逐字保留断言（字符串 `toBe` / 对象 `toEqual` / Error 实例 message+stack）复跑通过。
  - AC-002：`re_verified` — 正例（绝对 URL、独立 `?query`、`/path?...`、行首、括号/引号/方括号/尖括号前置、`=` 前置）复跑通过，敏感值消失且 `[REDACTED]` 占位保留。
  - AC-003：`re_verified` — 合法冒号 `abc:def`、data URL/base64 `QUJDRA==`、`=` padding 正例复跑通过；`redact_url` 按敏感 key 整值替换逻辑查证，与值内容无关。
  - coverage = 3/3 = 100%
- 系统性 follow-up：无。test 轴指纹回写属本 task 内 test review 收尾，不建新 task。

verdict: PASS
