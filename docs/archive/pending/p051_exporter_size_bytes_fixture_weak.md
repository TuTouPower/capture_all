# p051 exporter total_size_kb 字节口径 fixture 防护不足

- 来源：t198 遗留（t198_test_f001，round 2 test review minor）
- 内容：`tests/unit/exporter.test.ts` AC-002 用例加了中文 fixture，但非 ASCII 字节差仅 20B（内嵌 JSON 字节 1603 / 字符 1583），`Math.round` 后同为 2 KB，生产若回归字符计数口径用例仍绿，注释宣称的防护与实际不符。有效修复：使非 ASCII 字节差 >512B（约 171 个中文字符），round 必然分叉。
- 处理：t198
