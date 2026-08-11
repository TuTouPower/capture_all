# Task review t107（reviewer_focus: 代码）

- task：`t107_dashboard_export_flush_save_as`
- spec：`docs/tasks/t107_dashboard_export_flush_save_as/spec.md`
- diff_anchor：`85dd337d688a1a32f36d7e3120686cfa288d1cf6`
- target：`git diff 85dd337d688a1a32f36d7e3120686cfa288d1cf6`
- round：1
- reviewed_at：2026-08-11 07:40 UTC+8

reviewed_scope: 4d46cfe6d8576514

## Findings

### t107_code_f001 - archive 导出路径静默吞掉 flush 失败

- 严重度：important
- 锚点：行为缺陷 + 违反上下文区风险决策「flush 失败时导出应失败或明确部分导出，不可静默旧快照冒充完整」
- 位置：`src/extension/dashboard/dashboard_shared.ts:242`
- 问题：archive 路径 `await chrome.runtime.sendMessage({ action: 'flush' })` 不检查返回的 `.success`。SW 侧 `flush_all()` 抛错时，`handle_message` 的 onMessage catch 会 `sendResponse({ success: false, error })`（service_worker.ts:195-198），`sendMessage` 以该对象 resolve（不 reject），dashboard 忽略后继续 `read_capture_snapshot` 并用旧快照导出完整 archive，无任何用户提示。场景：IndexedDB 事务失败（storage.ts:384/389 flush_store reject）→ 缓冲事件未落盘 → 导出的 archive 缺最近数据但表现为完整、无错误。对照非 archive 路径已正确处理：`if (!r?.success) { alert('导出失败'); return; }`（dashboard_shared.ts:271），archive 分支不一致。
- 建议：flush 后检查响应，`const r = await chrome.runtime.sendMessage({ action: 'flush' }); if (!r?.success) { alert('导出失败'); return; }`。

### t107_code_f002 - `saveAs: save_as ?? !has_dir` 与 P0.61/P0.62 文档契约漂移

- 严重度：minor
- 锚点：无对应 AC 违反，属行为变更 + 文档/注释陈旧
- 位置：`src/extension/shared/export_utils.ts:97`、`src/extension/dashboard/dashboard_shared.ts:266,281`
- 问题：`save_as ?? !has_dir` 使「filename 含 '/' → 静默存入配置目录」不再成立。dashboard 恒传 `get_user_config().export_save_as`，该字段经 sanitize 合并 DEFAULT_USER_CONFIG 恒为 boolean 且默认 `true`（constants.ts:62、user_config.ts:381-386），因此 `has_dir` 分支的 `??` 兜底永远不被触发：配置了 `export_capture_directory` 的用户，capture 导出由「静默存目录」变为「强制 saveAs 弹框」（默认配置即触发）。该变更方向与 task 意图（export_save_as 生效）一致，实现符合 AC-002；但 export_utils.ts 头部注释（11-13 行「filename 含 '/' → 直接静默存到该相对目录」）与 export_utils.test.ts P0.61 注释（34-36 行「opts.save_as 不再参与」）已失实，spec 亦未明确 has_dir 与 export_save_as 的优先级。P0.61 单元测试（38-66 行）均不传 save_as，未触达新参数，故该契约漂移在单测层不可见。
- 建议：补文档明确「save_as 显式传入时优先于 has_dir 静默语义」；同步 export_utils.ts 头部注释与 P0.61 测试注释；可选为 save_as 参数补一个 has_dir 组合用例。

## 结论

- 本轮新发现：2 条（f001 important、f002 minor）
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 1152 行，≥800 阈值，本 task 净增约 8 行（flush 调用 + 'flush' case），未导致可观测缺陷，按降级规则仅列于此。
  - 复杂度：无新增高复杂度函数；`saveAs: save_as ?? !has_dir` 为简单表达式。
  - 范围外观察：无。diff 仅触及 service_worker.ts / dashboard_shared.ts / export_utils.ts / 新测试文件 / task.md，均在 task 范围内，无偏航。

### AC 复验方式

- AC-001：re_verified。代码确认 SW export_json/jsonl/html/har 处理在导出前 `await flush_all()`（service_worker.ts:230-240）；archive 路径经 `{action:'flush'}` 消息在 `read_capture_snapshot` 前等待 flush 完成（dashboard_shared.ts:242-243）。新测试 mock flush_all 并断言 export_json 请求触发调用（dashboard_export_flush_saveas.test.ts:92-96）。说明：测试断言的是「flush 被调用」，未直接 mock buffer 验证「缓冲事件进入导出内容」；该链路靠代码推理成立（flush 持久化 buffer → 导出读 IndexedDB）。
- AC-002：re_verified。`saveAs: save_as ?? !has_dir`，save_as=true 时强制 true（export_utils.ts:97）；测试传 true 断言 `downloads.download` 收到 `saveAs: true`（dashboard_export_flush_saveas.test.ts:98-104），已随 `npx vitest run` 通过。
- AC-003：re_verified。save_as=false 时 `false ?? ...` 取 false 不强制 true；测试传 false 断言 `saveAs: false`（dashboard_export_flush_saveas.test.ts:106-111），已通过。

