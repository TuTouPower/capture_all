# Spike report

## 问题

`redact_url` 只检查顶层 query key，非敏感参数值内嵌的 nested query（absolute/base-resolved、path/root/query/protocol-relative、plain/encoded）不递归脱敏。需验证候选递归实现的：编码嵌套 query 的逐层解码深度与终止条件、10 种 outer/inner 组合覆盖、非敏感结构保留、url_status 语义。

## 成功判据

- p018 复现矩阵 10 种组合（含 `%3F`/`%3D` 编码值）secret 全部消失、`[REDACTED]` 占位存在；
- 双编码（`%253F`）不被误处理（单层解码后仍是 `%3F`，不触发递归）；
- 深层嵌套链（`?next=?next=?next=?token=x`）终止不无限递归；
- 非敏感参数值与非敏感结构（path/hash/非敏感 key）不被破坏。

## 尝试

- 候选实现（`code/spike.ts`）：`redact_url` 内对每个非敏感参数 value 调 `find_nested_query` 检测内嵌 `?key=value` 形态（plain 或单层解码后）；命中则对嵌套子串递归 `redact_url`，`url_status='redacted'` 时按位置重组写回；encoded 值解码脱敏后 `encodeURIComponent` 写回；`MAX_DEPTH=5` 防无限递归。
- absolute 分支（`new URL` 成功）与手动分支（相对/无法 parse）分别处理，保持 T100 拆 query 重组语义。

## 证据

- `npx tsx code/spike.ts`：12/12 用例通过。10 种 p018 组合全部 `leak=false` 且 `status=redacted`；双编码用例保持 `captured`（单层解码不触发）；深层链正常终止。
- 关键输出：`?next=child?token=secret` → `?next=child?token=[REDACTED]`；`?next=child%3Ftoken%3Dsecret` → `?next=child%3Ftoken%3D%5BREDACTED%5D`；`https://outer/start?next=/child?token=secret` → `...next=%2Fchild%3Ftoken%3D%5BREDACTED%5D`。

## 结论

- 解码深度：单层 `decodeURIComponent`；`%3F`/`%3D` 编码值识别并脱敏，双编码不触发（避免重复解码误判）。
- 终止条件：`MAX_DEPTH=5`；深层链终止且敏感值仍被脱敏。
- 重组语义：plain 值原位替换嵌套子串；encoded 值解码重组后整体 `encodeURIComponent` 写回，保持 URL 编码合法性。
- 非敏感结构保留：path/hash/非敏感 key 与普通值不受影响；`url_status` 仅在真实改写时置 `redacted`。

## 是否采纳

- 决定：是
- 理由：12/12 用例覆盖全部组合，解码深度与终止条件明确，无重复解码与无限递归风险。
- 后续 task：t114
