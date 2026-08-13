# p039 list_captures limit 入参校验

- 来源：t153 遗留（t153_gen_f002）
- 内容：`list_captures` 的 `limit` 参数未做输入校验——负数/0 会静默返回空数组，小数会意外截断。现网无调用方传非法值（popup 恒定传 10），属防御性缺口。后续在 SW 层 clamp/校验（如 `limit >= 1 ? Math.floor(limit) : undefined`），或 message_contract 标注正整数约束。
- 处理：t198
