// T091: 扩展零配置自动连接 —— 默认 label 自动编号（「1 号」「2 号」…）。
// 纯函数：根据现有 labels 计算下一可用默认 label。

const DEFAULT_LABEL_PATTERN = /^(\d+) 号$/;

/**
 * 根据现有 labels 计算下一个默认 label。
 * 策略：扫描已有 label 中的「N 号」序号，取 max + 1，格式 `${max + 1} 号`。
 * 自定义 label（非「N 号」格式）不参与序号推进。
 * 空 labels 数组返回「1 号」。
 */
export function next_default_label(existing_labels: Iterable<string | null | undefined>): string {
    let max_num = 0;
    for (const label of existing_labels) {
        if (!label) continue;
        const match = label.match(DEFAULT_LABEL_PATTERN);
        if (match) {
            const num = Number.parseInt(match[1], 10);
            if (Number.isFinite(num) && num > max_num) {
                max_num = num;
            }
        }
    }
    return `${max_num + 1} 号`;
}
