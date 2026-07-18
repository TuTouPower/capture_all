import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script_directory = fileURLToPath(new URL('.', import.meta.url));
const default_root = resolve(script_directory, '..');
const root_argument_index = process.argv.indexOf('--root');
const project_root = root_argument_index === -1
    ? default_root
    : resolve(process.argv[root_argument_index + 1] || '');

const forbidden_paths = [
    '.mcp.json',
    '.claude/settings.local.json',
    '.claude/skills/',
    '.claude/worktrees/',
    'node_modules/',
    'artifacts/',
    'data/',
    '.worktrees/',
];
// Project-level `.claude/settings.json` is intentionally tracked (hooks config).
// Only user-local override files under `.claude/` are forbidden.
// `docs/archive/` is intentionally tracked (D5 in docs/blueprint/decisions.md);
// the scanner skips its content but no longer forbids the path itself.
const forbidden_extensions = new Set(['.log', '.zip']);
const skipped_binary_extensions = new Set([
    '.avif',
    '.gif',
    '.ico',
    '.jpeg',
    '.jpg',
    '.pdf',
    '.png',
    '.webp',
]);
const credential_key_pattern = /^(?:[A-Z0-9]+[_-])*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|BRIDGE[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD|SECRET|PRIVATE[_-]?KEY|TOKEN)$/i;
const placeholder_value_pattern = /^(?:<[^>]+>|\$\{[^}]+\}|process\.env\b|import\.meta\.env\b)/i;
const source_extensions = new Set([
    '.cjs',
    '.js',
    '.jsx',
    '.mjs',
    '.ts',
    '.tsx',
]);
const content_patterns = [
    {
        label: 'personal-absolute-path',
        pattern: /(?:^|[\s='"`(])(?:\/home\/[^\s'"`]+|\/Users\/[^\s'"`]+|[A-Za-z]:\\Users\\[^\s'"`]+)/,
    },
    {
        label: 'github-token',
        pattern: /\b(?:gh[opusr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{82,255})\b/,
    },
    {
        label: 'private-key',
        pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    },
    {
        label: 'jwt-token',
        pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/,
    },
];

function has_credential_assignment(line, allow_source_expressions = false) {
    const assignment_pattern = /["']?([A-Za-z0-9_-]+)["']?\s*[:=]\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\$\{[^}]+\}|<[^>]+>|[^,};\s]+)/g;

    for (const match of line.matchAll(assignment_pattern)) {
        if (!credential_key_pattern.test(match[1])) {
            continue;
        }
        const raw_value = match[2].trim();
        const quote = raw_value[0];
        const is_string_literal = (
            (quote === '"' || quote === "'" || quote === '`')
            && raw_value.endsWith(quote)
        );
        const unquoted_value = (
            is_string_literal ? raw_value.slice(1, -1) : raw_value
        ).trim();
        const value_start = match.index === undefined
            ? -1
            : match.index + match[0].lastIndexOf(match[2]);
        const previous_character = value_start > 0 ? line[value_start - 1] : '';
        const next_character = value_start + match[2].length < line.length
            ? line[value_start + match[2].length]
            : '';
        const is_embedded_source_match = allow_source_expressions && (
            (previous_character === "'" || previous_character === '"')
            && next_character === previous_character
        );
        const is_expression = allow_source_expressions && !is_string_literal && (
            /^[A-Za-z_$][\w$]*$/.test(raw_value)
            || /^string\b/.test(raw_value)
            || /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\?\.|\s*\|\||\s*\?)/.test(raw_value)
            || /^(?:\(|new\s|await\s|function\b|async\b)/.test(raw_value)
        );

        if (
            unquoted_value.length > 0
            && !placeholder_value_pattern.test(unquoted_value)
            && !is_expression
            && !is_embedded_source_match
        ) {
            return true;
        }
    }

    return false;
}

function get_worktree_files() {
    return execFileSync(
        'git',
        ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        {
            cwd: project_root,
            encoding: 'utf8',
            maxBuffer: 50 * 1024 * 1024,
        },
    ).split('\0').filter(Boolean);
}

function get_staged_files() {
    return new Set(execFileSync(
        'git',
        ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'],
        {
            cwd: project_root,
            encoding: 'utf8',
            maxBuffer: 50 * 1024 * 1024,
        },
    ).split('\0').filter(Boolean));
}

function is_forbidden_path(path) {
    if (forbidden_extensions.has(extname(path).toLowerCase())) {
        return true;
    }

    return forbidden_paths.some((forbidden_path) => (
        forbidden_path.endsWith('/')
            ? path.startsWith(forbidden_path)
            : path === forbidden_path
    ));
}

function get_file_content(path, staged_files) {
    if (staged_files.has(path)) {
        return execFileSync('git', ['show', `:${path}`], {
            cwd: project_root,
            encoding: 'utf8',
            maxBuffer: 50 * 1024 * 1024,
        });
    }

    const absolute_path = resolve(project_root, path);
    if (!existsSync(absolute_path)) {
        return '';
    }

    return readFileSync(absolute_path, 'utf8');
}

function get_structured_credential_findings(path, content) {
    const extension = extname(path).toLowerCase();

    if (extension === '.json') {
        try {
            const parsed = JSON.parse(content);
            return find_credentials_in_value(path, content, parsed);
        } catch {
            return [];
        }
    }

    if (extension === '.yml' || extension === '.yaml') {
        const lines = content.split(/\r?\n/);
        return lines.flatMap((line, index) => {
            const match = line.match(/^\s*["']?([A-Za-z0-9_-]+)["']?\s*:\s*(.*)$/);
            if (!match || !credential_key_pattern.test(match[1])) {
                return [];
            }

            const value = match[2].trim();
            if (value === '|' || value === '>') {
                const key_indent = line.match(/^\s*/)?.[0].length ?? 0;
                for (let block_index = index + 1; block_index < lines.length; block_index++) {
                    const block_line = lines[block_index];
                    const block_value = block_line.trim();
                    if (block_value.length === 0) {
                        continue;
                    }

                    const block_indent = block_line.match(/^\s*/)?.[0].length ?? 0;
                    if (block_indent <= key_indent) {
                        break;
                    }
                    if (!is_placeholder_value(block_value)) {
                        return [`${path}:${block_index + 1} credential-assignment`];
                    }
                }
                return [];
            }
            if (value.length === 0) {
                return [];
            }

            return is_placeholder_value(value)
                ? []
                : [`${path}:${index + 1} credential-assignment`];
        });
    }

    return [];
}

function find_credentials_in_value(path, content, value, findings = []) {
    if (Array.isArray(value)) {
        value.forEach((item) => {
            find_credentials_in_value(path, content, item, findings);
        });
        return findings;
    }
    if (typeof value !== 'object' || value === null) {
        return findings;
    }

    for (const [key, nested_value] of Object.entries(value)) {
        if (
            credential_key_pattern.test(key)
            && !is_placeholder_value(String(nested_value))
        ) {
            const line_number = find_key_line(content, key);
            findings.push(`${path}:${line_number} credential-assignment`);
        }
        find_credentials_in_value(path, content, nested_value, findings);
    }
    return findings;
}

function find_key_line(content, key) {
    const key_index = content.indexOf(`"${key}"`);
    return key_index === -1
        ? 1
        : content.slice(0, key_index).split(/\r?\n/).length;
}

function is_placeholder_value(value) {
    const unquoted_value = value.replace(/^["']|["']$/g, '');
    return unquoted_value.length === 0
        || placeholder_value_pattern.test(unquoted_value);
}

function scan_file(path, staged_files) {
    const extension = extname(path).toLowerCase();
    if (skipped_binary_extensions.has(extension)) {
        return [];
    }

    const content = get_file_content(path, staged_files);
    const allow_source_expressions = source_extensions.has(extension);
    const structured_findings = get_structured_credential_findings(path, content);
    const line_findings = content.split(/\r?\n/).flatMap((line, index) => {
        const findings = content_patterns
            .filter(({ pattern }) => pattern.test(line))
            .map(({ label }) => `${path}:${index + 1} ${label}`);

        if (
            structured_findings.length === 0
            && has_credential_assignment(line, allow_source_expressions)
        ) {
            findings.push(`${path}:${index + 1} credential-assignment`);
        }

        return findings;
    });

    return [...structured_findings, ...line_findings];
}

const worktree_files = get_worktree_files();
const staged_files = get_staged_files();
const findings = worktree_files.flatMap((path) => {
    if (is_forbidden_path(path)) {
        return [`${path} forbidden-path`];
    }

    return scan_file(path, staged_files);
});

if (findings.length > 0) {
    process.stderr.write(`tracked-tree scan failed (${findings.length} finding(s))\n`);
    process.stderr.write(`${findings.join('\n')}\n`);
    process.exitCode = 1;
} else {
    process.stdout.write(`tracked-tree scan passed (${worktree_files.length} file(s))\n`);
}
