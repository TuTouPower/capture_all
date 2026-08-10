# p007 finished_before_stream 流式路径泄漏

- 来源：t094 未进表观察（review_code.md 结论节，pre-existing）
- 内容：`src/extension/background/network_capture.ts` 流式路径 `finished_before_stream.add(req_key)`（loadingFinished）后在 emit 分支未删除，每 SSE 请求泄漏一字符串，长采集内存缓慢增长。应在 emit 后 `finished_before_stream.delete(req_key)` 或改用自动清理。
- 处理：未开
