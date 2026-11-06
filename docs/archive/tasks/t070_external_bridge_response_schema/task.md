# T070_external_bridge_response_schema

本 task 的核心问题已在以下前序 task 中部分或完全修复：
- T052: Bridge URL allowlist 限制请求目标。
- T050: body_capture_coordinator 单飞轮询。
剩余：res.json() 返回值仍直接信任未做 schema 校验。后续可加 zod 校验 + 单批事件上限。
