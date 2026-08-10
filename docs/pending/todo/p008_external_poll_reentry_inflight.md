# p008 external poll 重入 in-flight 变体测试

- 来源：t095 遗留（t095_test_f002，minor）
- 内容：`body_capture_external_poll_stop.test.ts` AC-003 用例仅覆盖「首轮 poll 尚未触发（timer 挂起）时重入」。未覆盖「首轮 poll 已 in-flight 时重入」变体（旧闭包 poll_stopped 置位后 in-flight resolve 不写、新 poll 单路）。共享机制已在 AC-001 覆盖，可补 case 增强。
- 处理：未开
