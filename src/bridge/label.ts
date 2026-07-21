// T091: 扩展零配置自动连接 —— 默认 label 自动编号（中文数字）。
// 纯函数：中文数字转换 + 反向解析 + 下一可用默认 label 计算。

const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;
const DIGIT_VALUE: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
};

/**
 * 把 1..9999 的整数转换为中文数字。
 * 0 返回 '零'（不用于编号，仅为完整性）。
 * 超过 9999 抛错（浏览器实例上限远小于此）。
 */
export function to_chinese_numeral(n: number): string {
    if (!Number.isInteger(n) || n < 0) {
        throw new Error(`to_chinese_numeral: invalid input ${n}`);
    }
    if (n > 9999) {
        throw new Error(`to_chinese_numeral: value too large ${n}`);
    }
    if (n === 0) return '零';
    if (n < 10) return CHINESE_DIGITS[n];
    if (n < 100) return digits_10_to_99(n, true);
    if (n < 1000) {
        const hundreds = Math.floor(n / 100);
        const rest = n % 100;
        const prefix = `${CHINESE_DIGITS[hundreds]}百`;
        if (rest === 0) return prefix;
        if (rest < 10) return `${prefix}零${CHINESE_DIGITS[rest]}`;
        return prefix + digits_10_to_99(rest, false);
    }
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const prefix = `${CHINESE_DIGITS[thousands]}千`;
    if (rest === 0) return prefix;
    if (rest < 10) return `${prefix}零${CHINESE_DIGITS[rest]}`;
    if (rest < 100) return `${prefix}零${digits_10_to_99(rest, false)}`;
    return prefix + to_chinese_numeral(rest);
}

/**
 * 10..99 范围转换。at_root=true 表示独立成词（10→「十」、11→「十一」）；
 * at_root=false 表示拼接在更大单位后（必须前导「一十」「一十一」）。
 */
function digits_10_to_99(n: number, at_root: boolean): string {
    if (n < 20) {
        const ones = n - 10;
        const tens_prefix = at_root ? '十' : '一十';
        return ones === 0 ? tens_prefix : tens_prefix + CHINESE_DIGITS[ones];
    }
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones === 0
        ? `${CHINESE_DIGITS[tens]}十`
        : `${CHINESE_DIGITS[tens]}十${CHINESE_DIGITS[ones]}`;
}

/**
 * 反向解析：label 是中文数字格式时返回对应整数，否则返回 null。
 * 支持 1..9999。'零' 返回 0（不用于编号）。
 * 拒绝连续数字（如「一二三」）和无前导数字的单位（如「百」）。
 */
export function parse_chinese_numeral(label: string): number | null {
    if (!label) return null;
    if (label === '零') return 0;

    let total = 0;
    let pending_digit = 0;
    let last_was_unit = false;

    for (const ch of label) {
        if (ch in DIGIT_VALUE) {
            // 前一个数字未被单位消化 → 连续数字（非法）
            if (pending_digit !== 0) return null;
            pending_digit = DIGIT_VALUE[ch];
            last_was_unit = false;
            continue;
        }

        const unit_value = ch === '十' ? 10 : ch === '百' ? 100 : ch === '千' ? 1000 : 0;
        if (unit_value === 0) return null;

        // 单位无前导数字：「十」单独可作 1，「百/千」必须前导
        if (pending_digit === 0) {
            // 允许开头「十」表示 10；禁止「百」「千」无前导，禁止连续单位
            if (ch !== '十' || last_was_unit) return null;
            pending_digit = 1;
        }

        total += pending_digit * unit_value;
        pending_digit = 0;
        last_was_unit = true;
    }

    // 末尾剩余 pending_digit 是个位
    total += pending_digit;

    return total > 0 ? total : null;
}

/**
 * 根据现有 labels 计算下一个默认 label。
 * 策略：扫描已有 label 中的中文数字序号，取 max + 1，转中文。
 * 自定义 label（非中文数字格式）不参与序号推进。
 * 空 labels 数组返回 '一'。
 */
export function next_default_label(existing_labels: Iterable<string | null | undefined>): string {
    let max_num = 0;
    for (const label of existing_labels) {
        if (!label) continue;
        const num = parse_chinese_numeral(label);
        if (num !== null && num > max_num) {
            max_num = num;
        }
    }
    return to_chinese_numeral(max_num + 1);
}
