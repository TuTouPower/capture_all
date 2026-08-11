// docs/spikes/s001_logger_url_boundary_heuristic/code/spike.ts
// t113 SPIKE: 验证边界启发式候选正则在既有 URL 形态与三元反例上的行为
// 运行：cd <worktree 根> && npx tsx docs/spikes/s001_logger_url_boundary_heuristic/code/spike.ts
import { redact_url } from '../../../../src/shared/redaction';

// 候选规则：bare-query 与 path-query 增加左侧边界（lookbehind），
// 只认可 字符串开头/空白/左括号/逗号/引号/= 后的 ?query 或 /path?...。
const CANDIDATE = /(?:[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`)]+|(?<=^|[=\s([,<"'])\/[^\s"'<>`)]*\?[^\s"'<>`)]*=[^\s"'<>`)]*|(?<=^|[=\s([,<"'])\?[^\s"'<>`)]*=[^\s"'<>`)]+)/gi;

function scan(text: string): { matches: string[]; output: string } {
    const matches: string[] = [];
    const output = text.replace(CANDIDATE, (m) => {
        matches.push(m);
        return redact_url(m, true).url;
    });
    return { matches, output };
}

type Case = { name: string; input: string; expect_redacted: boolean };

const cases: Case[] = [
    // ── 负例：JS 三元 / 可选链 必须逐字保留 ──
    { name: 'ternary', input: 'branch result: cond?token=x:y', expect_redacted: false },
    { name: 'ternary details', input: JSON.stringify({ detail: 'cond?token=x:y' }), expect_redacted: false },
    { name: 'ternary error', input: 'Error: got cond?token=x:y in line 3', expect_redacted: false },
    { name: 'optional chain', input: 'value user?.token missing', expect_redacted: false },
    // ── 正例：明确 URL 上下文必须脱敏 ──
    { name: 'absolute', input: 'see https://example.com/p?token=SECRET now', expect_redacted: true },
    { name: 'bare query standalone', input: 'redirect to ?token=SECRET please', expect_redacted: true },
    { name: 'path query', input: 'go /login?token=SECRET now', expect_redacted: true },
    { name: 'path query paren', input: 'go (/login?token=SECRET) now', expect_redacted: true },
    { name: 'colon value', input: 'url https://example.com/p?token=abc:def ok', expect_redacted: true },
    { name: 'data url value', input: 'got https://example.com/p?token=data:text/plain;base64,QUJDRA==', expect_redacted: true },
    { name: 'base64 padding', input: 'see https://example.com/p?token=QUJDRA== end', expect_redacted: true },
    { name: 'comma path', input: 'list: /a?token=SECRET, /b', expect_redacted: true },
    // ── 已知收缩：无斜杠相对路径（file?token=x）不再脱敏 ──
    { name: 'relative no slash (shrink)', input: 'open file?token=SECRET now', expect_redacted: false },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
    const { matches, output } = scan(c.input);
    const redacted = matches.length > 0 && output.includes('REDACTED');
    const ok = redacted === c.expect_redacted;
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}`);
    console.log(`  in:     ${c.input}`);
    console.log(`  matches: ${JSON.stringify(matches)}`);
    console.log(`  out:    ${output}`);
    console.log('');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
