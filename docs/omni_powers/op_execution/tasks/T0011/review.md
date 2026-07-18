# {TID} Review

## 裁决一：规格合规
### 验收标准覆盖
- {每条声明覆盖的验收标准 AC-N 是否真做到}

### 偏航检查
- {实际工作集 vs 预估偏差 / 自由发挥 / 范围偏航}

### 不变量检查
- {触碰的不变量 INV-N 是否守住}

## 裁决二：测试可信
### 测试质量
- {测的是验收标准还是 mock / 断言用户可观察 / 异步时序}

### 危险模式扫描
- {expect·assert 变更 / .skip·.only / timeout 增大 / 删测试块 / 加 eslint-disable}

## 问题清单
| 问题 | 暂存 | 说明 |
|---|---|---|
| {描述} | 是/否 | {证据/理由；范围外暂存项落 issue 时带 P 建议} |

<!--
verdict 规则：
- reviewer 每轮必须追加一行 `verdict: PASS` 或 `verdict: FAIL`
- 模板默认 `verdict: UNKNOWN` 不算裁决，避免空 review 被读成 PASS
- 首轮写一行；重审（FAIL 修复后）追加新 verdict 行，以最后一行为准
- PASS 门槛：所有未标【暂存】的问题必须修完
- review ≤ 2 轮（design §7.2 / RULES.md）；第 2 轮仍 FAIL → 阻塞
-->

verdict: UNKNOWN
