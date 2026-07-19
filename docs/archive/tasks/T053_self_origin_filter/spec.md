# Task spec + log - T053 self_origin_filter

## 背景

`cdp_handler.ts:705-716` 与 `webrequest_handler.ts:36-38,325-335` is_self_origin_url 把所有 127.0.0.1/localhost 视为自身流量，不区分端口。本地开发应用（localhost:3000 等）的请求被静默排除。

## 范围

- cdp_handler 新增模块级 `_self_origin_excludes` + set_self_origin_excludes。
- is_self_origin_url 改为仅排除配置 origin（精确匹配）+ chrome-extension://。
- webrequest_handler 复用 cdp_handler.is_self_origin_url，避免分叉。
- service_worker onInstalled 调 set_self_origin_excludes([agent_bridge_url])。

## 验收

- [x] 配置 Bridge origin 的请求被排除。
- [x] localhost 其他端口不被排除。
- [x] chrome-extension:// 仍排除。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施 + 测试更新。
