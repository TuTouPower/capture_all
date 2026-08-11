# Spec — network_hook 配置门控

content 侧 `network_hook` / `websocket_capture` 依据 `CaptureConfig` 门控安装。

## 门控语义

- `capture_network === false`：不安装 page network/ws hook，且显式 `stop_*` 防先前注入的 hook 继续转发。
- `capture_network === true`：安装 hook。
- `capture_response_body === false`：注入脚本 `CAPTURE_BODY=false`，fetch/XHR 分支跳过 response body 采集，`response_body_status='not_enabled'`（仅传网络元数据）。
- SW 侧 `capture_network` / `capture_response_body` 双门控已有（`service_worker.ts` 444/485 行），content 门控与之对齐。

## 相关实现

- `src/extension/content/content_script.ts`：`start_capture` 门控
- `src/extension/content/network_hook.ts`：`build_page_script(capture_response_body)` / `start_network_hook(..., capture_response_body)`
- `tests/unit/network_hook_config_gate.test.ts`：静态门控断言
- `tests/unit/network_hook_gate_behavior.test.ts`：行为门控与 body 语义测试
