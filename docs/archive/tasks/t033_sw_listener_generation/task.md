# Task spec - T033 sw_listener_generation

## 背景

`src/extension/background/service_worker.ts:875-929` tab listener（onActivated/onUpdated/onRemoved/onCreated）入口检查一次 `is_capturing` 后多次 await（`chrome.tabs.get`、消息重试、CDP 启动）。await 返回后不校验 generation：
- 旧采集触发的 tab_switch/tab_url_change 可归入新采集。
- 旧异步 continuation 可在 stop 后重新 attach debugger 或启动 body capture。
- `update_capture_body_state()` 可能更新错误 CaptureRecord。

## 范围

代码/配置：

- `src/extension/background/service_worker.ts`：
  - 每个 tab listener 入口 `const gen = capture_state.current_generation()`。
  - 关键 await 后调 `if (!capture_state.is_active_generation(gen)) return;`。
  - 事件构造使用捕获的 `current_capture_id`/`start_time`/`current_config` 局部拷贝（避免读取已被新采集覆盖的全局值）。

测试：

- 新建 `tests/unit/sw_listener_generation.test.ts`：
  - 模拟 onActivated await 期间 stop + 新 start，验证旧回调不写入新采集。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 listener 注册次数（保持单次）。
- 不引入新 listener。

## 验收标准

- [ ] onActivated listener await 后 generation 失效时 return。-> 验证：单测。-> 预期：旧回调不调 write_events。
- [ ] `npm test` 全绿。

## 依赖与约束

- 依赖 T029 capture_state。
- 受影响业务不变量：异步回调不跨 generation 写入。
- 无数据迁移。
- 无平台限制。
