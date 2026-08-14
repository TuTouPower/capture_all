# p050 rail resize 解绑断言受 MIN_W 钳制不敏感

- 来源：t197 遗留（t197_test_f005，round 2 test review minor）
- 内容：`tests/unit/dashboard_ui_interactions.test.ts` rail resize 用例的 mousemove 解绑断言在 jsdom 下不敏感——rail rect=0 + MIN_W=160 钳制使解绑与否输出相同 `160px 1fr`。建议将拖拽 mousemove 取值移出钳制区（clientX ≥ 300，使 w 落在 160..480 区间内），断言才能真正区分 listener 是否解绑。
- 处理：t197
