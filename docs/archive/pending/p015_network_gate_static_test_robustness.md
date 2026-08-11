# p015 网络门控静态测试增强

- 来源：t098 遗留（t098_test_f003，minor）
- 内容：AC-001 静态测试未断言 `start_network_hook` 出现次数，P0-7 回归变异（如同时在 if 内外各调一次）可逃逸。可补断言「start_network_hook 在 start_capture 内恰好出现一次」或改为行为级门控验证（mock content_script 依赖后驱动 start_capture）。
- 处理：t116
