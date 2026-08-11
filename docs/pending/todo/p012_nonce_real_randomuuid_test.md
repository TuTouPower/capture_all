# p012 两次 start 真实 randomUUID 对比

- 来源：t097 遗留（t097_test_f003，minor）
- 内容：AC-003 用 `_set_nonce_for_test` 手工指定 nonce，未覆盖真实 `crypto.randomUUID()` 每次 start 生成不同值的生产路径。可补两例对比真实 nonce 的用例（jsdom 需 stub crypto.randomUUID 且规避 DOM 内部调用污染）。
- 处理：未开
