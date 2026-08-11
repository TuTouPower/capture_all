# Spec — Dashboard 导出 flush 与 saveAs

Dashboard 导出前 flush storage 缓冲，避免丢最近事件；`export_save_as` 控制下载是否强制「另存为」。

## 语义

- SW `export_json/jsonl/html/har` handler 在导出前 `await flush_all()` 落盘缓冲事件。
- Dashboard archive（zip）导出前经 `{action:'flush'}` 消息 flush；flush 失败（`success` false）则中止导出并 alert，不静默旧快照冒充完整。
- `download_blob` 接受 `save_as` 参数：显式传入时优先于「filename 含 '/' 静默存目录」语义（`export_save_as=true` 强制另存为）；缺省时按 has_dir 兜底。
- `export_save_as` 为 true 时走 showSaveFilePicker 或 downloads.saveAs:true。

## 相关实现

- `src/extension/background/service_worker.ts`：export handler flush + 'flush' action
- `src/extension/dashboard/dashboard_shared.ts`：archive flush + save_as 传参
- `src/extension/shared/export_utils.ts`：download_blob save_as
- `tests/unit/dashboard_export_flush_saveas.test.ts`：flush/saveAs 测试
