# Task review t107（reviewer_focus: 测试）

- task：`t107_dashboard_export_flush_save_as`
- spec：`docs/tasks/t107_dashboard_export_flush_save_as/spec.md`
- diff_anchor：`85dd337d688a1a32f36d7e3120686cfa288d1cf6`
- target：`git diff 85dd337d688a1a32f36d7e3120686cfa288d1cf6`
- round：1
- reviewed_at：2026-08-11 07:40 UTC+8

## Findings

### t107_test_f001 - AC-001 只测 SW export_json 单路径，P1-10 根因场景（dashboard ZIP 导出）未覆盖

- 严重度：minor
- 锚点：AC-001
- 位置：`tests/unit/dashboard_export_flush_saveas.test.ts:91-96`
- 问题：AC-001 测试仅覆盖 SW `export_json` action 路径（`service_worker.ts:230` 的 `await flush_all()`）。P1-10 报告根因是 Dashboard ZIP（archive）导出丢缓冲数据，其修复路径是 `dashboard_shared.ts:242` 经 `chrome.runtime.sendMessage({ action: 'flush' })` + `read_capture_snapshot`，该路径与 SW 新增的 `'flush'` action handler（`service_worker.ts:241-243`）、以及 `export_jsonl/html/har` 的 flush 接线均无测试。真实生产代码可触达、断言有效，但被报告的场景未验证。
- 建议：补 `'flush'` action 单测（SW 侧 flush_all 被调用）；若需覆盖 archive 路径，对 `export_capture(id,'archive')` 断言先发 `{action:'flush'}` 再读 snapshot（mock `chrome.runtime.sendMessage` / `read_capture_snapshot`）。

### t107_test_f002 - AC-001 未断言 flush 先于 export 的顺序

- 严重度：minor
- 锚点：AC-001（"导出触发前调用 flush"）
- 位置：`tests/unit/dashboard_export_flush_saveas.test.ts:94-95`
- 问题：测试仅断言 `flush_all` 与 `export_json` 均被调用，未断言调用顺序。若实现改为 `export_json` 先于 `flush_all`（`service_worker.ts:230-231` 内对调），AC-001 语义破坏（导出不含 flush 前缓冲事件）但测试仍绿。当前代码结构 `await flush_all(); ... await export_json()` 保证顺序，属断言强度不足。
- 建议：用 `flush_all.mock.invocationCallOrder[0] < export_json.mock.invocationCallOrder[0]` 或断言 export 前 flush 已完成。

### t107_test_f003 - AC-002/003 只测 download_blob 透传，dashboard 接线（export_save_as → 4th 参数）未测

- 严重度：minor
- 锚点：AC-002 / AC-003
- 位置：`tests/unit/dashboard_export_flush_saveas.test.ts:98-111`；未覆盖 `dashboard_shared.ts:266,281`
- 问题：AC-002/003 测试直接调用 `download_blob(blob, 'cap.json', 'capture_export', true/false)`，验证的是 export_utils 的 4th 参数透传。真正让配置生效的接线——`dashboard_shared.ts:266/281` 读取 `get_user_config().export_save_as` 并传入 download_blob——无测试。回归场景：若接线被移除（download_blob 恢复 3 参数调用），`export_save_as=false` 且无目录文件名时 `saveAs` 落回 `!has_dir`=true，AC-003 被违反，而本测试仍绿。spec 测试策略"对 download API 参数断言"已获满足，此 gap 属接线覆盖扩展。
- 建议：对 `export_capture` 断言 `download_blob` 收到的 4th 参数来自 `get_user_config().export_save_as`（mock `download_blob` / config）。

### t107_test_f004 - AC-002 用例无法区分新旧行为

- 严重度：minor
- 锚点：AC-002
- 位置：`tests/unit/dashboard_export_flush_saveas.test.ts:98-104`
- 问题：AC-002 用无子目录文件名 `'cap.json'`，该场景旧行为（`saveAs: !has_dir`）本就是 `saveAs: true`，测试通过不代表新逻辑生效。AC-002 有意义的判别场景是含 `export_capture_directory` 的目录文件名（旧行为 `saveAs:false` 静默存目录，新行为 `saveAs:true` 强制另存为）。
- 建议：补目录文件名 + `save_as=true` 用例断言 `saveAs: true`。

## 结论

- 前轮 finding 复核：首轮，无
- 改测方向复核：无。diff 未修改任何既有测试，仅新增 `tests/unit/dashboard_export_flush_saveas.test.ts`；无"迁就实现"的改测。
- 本轮新发现：4 条（均 minor）
- 未进表的提示：
  - `src/extension/popup/popup.ts:296` 的 `download_blob(blob, filename, 'capture_export')` 未传 `export_save_as`，popup 导出不读该配置；`popup_export.test.ts:42-44`（P0.61）断言 popup 不传 save_as。若 AC 意图覆盖所有下载触发点，此为实施范围缺口（属 code reviewer 职责），建议确认 popup 是否也应生效。
  - 既有 `tests/unit/export_utils.test.ts`（P0.61）的 dir/no-dir 自动 saveAs 用例在 `save_as ?? !has_dir` 下仍通过（未传 4th 参数时行为不变），已实测无回归。
