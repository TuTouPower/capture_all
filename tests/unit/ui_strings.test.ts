// tests/ui_strings.test.ts — UI 字符串审计：验证不含 深度采集 / 标准采集 / Record All 等旧术语
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.resolve(ROOT, 'src');

// 禁止出现的废弃字符串 (pattern → 描述)
const FORBIDDEN: { pattern: string; desc: string }[] = [
    { pattern: 'Record All',   desc: '旧英文名 Record All' },
    { pattern: 'record_all',   desc: '旧 snake_case 标识 record_all' },
    { pattern: '深度采集',     desc: '已删除概念：深度采集' },
    { pattern: '标准采集',     desc: '已删除概念：标准采集' },
    { pattern: '录制',         desc: '旧术语：录制' },
];

interface Violation {
    file: string;
    line: number;
    forbidden: string;
    desc: string;
    snippet: string;
}

function is_source_file(name: string): boolean {
    const ext = path.extname(name).toLowerCase();
    return ext === '.ts' || ext === '.html';
}

function is_comment_or_i18n_line(line: string): boolean {
    const trimmed = line.trim();
    // 纯注释行
    if (
        trimmed.startsWith('//') || trimmed.startsWith('*') ||
        trimmed.startsWith('/*') || trimmed.startsWith('/**') ||
        trimmed === '*/'
    ) return true;
    // HTML 注释
    if (trimmed.startsWith('<!--')) return true;
    return false;
}

function scan_file(file_path: string, rel_root: string): Violation[] {
    const violations: Violation[] = [];
    if (!is_source_file(file_path)) return violations;
    // 跳过本文件自身
    if (path.resolve(file_path) === path.resolve(__filename)) return violations;

    let content: string;
    try { content = fs.readFileSync(file_path, 'utf-8'); } catch { return violations; }

    const lines = content.split('\n');
    for (const { pattern, desc } of FORBIDDEN) {
        if (!content.includes(pattern)) continue;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.includes(pattern)) continue;
            if (is_comment_or_i18n_line(line)) continue;
            violations.push({
                file: path.relative(rel_root, file_path),
                line: i + 1,
                forbidden: pattern,
                desc,
                snippet: line.trim().substring(0, 100),
            });
        }
    }
    return violations;
}

function scan_dir(dir_path: string, rel_root: string): Violation[] {
    const violations: Violation[] = [];
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir_path, { withFileTypes: true }); } catch { return violations; }
    for (const entry of entries) {
        const full = path.join(dir_path, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'artifacts') continue;
            violations.push(...scan_dir(full, rel_root));
        } else if (entry.isFile()) {
            violations.push(...scan_file(full, rel_root));
        }
    }
    return violations;
}

// ── dashboard 硬编码中文守卫（t143 AC-003）──────────────────────────────
// 扫描 src/extension/dashboard/*.ts 的渲染代码（非注释/非日志），
// 断言不含未国际化的硬编码中文 UI 文案。
const CJK_RE = /[一-鿿]/;

function scan_dashboard_hardcoded_cjk(rel_root: string): Violation[] {
    const violations: Violation[] = [];
    const dash_dir = path.resolve(SRC, 'extension', 'dashboard');
    let files: string[];
    try { files = fs.readdirSync(dash_dir).filter((f) => f.endsWith('.ts')); }
    catch { return violations; }

    for (const fname of files) {
        const file_path = path.join(dash_dir, fname);
        let content: string;
        try { content = fs.readFileSync(file_path, 'utf-8'); } catch { continue; }

        const lines = content.split('\n');
        let in_block = false;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const trimmed = raw.trim();
            // 块注释状态机
            if (in_block) {
                if (trimmed.includes('*/')) in_block = false;
                continue;
            }
            if (trimmed.startsWith('/*')) {
                if (!trimmed.includes('*/')) in_block = true;
                continue;
            }
            // 整行注释（// 与 JSDoc 续行）
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed === '*/') continue;
            // 日志文案不属 UI，忽略 logger.* 调用
            if (/\blogger\.(debug|info|warn|error)\b/.test(raw)) continue;
            // 去掉行尾 // 注释（前面带空格的 // 视为注释起点，避免误伤 http://）
            let code = raw;
            const cm = code.search(/\s\/\//);
            if (cm !== -1) code = code.slice(0, cm);
            if (CJK_RE.test(code)) {
                violations.push({
                    file: path.relative(rel_root, file_path),
                    line: i + 1,
                    forbidden: '硬编码中文',
                    desc: 'dashboard 渲染代码含未国际化硬编码中文 UI 文案',
                    snippet: code.trim().substring(0, 100),
                });
            }
        }
    }
    return violations;
}

