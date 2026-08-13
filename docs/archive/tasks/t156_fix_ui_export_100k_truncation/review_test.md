# Task review t156（reviewer_focus: 测试）

- task：`t156_fix_ui_export_100k_truncation`
- spec：`docs/tasks/t156_fix_ui_export_100k_truncation/spec.md`
- diff_anchor：`4f6368f8d12565cf352fd5692f4626b72f939d5b`
- target：`git diff 4f6368f8d12565cf352fd5692f4626b72f939d5b`
- round：1
- reviewed_at：2026-08-13 13:44 UTC+8

## Findings

### t156_test_f001 - fetch_all_records 缺 fetcher 失败路径测试

- 严重度：minor
- 锚点：行为缺陷——共享分页 helper 的失败语义无测试防护
- 位置：`tests/unit/paged_reader.test.ts`（`fetch_all_records` describe，共 6 个 it）
- 问题：`fetch_all_records` 是本次重构后的三路共享 helper（`exporter.ts`、`agent_data_queries.ts`、`capture_data_reader.ts` 共用），但现有测试只覆盖成功路径（多页追加、offset 序列、末批不足、空批、整数倍）。若实现改成 try/catch 吞掉 fetcher 错误或失败时返回部分结果，6 条测试全部仍绿——失败路径（fetcher reject 向上传播、无部分结果返回）无任何防护。
- 建议：补一条 fetcher 中途 reject 的 case，断言错误原样向上传播且不返回残缺数组（`await expect(fetch_all_records(bad_fetcher)).rejects.toThrow(...)`）。

### t156_test_f002 - AC-005 断言锁死返回结构，排除 AC 允许的另一条合规路径

- 严重度：minor
- 锚点：AC-005
- 位置：`tests/unit/capture_data_reader.test.ts`「AC-005: 读取路径不保留静默截断上限」it 块（`expect('truncated' in snapshot).toBe(false)`）
- 问题：AC-005 语义是「若任何读取路径保留上限，必须显式返回 `truncated` 标记或失败错误」——即允许「无上限全量」与「有上限 + 显式标记」两条合规实现。该断言把「返回结构不含 truncated 字段」写成硬约束：未来若按 AC-005 合法路径加 `truncated: false` 显式标记（实现选择变化而非行为退化），测试会误红。且该断言是「不存在性」结构断言，独立证据力弱——真实防截断证据由同文件 AC-001 的全量断言提供（代入旧固定 `limit=100000` 实现，AC-001 即红，本测试能捕获原 bug）。
- 建议：保留亦可（防未来静默截断字段混入），但应在注释或测试名中注明其依赖 AC-001 互补；更贴合 AC 语义的写法是删去该断言、仅依赖 AC-001 全量断言，或改为断言「全量返回且无 `truncated` 真值标记」。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮为第 1 轮）
- 改测方向复核：无。diff 未修改任何既有测试（`agent_data_queries.test.ts` / `exporter.test.ts` / `t144_timeline_merge_network_console.test.ts` 原样保留且全量仍绿），不存在「让断言迁就当前实现」的改测。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - AC-003 仅单测 `build_archive` 一次，未分别走 Popup ZIP / Dashboard ZIP 两条导出路径；两者共享同一 `build_archive`（`dashboard_shared.ts` 的 `export_capture` 与 popup 导出均调用），spec 测试策略明确授权「mock read_capture_snapshot 与 archive builder 单测」，不作为覆盖缺口。
  - `capture_archive_count.test.ts` AC-004 断言 `events.length === event_count + request_count` 依赖 fixture 中 `stats.event_count` 恰等于 user+nav+error+storage+cookie 之和（fixture 构造保证），断言本身验证 `merge_detail_events` 不丢不重。
  - tsconfig `exclude` 含 `tests/`，测试文件不经 tsc 类型检查，与项目既有单测惯例一致；经核对三个新测试的 mock fixture 与生产类型（`CaptureSnapshot`、`ArchiveBuildInput`、storage 函数签名）兼容，无运行时类型风险。
