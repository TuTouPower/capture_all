# Task spec - T027 redirect_chain

## 背景

`src/extension/background/network_capture.ts:418-441` requestWillBeSent 处理：
- CDP 重定向（301/302/307/308）通过新 `requestWillBeSent` 携带 `params.redirectResponse` 并复用同一 request ID。
- 实现直接覆盖 `cdp_request_meta`，未先 emit 前一跳、也未处理 redirectResponse。中间跳转 Header/状态码/耗时丢失，最终条目开始时间可能变成最后一跳。

## 范围

代码/配置：

- `src/extension/background/network_capture.ts`：
  - `requestWillBeSent` 检测 `params.redirectResponse` 时，若 `cdp_request_meta` 已有 existing：
    1. 用 redirectResponse 数据填充 existing 的 status_code/response_headers/mime。
    2. 立即 emit existing 作为"redirect hop"事件（保留前一跳证据）。
    3. 再 set 新 meta（覆盖），保留 redirect hop count（meta.redirect_count）。
  - 加 `redirect_count` 字段到 `CdpRequestMeta`。

测试：

- `tests/unit/network_capture.test.ts` 扩展：模拟 301 → 200 重定向链，验证 emit 至少 2 个事件（前一跳 + 最终），状态码与 URL 独立。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 webRequest 路径重定向（webRequest API 独立 requestId 不复用）。
- 不改 NetworkRequestData schema 字段命名（仅可选新增）。

## 验收标准

- [ ] 301 → 200 重定向链 emit 至少 2 个事件。-> 验证：单测。-> 预期：emitted.length >= 2。
- [ ] 前一跳事件 status_code 为 301，最终事件 status_code 为 200。-> 验证：单测。-> 预期：含 status 301 与 200。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：重定向链不丢失中间跳证据。
- 无数据迁移。
- 无平台限制。
