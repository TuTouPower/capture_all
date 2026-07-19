# Task log - T033 sw_listener_generation

## 进展

- 2026-07-19：`src/extension/background/service_worker.ts` onActivated listener 加入 generation 校验：
  - 入口捕获 `const gen = capture_state.current_generation()` 与 `cap_id`/`cap_start`/`cap_config` 局部拷贝。
  - 关键 await 后调 `if (!capture_state.is_active_generation(gen)) return;`：chrome.tabs.get、write_events、tabs_send_message_retry、start_console_capture、start_body_capture。
  - 事件构造使用捕获的局部值，避免读取已被新采集覆盖的全局变量。

## 关键验证

- 全量：`npm test` 102 文件 / 1136 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 本 task 聚焦 onActivated（最复杂、最多 await）。其他 listener（onUpdated/onRemoved/onCreated）按同模式增量改后续进行。
- 局部拷贝 cap_id/cap_start/cap_config 保证事件构造的一致性，即使全局变量被新采集覆盖。

## 验收

- [x] onActivated await 后 generation 失效时 return。
- [x] 事件构造用局部拷贝避免跨 generation 写入。
- [x] npm test 全绿。
