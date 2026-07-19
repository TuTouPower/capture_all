# T074 README 64 MiB + refactor_plan.md cleanup

README.md/README.en.md: 32 MiB → 64 MiB（与 server.ts MAX_EXTENSION_RESULT_BODY_BYTES 对齐）。
public_docs.test.ts: 断言更新为 64 MiB。
AGENTS.md: 删除 docs/refactor_plan.md 引用（文件不存在，重构已完成）。
CLAUDE.md: 已被外部修改，refactor_plan 行已删。
