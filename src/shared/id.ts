// shared/id.ts — capture_id 生成
// P0.60: 统一 capture_id 格式为 <时间戳毫秒>_<随机7字符>，不再含 capture_ 前缀
export function generate_capture_id(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