coverage = 3 / 3

- 总体判断：实现覆盖 AC-001/002/003，测试通过、范围无偏航；但 archive 导出路径未处理 flush 失败，违反上下文区风险决策且造成「静默旧快照冒充完整」可观测缺陷，属未解决 important。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-11 07:47 UTC+8)

reviewed_scope: db17c9b56bd2c535

### 前轮 finding 复核

- t107_code_f001（important）— 已消除。`dashboard_shared.ts:242-243` 现为 `const flush_res = await chrome.runtime.sendMessage({ action: 'flush' }); if (!flush_res?.success) { alert('导出失败：无法落盘缓冲数据'); return; }`。SW `case 'flush'`（service_worker.ts:241-243）`await flush_all(); return { success: true }`；flush 抛错时 onMessage catch（service_worker.ts:195-198）`sendResponse({ success: false, error })`，dashboard 的 `!flush_res?.success` 判定触发 alert 并 return，不再读旧快照导出完整 archive。风险决策「不可静默旧快照冒充完整」满足。残留说明：`sendMessage` 若 reject（如无 listener），走外层 catch（dashboard_shared.ts:283）仅 logger 记录、无 alert——但导出同样中止、不产出旧快照，属既有 best-effort 模式，非本 task 引入，不阻断。
- t107_code_f002（minor）— 已消除。export_utils.ts:12,14 头部注释更新为「filename 含 '/'…且未显式传 save_as → 静默」+「T107: save_as 显式传入时优先于 has_dir 静默语义」；export_utils.test.ts:34-37 P0.61 注释同步；新增组合用例（export_utils.test.ts:69-77）`captures/foo.zip + save_as=true → saveAs:true`，覆盖 has_dir 判别场景（旧行为该场景 saveAs:false）。

### 本轮新发现

无新 finding。

### 未进表的提示

- 文件过大：service_worker.ts 1152 行（≥800 阈值），本 task 净增约 8 行（flush 接线 + 'flush' case），未导致可观测缺陷，按降级规则仅列于此（Round 1 已列，仍成立）。
- 复杂度：无新增高复杂度函数。
- 范围外观察：popup.ts:296 导出仍以 3 参数调用 download_blob（不传 export_save_as），且 popup 本地 archive 构建（popup.ts:271-296）不先 flush。spec 范围语句「导出…前 flush」「export_save_as 为 true 时下载走另存为」字面可涵盖 popup，但 task 标题与 P1-10 根因均聚焦 Dashboard，Round 1 已判范围外观察。建议收尾前人工确认 popup 是否也应生效；若需，作 follow-up（建议 slug：popup_export_flush_save_as）。

### AC 复验方式

- AC-001：re_verified。SW 四类导出在 export 前 `await flush_all()`（service_worker.ts:230-240）；dashboard archive 路径经 `{action:'flush'}` 且检查 `flush_res?.success` 后才 `read_capture_snapshot`（dashboard_shared.ts:242-244）。测试 mock flush_all 断言 export_json 请求触发调用（dashboard_export_flush_saveas.test.ts:92-96），已随 `npx vitest run` 通过。flush 持久化 buffer（storage.ts:394-404，flush_store put 后 resolve）→ 导出读 IndexedDB，链路成立。
- AC-002：re_verified。`saveAs: save_as ?? !has_dir`（export_utils.ts:98），save_as=true 强制 true；dashboard 两处传入 `get_user_config().export_save_as`（dashboard_shared.ts:267,282）。测试传 true 断言 `saveAs: true`（dashboard_export_flush_saveas.test.ts:98-104），组合用例断言 has_dir+true → true（export_utils.test.ts:69-77），均通过。
- AC-003：re_verified。save_as=false 时 `false ?? ...` 取 false；测试传 false 断言 `saveAs: false`（dashboard_export_flush_saveas.test.ts:106-111），通过。

coverage = 3 / 3

- 总体判断：f001（important）与 f002（minor）均按建议修复并经 diff 核实；全量 1229 测试与 tsc 通过，无未解决 critical / important。
- 系统性 follow-up：无（popup 范围确认见上，建议人工决策）。

verdict: PASS
