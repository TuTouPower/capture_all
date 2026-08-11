# p002 poll_interval 边界测试补 case

- 来源：t092 遗留（t092_test_f001，minor）
- 内容：AC-003 文字含「非有限整数」，测试未显式覆盖 `NaN` / `Infinity` poll（与 12.5 同代码路径，行为已等价覆盖）与下边界 250（=MIN）。可补三例增强覆盖。
- 处理：t116
