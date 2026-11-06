# Task spec + log - T059 event_id_uuid

## 背景

`event_utils.ts:4-16` event_id 用 Date.now()+Math.random()*1e6+counter，不是 UUID；多 frame/SW 重启 counter 归零可碰撞。

## 范围

- generate_event_id 优先用 crypto.randomUUID()，fallback 旧实现（非 secure context）。

## 验收

- [x] 支持 crypto.randomUUID 时用其生成 event_id。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。