// ============================================================
// Tests
// ============================================================

describe('UI 字符串审计', () => {
    const src_violations = scan_dir(SRC, ROOT);

    it('src/ 不含 Record All', () => {
        const hits = src_violations.filter((v) => v.forbidden === 'Record All');
        expect(hits).toEqual([]);
    });

    it('src/ 不含 record_all', () => {
        const hits = src_violations.filter((v) => v.forbidden === 'record_all');
        expect(hits).toEqual([]);
    });

    it('src/ 不含 深度采集', () => {
        const hits = src_violations.filter((v) => v.forbidden === '深度采集');
        expect(hits).toEqual([]);
    });

    it('src/ 不含 标准采集', () => {
        const hits = src_violations.filter((v) => v.forbidden === '标准采集');
        expect(hits).toEqual([]);
    });

    it('src/ 不含 录制（旧术语）', () => {
        const hits = src_violations.filter((v) => v.forbidden === '录制');
        expect(hits).toEqual([]);
    });

    it('src/ 总违规数为 0', () => {
        if (src_violations.length > 0) {
            for (const v of src_violations) {
                console.log(`[UI审计] ${v.file}:${v.line} [${v.desc}] ${v.snippet}`);
            }
        }
        expect(src_violations).toEqual([]);
    });

    // 补充：也扫描 tests/ 目录（信息性，不强制 fail）
    // 这样可以在 CI 中发现测试文件中不当使用的旧术语
    it('tests/ 中不含非预期的旧术语（信息性检查）', () => {
        const tests_dir = path.resolve(ROOT, 'tests');
        const test_violations = scan_dir(tests_dir, ROOT);
        // 过滤：排除已知合法的引用（如 expect().not.toContain('...') 和 FORBIDDEN 数组定义）
        const real_hits = test_violations.filter((v) => {
            const s = v.snippet;
            if (s.includes('.not.toContain(')) return false;
            if (s.startsWith("'") && s.endsWith("'")) return false;
            if (s.startsWith('"') && s.endsWith('"')) return false;
            return true;
        });
        // t190 AC-004: 信息性用例仅输出（不设恒真断言）；真实门禁由上方 src/ 用例承担
        for (const v of real_hits) {
            console.log(`[UI审计] tests/ 发现 ${v.file}:${v.line} [${v.desc}] ${v.snippet}`);
        }
    });

    it('manifest.json（真实文件 src/extension/manifest.json）不含废弃字符串', () => {
        // t190 AC-004: 指向真实 manifest（旧断言读仓库根 manifest.json——不存在即跳过，空洞）
        const manifest_path = path.resolve(ROOT, 'src', 'extension', 'manifest.json');
        const content = fs.readFileSync(manifest_path, 'utf-8');
        for (const { pattern, desc } of FORBIDDEN) {
            expect(content, `manifest.json 含 "${pattern}" (${desc})`).not.toContain(pattern);
        }
    });
});

describe('dashboard i18n 守卫 (t143)', () => {
    const dash_cjk = scan_dashboard_hardcoded_cjk(ROOT);

    it('AC-003: dashboard/*.ts 渲染代码不含硬编码中文 UI 文案', () => {
        if (dash_cjk.length > 0) {
            for (const v of dash_cjk) {
                console.log(`[UI审计] ${v.file}:${v.line} [${v.desc}] ${v.snippet}`);
            }
        }
        expect(dash_cjk).toEqual([]);
    });
});
