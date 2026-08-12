# Spike report

## 问题

t137 UNVERIFIED-SPIKE：合法重启重 enroll 与攻击顶替（伪造 chrome-extension origin）的可区分信号。

## 成功判据

- 存在不依赖时序的确定性信号，能区分「同扩展重启重 enroll」与「伪造 origin 顶替既有 instance_id」。

## 尝试

读 `src/bridge/server.ts` enroll（L254-332）与扩展侧 `agent_bridge_client.ts`（L195-240）+ `agent_bridge_config.ts`（L57-63）核实：

- 扩展 `instance_id = crypto.randomUUID()`，存 `chrome.storage.local` 会话，重启后 `load_bridge_session()` 读回同一 instance_id。
- 扩展重启后重 enroll 用同一 instance_id + 同一扩展的固定 Origin（MV3 扩展 ID 安装后不变）。
- 攻击者用真实扩展的 instance_id + 伪造任意 chrome-extension:// Origin 重 enroll。

## 证据

- `generate_instance_id` 返回会话持久化 uuid（agent_bridge_config.ts:57-63），重启不更换。
- enroll 现有 `is_allowed_extension_origin` 仅校验形状（server.ts:553-555），不比对扩展 ID 与 instance_id 历史。
- ExtensionInstance 无 origin 绑定字段，顶替仅靠 label 冲突删除（server.ts:295-312）。

## 结论

**可区分信号**：instance_id 与「首次登记该 instance_id 时的 Origin 扩展 ID」绑定。重 enroll 时若 Origin 扩展 ID 与已登记的不同 → 攻击顶替；相同 → 同一扩展合法重启。

- 合法重启：同 instance_id + 同 Origin 扩展 ID → 允许。
- 攻击顶替：同 instance_id + 伪造 Origin 扩展 ID ≠ 已登记 → 拒绝。
- 首次 enroll（新 instance_id）：无历史可比对，零配置流程保留（T091）。

局限：攻击者若先伪造一个 instance_id 抢占（首次 enroll 即绑定自己的 Origin 扩展 ID），再用真实扩展重 enroll 会被 Origin 不匹配拒绝——真实扩展被锁死。但攻击者无法使真实扩展使用自己伪造的 instance_id（instance_id 是扩展端会话值），真实扩展首次 enroll 会用自己的 instance_id 重新绑定。可接受。

## 是否采纳

- 决定：是
- 理由：确定性信号（Origin 扩展 ID 绑定 instance_id），不依赖时序，兼容合法重启路径。
- 后续 task：t137
