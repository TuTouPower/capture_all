# p006 cdp_primary_emitted Set 只写不读

- 来源：t094 未进表观察（review_code.md 结论节，pre-existing）
- 内容：`src/extension/background/network_capture.ts` 的 `cdp_primary_emitted` Set 只 add（`cdp_primary_emitted.add(req_key)` 多处）从不读取，pre-existing 死代码。语义原意应是「webRequest 跳过已由 CDP emit 的请求避免重复」，但无读取点。可确认无实际读取需求后删除。
- 处理：未开
