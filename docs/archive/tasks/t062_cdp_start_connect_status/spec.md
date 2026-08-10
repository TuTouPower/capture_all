# Task spec + log - T062 cdp_start_connect_status

## 背景

`src/bridge/cdp_handler.ts:131-140` 创建 WebSocket 后立即写 session 并返回 ok:true，未等 open/未设连接超时。ws error/close 只设 cdp_ws=null，调用方仍认为启动成功。

## 范围

- CdpSession 加 connect_error 字段；ws.onerror/onclose 时设 connect_error。
- handle_cdp_start 仍立即返回（await open 在测试环境难实现），但调用方可通过 session.connect_error 判断连接问题。

## 验收

- [x] ws.onerror/onclose 时 session.connect_error 被设。
- [x] npm test 全绿。

## 决策

- 未实现 await open（测试环境 fake/real timers 兼容性复杂）；改为 connect_error 标记，调用方可检查。
- 后续可通过 handle_cdp_events 返回 connect_error 字段让扩展感知。
