# omni_powers 导航

agent 读取入口。`/oprun` 启动时读本文件摘要定位工作区与文档。

## 三区模型

| 区 | 路径 | 定位 |
|---|---|---|
| op_blueprint | `docs/omni_powers/op_blueprint/` | 真相源。产品与技术规格的稳定定义，实现即"已实现"，不设状态列 |
| op_execution | `docs/omni_powers/op_execution/` | 执行队列。当前批次的 tasks_list.json、task spec、issues、leader_checkpoint，机读为主 |
| op_record | `docs/omni_powers/op_record/` | 历史记录。progress.md 与 decisions.md，按次追加，只读归档 |

profile（模式：heavy）在 `docs/omni_powers/profile`，机器读，不在此复述。

## 文档定位

### op_blueprint（规格真相源）

| 文档 | 用途 | 何时读 |
|---|---|---|
| `prd.md` | 产品需求、目标用户、信息架构、核心功能、成功标准、明确不做 | 理解产品边界、用户故事、功能取舍时 |
| `architecture.md` | 技术栈、目录结构、模块职责、数据流、Chrome 权限、构建产物 | 定位模块、理清数据流、确认依赖时 |
| `domain.md` | 领域术语、MCP 工具命名、内部分类 vs UI 标签、禁用术语、业务不变量、存储限制、超时、错误码 | 统一术语、查不变量约束、对齐错误码时 |
| `conventions.md` | 命名、缩进、文件组织、UI 编码、扩展 API 规范、安全编码、日志、新增模块步骤、提交规范 | 写代码前对齐风格、新增 capture 模块时 |
| `test.md` | 测试分层、运行命令、Mock 策略、E2E 配置与纪律、覆盖目标、回归触发、调试入口 | 跑测试、定位测试失败、选择测试层时 |
| `spec_index.md` | 功能规格索引，每功能一行指向 specs/{feature}.md | 找具体功能规格入口时 |
| `specs/{feature}.md` | 单功能规格（14 个：采集核心 / content 事件 / 网络与 body / storage / cookie / agent mcp / popup / dashboard / devtools / 导出 / 脱敏安全 / 设计系统 / i18n 主题 / 应用日志） | 实现或验收某功能时读对应 spec |
| `baselines/baselines_index.md` | 验收基准快照文件索引（功能名 → AC → 文件） | per-task 验收对照基准时 |

### op_execution（当前执行批次）

| 文档 | 用途 | 何时读 |
|---|---|---|
| `tasks_list.json` | 当前批次任务队列，顺序依赖机读 | `/oprun` 领 task 前、`/opstatus` 渲染状态时 |
| `leader_checkpoint.md` | 执行断点，标注当前进度与下一步 | 续跑时恢复上下文 |
| `specs/{TID}_{slug}.md` | 单 task 工作 spec（task:spec 1:1），含不变量、验收标准、边界 | 执行某 task 前 |
| `issues/` | 暂存项、缺陷、待办，待转 task 或处理 | `/optriage` 分级时 |
| `tasks/` | task 工作产物 | task 执行中 |
| `acceptance/` | 验收产物 | per-task 验收阶段 |

### op_record（历史归档，只读）

| 文档 | 用途 | 何时读 |
|---|---|---|
| `progress.md` | 按次追加的执行进度记录 | 回溯历史进度时 |
| `decisions.md` | 按次追加的决策记录 | 查历史决策依据时 |
| `tasks/{TID}/` | 已归档 task 工作区 | 回溯某 task 证据时 |
| `specs/` | 已归档 task 工作 spec | 查历史契约时 |
| `acceptance/{TID}/` | 已归档验收产物 | 查验收报告时 |

## 工作流入口

| 命令 | 用途 |
|---|---|
| `/opintake "<需求>"` | 需求入口。spec 编写（含设计探索，task:spec 1:1）→ 闸门 A 批复 → 拆 task → tasks_list 就绪 |
| `/oprun` | 续跑。task 循环（implementer → review → per-task 验收 → merge gate → closer → 归档） |
| `/opstatus` | 状态查看 |
| `/optriage` | issue 分级与转 task |

## 本仓流程铁律（实践后补强）

1. **禁止绕过 merge gate**：gate exit≠0 硬停，禁止直接 commit main。
2. **task = commit**：一 TID 一 squash；禁止多 TID 合并抢救 commit。
3. **行为 AC 必须真机验收**：单元/源码 grep 不能代替 evaluator E2E；PASS 报告不得残留范围内 FAIL。
4. **E2E 只固化脚本**：禁止把 `dist/`、浏览器 profile 提交进 `e2e/{TID}/`。
5. **status 只走脚本**：`op_status.sh` / `op_close_post.sh`，禁止手改 tasks_list 翻 done。
