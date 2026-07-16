# Leader Checkpoint

## 断点

### current_task

全部完成

### last_completed

T0010

### next_step

批次完成，可进行收尾或启动新批次
## 本批次（2026-07-16 intake）

主题：**MCP/Bridge 边界重构 + 多浏览器自动绑定（用户只设浏览器编号）**

| TID | 标题 | status | depends_on |
|---|---|---|---|
| T0004 | Bridge 多实例注册表 + 每实例队列 | done | — |
| T0005 | Bridge enroll + instance_token hash | done | T0004 |
| T0006 | 扩展 browser_no + 自动连接 | done | T0005 |
| T0007 | MCP list_browsers + browser_no 透传 + schema 瘦身 | done | T0004 |
| T0008 | SessionStart 自动 bridge + 注入 mcp token | done | T0005 |
| T0009 | 本机配对批准 S1 | done | T0005, T0006 |
| T0010 | 文档对齐 agent_mcp 边界 | done | T0006–T0009 |

### 产品默认决策（写入 draft spec，待闸门 A 确认）

1. MCP 不存浏览器 token；只持 bridge 通道配置
2. Bridge 存注册表与 token hash，负责路由/顶替
3. 用户只设 `browser_no`；对话用编号
4. 多 online 写操作必须指定编号（`TARGET_REQUIRED`）
5. 安全默认 S1 配对批准；S0 仅 dev
6. 同号 re-enroll 顶替旧连接

### 代码侧已合入、待 T0010 写入 blueprint

- 大导出 `output_path` / 瘦身 / **>1MB 自动落盘**（`da722d5`, `5649916`）

## 关键上下文

- T0001–T0003 已 done（历史流程偏差见 decisions）
- 本机：`.claude/skills` heavy bind；`OP_DOCS_DIR=docs/omni_powers`
- open issues 仍多——可另 `/optriage`，与本批次解耦
