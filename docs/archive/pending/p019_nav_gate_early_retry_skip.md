# p019 onActivated/onUpdated 早退跳重试

- 来源：t106 遗留（t106_code_f006，minor）
- 内容：onActivated/onUpdated listener 因 nav_count_enabled 早退时，同时跳过 start-send 与 console/error/body CDP 重试。边缘场景（导航关时切 tab），start-send 有状态轮询兜底，非阻断。可评估重试是否应与 nav 门控解耦。
- 处理：t120
