# omni_powers

Capture All 使用 omni_powers 工作流管理需求拆解、执行与归档。

## 三区

| 区 | 路径 | 说明 |
|---|---|---|
| blueprint | `docs/omni_powers/op_blueprint/` | 真相源：产品与技术规格的稳定定义 |
| execution | `docs/omni_powers/op_execution/` | 执行队列：tasks_list、task spec、issues、checkpoint |
| record | `docs/omni_powers/op_record/` | 历史记录：progress 与 decisions，只读归档 |

文档定位、三区详情见 [index.md](./index.md)。

## 常用命令

| 命令 | 用途 |
|---|---|
| `/opintake "<需求>"` | 拆需求为 task |
| `/oprun` | 领 task 执行 |
| `/opstatus` | 看状态 |
