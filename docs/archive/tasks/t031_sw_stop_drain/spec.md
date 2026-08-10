# Task spec - T031 sw_stop_drain

## 背景

`src/extension/background/service_worker.ts:479-553` stop_capture_inner 先翻 `is_capturing=false`、写 stopped event、update CaptureRecord completed，之后才停生产者（network/body/cookie/console/exception）。所有回调入口看到 `is_capturing===false` 直接返回，stop 开始到各生产者真正停止之间已产生或正在异步处理的事件被丢弃，CaptureRecord 的 stats / 结束时间 / stopped lifecycle event 早于真实采集终点。

按 T028 spike stop drain 顺序：进入 stopping -> 拒新命令但继续接当前 generation 回调 -> 停生产者 -> drain -> 写 stopped event + 最终 stats -> flush -> idle。

## 范围

代码/配置：

- `src/extension/background/service_worker.ts` `stop_capture_inner`：
  - 进入 stopping 阶段后，**先停生产者**（network/body/cookie/console/exception），让 in-flight 回调自然结束。
  - 然后 `flush_all` drain 剩余事件。
  - 最后写 stopped event + update_capture（含最终 stats/ended_at/duration_ms）。
  - 期间 `is_capturing` 不立即翻 false（保持到 drain 完成），各回调入口仍处理事件；但入口拒绝新 stop/start（capture_state 已 stopping）。

测试：

- 扩展 `tests/unit/stop_capture.test.ts` 或新建：
  - 验证 stopped_event 在 stop_network/stop_body 之后才写入（事件顺序）。
  - 验证 drain 期间事件被持久化。

文档：

- 无 blueprint 改动。

## 非范围

- 不引入 generation token listener 校验（T033）。
- 不改 CaptureRecord schema。

## 验收标准

- [ ] stopped_event 写入发生在 stop_network_capture / stop_body_capture 之后。-> 验证：单测 mock 调用顺序。-> 预期：write_events 调用在 stop_network之后。
- [ ] `npm test` 全绿。

## 依赖与约束

- 依赖 T029 capture_state（已 stopping 阶段）。
- 受影响业务不变量：stopped lifecycle 与 stats 反映真实采集终点。
- 无数据迁移。
- 无平台限制。
