# Task spec

## 背景

intensive-review content/bridge 小缺陷与文档同步：focus 双重采集、XHR 误标 fetch、未知 action 通道挂起、scroll 噪声、XHR loadend 累积、storage key 名未脱敏、page_load 负值、clipboard 双报、binary unsupported 语义、result 500→400、userinfo 未脱敏、utf8 假定、theme 双存储、healthy 无超时、mime 保守、pending 语义、total_size_kb 虚构、bridge 事件时间轴、dom_data 映射、test_bridge_fetch 原始 URL、start 串行阻塞、sample_rate clamp、listener generation 守卫、URL 两处口径、architecture.md 文档过时。

## 契约区

### 范围

- 修复 review finding：intensive-review 聚合：B3-M6 focus 双采、M7 resource_type、M8 未知 action、L1-L8、B1-L3/L4/L5/L6/L7/L14/L15、B2-L1/L5/L7、M5/M6/M11/M12/M19、文档过时

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: focus 事件单一来源（dom_capture 与 focus_capture 不双报）
- [ ] AC-002: XHR 请求 resource_type 正确（非恒 'fetch'）
- [ ] AC-003: content onMessage 未知 action 返回错误响应，通道不挂起
- [ ] AC-004: scroll 事件捕获滚动源（嵌套滚动不产生坐标不变噪声）
- [ ] AC-005: XHR loadend 监听不累积
- [ ] AC-006: storage key 名对 token/secret/password 匹配项脱敏
- [ ] AC-007: page_load 时长负值/null 语义正确
- [ ] AC-008: CAPTURE_BODY=false 时二进制响应状态为 not_enabled 非 unsupported
- [ ] AC-009: /extension/result 客户端错误返回 400 而非 500
- [ ] AC-010: redact_url 对 userinfo 形态脱敏（或显式文档行为）
- [ ] AC-011: theme 单一存储来源或双向同步一致
- [ ] AC-012: is_bridge_healthy 带超时
- [ ] AC-013: start 对多 tab 并行通知（不串行阻塞）
- [ ] AC-014: sample_rate_ms clamp 到合理区间
- [ ] AC-015: 异步 listener 补 generation 守卫（跨采集不串写）
- [ ] AC-016: bridge URL 校验两处口径统一
- [ ] AC-017: 文档同步（architecture.md 移除已删 webrequest_handler 等过时条目；README 64MiB/FLUSH 语义与实际一致）
- [ ] AC-018: 其余小项（clipboard 去重、mime 语义、total_size_kb、bridge 时间轴、pending 语义、dom_data 映射、test_bridge_fetch 走 normalize）按实现修正
- [ ] AC-019: 既有相关测试语义不回退

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001-008: content 各模块单测补断言
- AC-009-016: bridge/shared 单测补断言
- AC-017: 文档核对（grep 过时引用）
- AC-018: 按项单测
- AC-019: 既有测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 聚合：B3-M6 focus 双采、M7 resource_type、M8 未知 action、L1-L8、B1-L3/L4/L5/L6/L7/L14/L15、B2-L1/L5/L7、M5/M6/M11/M12/M19、文档过时）

### 有意不测

- 无

### 测试策略

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- docs/blueprint/architecture.md：目录结构过时条目修正
