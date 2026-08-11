# Spec — Dashboard 导出 flush 与 saveAs

Dashboard 导出前 flush storage 缓冲，避免丢最近事件；`export_save_as` 控制下载是否强制「另存为」。

## 语义

- SW `export_json/jsonl/html/har` handler 在导出前 `await flush_all()` 落盘缓冲事件；flush 失败经 handle_message catch 返回 `success:false`。
- Dashboard archive（zip）导出前经 `{action:'flush'}` 消息 flush；flush 失败（`success` false）则中止导出并 alert，不静默旧快照冒充完整。
- Dashboard 非 archive（json/jsonl/html/har）导出经 SW export 命令（内含 flush），调用方检查 `r.success`，失败中止。
- `download_blob` 接受 `save_as` 参数：显式传入时优先于「filename 含 '/' 静默存目录」语义（`export_save_as=true` 强制另存为）；缺省时按 has_dir 兜底。
- 浏览器 UI 全部导出入口（Popup ZIP / Dashboard capture / Dashboard 日志）统一消费 `export_save_as`：`true` 询问保存位置，`false` 不强制询问（t115，2026-08-11）。
- 共享 helper 判别：无目录且 picker 可用时，`save_as !== false` 走 picker（`true`/`undefined` 均询问）；`save_as=false` 走 downloads API 静默保存（t115，2026-08-11）。

## 相关实现

- `src/extension/background/service_worker.ts`：export handler flush + 'flush' action
- `src/extension/dashboard/dashboard_shared.ts`：archive flush + save_as 传参
- `src/extension/dashboard/dashboard_settings.ts`：日志导出 save_as 传参
- `src/extension/popup/popup.ts`：ZIP 导出 save_as 传参
- `src/extension/shared/export_utils.ts`：download_blob save_as
- `tests/unit/dashboard_export_flush_saveas.test.ts`：flush/saveAs 测试
- `tests/unit/t115_export_save_as_consistency.test.ts`：判别矩阵 + 全入口接线锚定
