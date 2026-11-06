# Task spec

## 背景

`/cdp/start` 从 `http://127.0.0.1:{port}/json/list` 读取 target 列表后，只检查 `webSocketDebuggerUrl` 非空就直接 `new WebSocket(...)`，未解析 URL，未限制 scheme/hostname/port/userinfo。占用指定 loopback 端口的恶意/被劫持服务可返回远端 `wss://` 目标，使 Bridge 建立出站 WebSocket，构成有限 SSRF/出站代理。

## 契约区

### 范围

- `new URL(webSocketDebuggerUrl)` 后仅允许 `ws:` scheme，hostname 限于 `127.0.0.1`/`localhost`/`[::1]`，端口必须等于请求的 `port`。
- 拒绝 credentials、fragment、异常路径、`wss:` 与远端 host。
- 优先用 target ID 自行构造已知 loopback URL，避免信任 discovery 返回的 authority。

### 非范围

- 不改变 `/cdp/start` 的 MCP Bearer token 认证要求。
- 不改变 target 选择逻辑。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：discovery 返回 `ws://127.0.0.1:{port}/...` 且端口等于请求 port 时正常建立 WebSocket。
- [ ] AC-002：discovery 返回远端 host（非 loopback）时拒绝，不建立 WebSocket。
- [ ] AC-003：discovery 返回不同端口、`wss:` scheme、含 userinfo 时拒绝。
- [ ] AC-004：新增负向测试覆盖远端 host、不同端口、userinfo、非 ws scheme。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：mock discovery 响应，断言 `new WebSocket` 是否被调用及 URL。

## 上下文区

- 来源：SEC-002（2026-08-13 核实，`c4e9851` 直接信任 discovery URL，后续未收敛 authority）。

### 有意不测

- 无。

### 测试策略

- mock discovery JSON；断言 URL 校验拒绝与放行。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：某些合法 CDP 实现用非标准 authority 返回。
- 回退：自行构造 loopback URL 作为主路径，discovery authority 仅作一致性参考。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：如记录 CDP WebSocket authority allowlist，同步。