- 总体判断：测试真实触达生产逻辑（SW onMessage → handle_message flush 接线、download_blob 参数透传），断言强度合格，无恒真/弱化/跳过/mock 误用等危险模式；4 条 minor 为覆盖扩展与断言加强建议，不阻断。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified`——重跑 `npx vitest run tests/unit/dashboard_export_flush_saveas.test.ts` 通过；断言 `flush_all` 在 `export_json` 消息处理中被调用（`service_worker.ts:230` 接线属实）。
- AC-002：`re_verified`——`download_blob(..., true)` 断言 `download({ saveAs: true })`，与 `export_utils.ts:97` `saveAs: save_as ?? !has_dir` 一致。
- AC-003：`re_verified`——`download_blob(..., false)` 断言 `saveAs: false`；已确认与旧行为（无目录文件名 saveAs 为 true）存在差异，测试可判别。
- 注：dashboard 接线（`dashboard_shared.ts` 读取 `export_save_as` 传入 4th 参数、archive 路径 flush）未独立复验，属 f001/f003 覆盖 gap，但已通过读码确认实现正确。

coverage = 3 / 3

reviewed_scope: 4d46cfe6d8576514

verdict: PASS

## Round 2 (2026-08-11 07:47 UTC+8)

reviewed_scope: db17c9b56bd2c535

### 前轮 finding 复核

- t107_test_f001（minor）— 仍存在。AC-001 测试仍只覆盖 SW `export_json` 单路径（dashboard_export_flush_saveas.test.ts:92-96）；`'flush'` action、dashboard archive 路径、export_jsonl/html/har 接线均无测试。各路径为同型接线（service_worker.ts:230-240 一并添加），代表性成立，维持 minor。
- t107_test_f002（minor）— 仍存在。未断言 flush 先于 export 顺序；当前 `await flush_all(); ... await export_json()` 结构保证顺序（service_worker.ts:230-231），断言强度可加强，维持 minor。
- t107_test_f003（minor）— 仍存在。dashboard 接线（export_save_as → download_blob 4th 参数，dashboard_shared.ts:267,282）无测试；AC-002/003 测试直接调用 download_blob 验证透传。维持 minor。
- t107_test_f004（minor）— 已消除。export_utils.test.ts:69-77 新增 has_dir + save_as=true 判别用例（`captures/foo.zip → saveAs:true`），旧行为该场景为 saveAs:false，可判别新旧行为。dashboard_export_flush_saveas.test.ts AC-002 仍用无目录文件名 `'cap.json'`（该场景旧行为也是 saveAs:true），但判别场景已在 export_utils 层补齐。

### 改测方向复核

无。既有测试仅注释更新（export_utils.test.ts:34-37）与新增组合用例（export_utils.test.ts:69-77），无「迁就实现」的断言改动；新增用例断言新语义（has_dir + save_as=true → saveAs:true），符合 TDD 方向。

### 本轮新发现

无新 finding。新增组合用例无危险模式（精确 toHaveBeenCalledWith 断言，无弱化/跳过/mock 误用）。

### 未进表的提示

- f001 代码修复（archive flush 失败 alert+return，dashboard_shared.ts:242-243）无直接测试：'flush' action 成功路径、flush 失败 abort 路径均未覆盖。属 AC-001 覆盖扩展，归入 t107_test_f001 范围，维持 minor。
- 可选扩展：has_dir + save_as=false 组合未显式断言（`false ?? ...` 恒 false，由 AC-003 无目录 false 用例隐含），非阻断。

### AC 复验披露

- AC-001：re_verified——重跑 `npx vitest run tests/unit/dashboard_export_flush_saveas.test.ts` 通过；断言 flush_all 在 export_json 消息处理中被调用（service_worker.ts:230 接线属实）。archive 路径 flush 经读码核实（dashboard_shared.ts:242-243）。
- AC-002：re_verified——`download_blob(..., true)` 断言 `saveAs: true`（dashboard_export_flush_saveas.test.ts:98-104）+ 组合用例（export_utils.test.ts:69-77），与 export_utils.ts:98 一致。
- AC-003：re_verified——`download_blob(..., false)` 断言 `saveAs: false`（dashboard_export_flush_saveas.test.ts:106-111），与旧行为（无目录 saveAs:true）可判别。
- 注：dashboard 接线（dashboard_shared.ts:267,282 读 export_save_as 传 4th 参数）未独立复验，属 f003 覆盖 gap，已通过读码确认正确。

coverage = 3 / 3

- 总体判断：全量 1229 测试通过；Round 1 四条 minor 中 f004 已消、f001-f003 仍在但均 minor，无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS
