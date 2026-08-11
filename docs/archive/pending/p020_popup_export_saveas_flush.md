# p020 导出 save_as 未覆盖 Popup、日志与 picker 分支

- 来源：t107 范围外观察（`review_code.md` 结论节）；2026-08-11 选择 A 后重新完整分析。
- 类型：bug（产品缺陷：全局导出配置消费不完整）。
- 现象：
    - 期望：设置页全局开关「每次询问保存位置」应控制所有浏览器 UI 导出入口；`export_save_as=true` 强制询问，`false` 不强制询问。当前生效 `user_config` spec 将其定义为持久化全局字段，`dashboard_export_flush_save_as` spec 定义显式 `save_as` 优先于目录兜底，且 `export_utils.ts` 声明 Popup、Dashboard capture、Dashboard log 共用下载入口。
    - 实际一：Popup ZIP 导出调用 `download_blob(blob, filename, 'capture_export')`，未传已加载的 `user_config.export_save_as`。配置了导出目录且开关为 true 时，helper 按目录兜底为 `saveAs:false`，不会询问保存位置。
    - 实际二：Dashboard 运行日志导出同样只传 3 个参数。配置了日志目录且开关为 true 时，同样静默保存。
    - 实际三：Dashboard capture 两条路径虽传入第 4 参数，但 `download_blob` 在文件名无目录且 `showSaveFilePicker` 可用时，不判断 `save_as=false` 就直接打开 picker；关闭开关仍会询问保存位置。该 helper 分支也影响补齐参数后的 Popup 与日志导出。
    - 原候选中的「Popup 导出前不 flush」不成立：Popup 在 `read_capture_snapshot` 前先发送 `get_capture_data`；SW `get_capture_data()` 成功路径在返回前 `await flush_all()`，缓冲数据已落盘。此部分不是产品缺陷，不进入修复范围。
- 复现：
    1. 运行 `npx vitest run .scratch/p020_popup_export_saveas_flush_repro.test.ts`。
    2. 用例验证：Popup 当前 3 参数等价调用在「配置目录 + `export_save_as=true`」时产生 `saveAs:false`，显式传 true 后为 `saveAs:true`。
    3. 用例验证：显式传 `export_save_as=false` 且文件名无目录、picker 可用时，当前实现仍调用 picker，未调用 downloads API。
    4. 用例同时核对 Popup 与日志导出缺第 4 参数、Dashboard capture 两处已传参数，以及 Popup → `get_capture_data` → `flush_all` 顺序。
    5. 结果：4 个复现/核实用例全部通过。
- 影响：
    - 设置开关在不同导出入口、目录配置和浏览器 picker 能力组合下表现不一致，用户无法可靠控制是否弹出保存位置选择。
    - 已确认受影响入口：Popup ZIP；Dashboard 运行日志；Dashboard capture archive；Dashboard capture JSON/JSONL/HTML/HAR。后两类问题来自共享 helper 的 false/no-directory picker 分支。
    - 数据完整性不受本条影响；Popup flush 已存在。
- 根因：
    - 共享配置存在，但消费契约分散在调用点可选参数与 helper 内部目录分支。TypeScript 允许省略 `save_as?: boolean`，遗漏时静默回退到 `!has_dir`；helper 又只以 `!has_dir` 决定是否打开 picker，没有把显式 false 纳入分支条件。
    - 分类：产品缺陷，不是环境或配置问题。
    - 已确认缺陷位点：
        1. `src/extension/popup/popup.ts:296`：Popup capture 导出漏传 `user_config.export_save_as`。
        2. `src/extension/dashboard/dashboard_settings.ts:245`：日志导出漏传 `get_user_config().export_save_as`。
        3. `src/extension/shared/export_utils.ts:74-75`：picker 分支忽略显式 `save_as=false`。
    - 已扫描同类导出路径。检索轴：全仓 `download_blob(` 调用、`chrome.downloads.download`、`showSaveFilePicker`、`URL.createObjectURL`、`export_save_as` 读写及 Popup/Dashboard 对称入口。浏览器 UI 下载只经上述共享 helper；`dashboard_shared.ts:267,282` 两处已传参数但受 helper 分支影响。SW `export_json/jsonl/html/har` 只返回内容且均先 flush，不负责浏览器保存位置；Bridge 文件导出使用服务端 `output_path`，不消费该 UI 开关，排除。无其他待确认位点。
- 测试缺口：
    - `tests/unit/popup_export.test.ts:42-44` 以源码正则明确断言 Popup 不出现 `save_as`，把旧行为固化为正确结果；未点击按钮、未校验配置值向 `download_blob` 的第 4 参数传播。
    - `tests/unit/dashboard_export_flush_saveas.test.ts` 直接调用 helper 验证 downloads fallback 的 true/false 参数，不覆盖 Popup、Dashboard capture、日志调用点，也不提供 picker，因此无法发现 false 仍打开 picker。
    - `tests/unit/export_utils.test.ts` 的 picker 用例均省略显式 `save_as`，只验证目录启发式；缺少 `save_as × has_dir × picker availability` 判别矩阵。
    - `tests/unit/entry_unification.test.ts` 只检查源码包含 `download_blob`，且未纳入日志入口；不能发现可选参数漏传。
    - `tests/e2e/e2e-export.spec.ts` 只测 Dashboard capture 默认 true，并主动删除 picker；`tests/e2e/e2e-logging.spec.ts` 同样删除 picker，且不切换开关、不记录 `saveAs`；无 Popup 导出下载参数 E2E。相关 4 个单测文件当前共 36 个用例全部通过，属于覆盖假绿。
    - 补测方向：
        1. helper 单测覆盖 `save_as=true/false/undefined × 有/无目录 × picker 有/无`，分别断言 picker 是否调用及 downloads `saveAs`。
        2. Popup 行为测试加载 true/false 配置、触发完成态导出，断言 `download_blob` 第 4 参数，并保留 `get_capture_data` 先于 snapshot 的 flush 链路保护。
        3. Dashboard capture archive 与非 archive 行为测试断言配置值传入 helper；可与 p021 的 Dashboard 导出接线补测合并，避免重复。
        4. Dashboard 日志按钮行为测试断言 `get_user_config().export_save_as` 传入 helper。
        5. 至少一条浏览器级判别场景切换开关后验证「不询问」与「询问」差异；若 picker 自动化不稳定，保留调用点行为测试作为主门禁。
- 线索：`.scratch/p020_popup_export_saveas_flush_repro.test.ts`。
- 处理：t115