- 总体判断：AC-001~005 全部有对应测试且触达真实生产逻辑（mock 边界仅在 storage 与 `read_capture_snapshot`，均符合 spec 可测试性声明/测试策略），断言为数值/内容级（长度、event_id、offset 序列、manifest 计数），危险模式扫描无命中；全量 1615 单测通过。仅 2 条 minor，无未解决 critical / important。

### AC 复验方式

- AC-001：`re_verified`——独立运行 `tests/unit/capture_data_reader.test.ts` 通过；断言 `user_events.length === stats.user_action_count === 100001`，代入旧固定 100000 实现会红。
- AC-002：`re_verified`——独立运行通过；`paged_reader.test.ts` 断言 `PAGE_SIZE===5000`、offset 序列、多页追加不丢不重；`capture_data_reader.test.ts` 断言 21 次调用的 offset 序列 `[0,5000,...,100000]` 且 limit 恒 5000。
- AC-003：`re_verified`——独立运行 `tests/unit/capture_archive_count.test.ts` 通过；解包 ZIP 断言 `manifest.counts.events === 100001 > 100000`、`counts.network === 3`。
- AC-004：`re_verified`——同一文件通过；断言 `merge_detail_events` 结果长度 === event_count + request_count（100004）且 > 100000。
- AC-005：`re_verified`——断言返回结构无 `truncated` 字段 + AC-001 全量断言互补（见 f002）；当前实现走「无上限」合规路径。
- coverage = 5 / 5

- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 76670d3e5d5de296

## Round 2 (2026-08-13 13:49 UTC+8)

### 前轮 finding 复核（以修复后 diff 与当前代码为准）

- t156_test_f001（minor）：**已消除**。`tests/unit/paged_reader.test.ts` 新增 2 条失败路径测试：
  - 55-58 行「fetcher 异常原样传播，不吞错」——fetcher 直接 throw，`rejects.toThrow('storage boom')`，触达真实 `fetch_all_records`，非恒真；
  - 60-67 行「后续批次失败时已收集数据不回滚且异常向上传播」——首批满页 5000 后第二页（offset=5000）抛错，`rejects.toThrow('page 2 boom')`，覆盖中途失败场景。
  - 断言均按具体错误消息校验，无假绿。
- t156_test_f002（minor）：**已消除**。`tests/unit/capture_data_reader.test.ts` AC-005（127-131 行）删除锁返回结构形状的 `'truncated' in snapshot === false` 断言，仅保留 >100000 全量返回断言，并在注释中写明证据由 AC-001 全量断言互补。属正确方向的删断言（移除我指出的过强约束），**非**「换形式弱化」——核心全量断言仍在且触达生产逻辑。

### 复核范围

- 基于修复后工作区：`git diff 4f6368f8d12565cf352fd5692f4626b72f939d5b`（Round 1 之后 implementer 的处置改动）。
- 处置后 diff 扫描：生产代码仅 `src/extension/shared/paged_reader.ts` 新增 JSDoc 注释（7-11 行，实现体 16-25 行与 Round 1 完全一致），无行为变化；`capture_data_reader.test.ts` 132 行、`paged_reader.test.ts` 68 行，无 `.skip` / `.only` / `@ts-ignore` / eslint-disable / 恒真断言 / mock 误用等新危险模式。

### 改测方向复核

- 无。处置仅删断言（f002，方向与 Round 1 建议一致）与新增失败路径测试（f001），无「让断言迁就当前实现」的改测。

### 本轮新发现

- 0 条。
- 未进表的提示：`paged_reader.test.ts` 60-67 行测试名「已收集数据不回滚」与实际断言（仅 `rejects.toThrow`）不完全对应——`fetch_all_records` 抛错后不返回任何值，部分结果不可外部观察，测试名略夸大；断言本身有效，非实质问题。

### 总体判断

- 前轮 2 条 minor 均修复到位（以代码与运行结果核实，非采信处置表）；全量 1617 单测通过（较 Round 1 +2，恰为 f001 新增的 2 条），当前无未解决 critical / important。

### AC 复验方式（Round 2）

- 本轮生产代码无行为变化（仅 JSDoc），AC-001~005 复验结论沿用 Round 1（coverage 5/5 re_verified）；本轮独立复核了 f001/f002 涉及的两个测试文件并重跑通过。

- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 741a7d61c4e99605
