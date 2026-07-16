// shared/id.ts — capture_id 生成
// P0.60: 统一 capture_id 格式为 <时间戳毫秒>_<随机7字符>，不再含 capture_ 前缀
function random_suffix(len: number): string {
    let s = Math.random().toString(36).slice(2, 2 + len);
    while (s.length < len) s = '0' + s;
    return s;
}

export function generate_capture_id(): string {
    return `${Date.now()}_${random_suffix(7)}`;
}
