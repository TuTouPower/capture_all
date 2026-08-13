# p049 dispatcher stop success:false 分支不可达

- 来源：t177 遗留
- 内容：`agent_command_dispatcher.ts:136` stop 失败分支（success:false → status:'idle'+capture_id:null）真实不可达——`service_worker.ts` 的 stop_capture_inner 恒返回 success:true（run_stop_step 吞错），失败走 rethrow → STORAGE_READ_FAILED。该分支保留为防御（幂等契约），若未来 stop 返回 success:false 时 status:'idle' 语义可能误导，建议确认或移除。
- 处理：未开
