# Task spec + log - T052 external_bridge_url_allowlist

## 背景

`external_cdp_bridge_client.ts:6-10,39-54,73-100,112-147` 直接拼接 `config.bridge_url`，未验证 scheme/hostname/port/path。配置被误设/篡改时 Bridge token、tab URL、CDP 控制请求可能发送到远端服务。

## 范围

- 新增 `is_allowed_bridge_url`：仅 http(s)://127.0.0.1 / localhost / [::1]；拒绝 credentials/fragment/非根 path。
- 新增 `validate_bridge_url`：无效时抛错；返回 origin（去 path/query/hash）。
- detect/start/poll/stop 函数入口调 validate_bridge_url。

## 验收

- [x] Bridge URL 仅允许本机。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。
