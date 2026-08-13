// tests/unit/docs_drift_consistency.test.ts
// t191 AC-001~005: 文档漂移修复的一致性静态检查——以源码/配置为唯一来源，
// 断言 docs 不再宣称已删除结构/字段/模型，链接 fragment 真实存在。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('t191 AC-001: contributing_dev.md 与当前仓库一致', () => {
    const src = read('docs/guides/contributing_dev.md');

    it('无旧目录引用（src/agent / src/background / tests/fixtures）', () => {
        expect(src).not.toMatch(/src\/agent/);
        expect(src).not.toMatch(/src\/background/);
        expect(src).not.toMatch(/tests\/fixtures/);
    });

    it('含当前结构（node_shared / tests 分层）与完整 build 链', () => {
        expect(src).toMatch(/node_shared/);
        expect(src).toMatch(/tests\/\{unit,e2e,support,repo_template\}|tests\/unit/);
        expect(src).toMatch(/copy:locales/);
        expect(src).toMatch(/build:zip/);
    });

    it('示例命令可运行（npm test / bridge --port）', () => {
        expect(src).toMatch(/npm test/);
        expect(src).toMatch(/npm run build/);
        expect(src).toMatch(/--port 17831|17831/);
    });
});

describe('t191 AC-002: docs/guides/test.md 与当前测试/构建一致', () => {
    const src = read('docs/guides/test.md');

    it('目录结构为 tests/{unit,e2e,support,repo_template} 且 unit 非旧计数', () => {
        expect(src).toMatch(/tests\/\{unit,e2e,support,repo_template\}|tests\/unit/);
        expect(src).toMatch(/tests\/e2e/);
        expect(src).not.toMatch(/约 80 个文件|80 个文件/);
    });

    it('构建链含 copy:locales/build:zip；e2e server 路径正确', () => {
        expect(src).toMatch(/copy:locales/);
        expect(src).toMatch(/build:zip/);
        expect(src).toMatch(/tests\/support\/fixtures\/server\.ts/);
        expect(src).not.toMatch(/tests\/fixtures\/server\.ts/);
    });

    it('MCP 注册为 .mcp.json.example 形态且工具数 17', () => {
        expect(src).toMatch(/pathToFileURL/);
        expect(src).toMatch(/CLAUDE_PROJECT_DIR/);
        expect(src).toMatch(/17 个工具|17 个|17 tools/);
        expect(src).not.toMatch(/12 个工具/);
    });
});

describe('t191 AC-003: domain.md 不再宣称已删除类型/字段', () => {
    const src = read('docs/blueprint/domain.md');

    it('Session/RecordEvent 类型与 capture_mode 字段标记为已删除', () => {
        expect(src).not.toMatch(/`Session` \/ `RecordEvent` 类型保留为 `@deprecated` 兼容层/);
        expect(src).not.toMatch(/`capture_mode` 字段值域保持/);
        expect(src).toMatch(/已删除（t191 核实/);
        expect(src).toMatch(/无 `Session`\/`RecordEvent`\/`capture_mode` 符号/);
    });
});

describe('t191 AC-004: 英文 README/PRIVACY two-token 模型与 SECURITY.md 一致', () => {
    it('README.en 无共享 user-token 旧表述', () => {
        const src = read('README.en.md');
        expect(src).not.toMatch(/must use the same token/);
        expect(src).not.toMatch(/user-supplied token/);
        expect(src).toMatch(/two-token/);
        expect(src).toMatch(/instance token, independent of the MCP token/);
    });

    it('PRIVACY 无 user-provided Bearer token 旧表述', () => {
        const src = read('PRIVACY.md');
        expect(src).not.toMatch(/user-provided Bearer token/);
        expect(src).toMatch(/two-token model/);
        expect(src).toMatch(/SECURITY\.md/);
    });
});

describe('t191 AC-005: Privacy fragment 链接指向真实存在的 README 锚点', () => {
    it('PRIVACY 链接的 README.en fragment 锚点存在', () => {
        const privacy = read('PRIVACY.md');
        const readme_en = read('README.en.md');
        const m = privacy.match(/README\.en\.md#([a-z0-9-]+)/);
        expect(m).not.toBeNull();
        const anchor = m![1];
        // GitHub 风格锚点：小写、空格→-、去标点
        const headings = [...readme_en.matchAll(/^#{1,6}\s+(.+)$/gm)].map((h) =>
            h[1].trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
        );
        expect(headings).toContain(anchor);
    });

    it('文档链接目标文件存在（public_docs 既有检查覆盖，此处补 fragment 层）', () => {
        const privacy = read('PRIVACY.md');
        expect(privacy).toMatch(/\[README\.en\.md\]\(README\.en\.md#/);
    });
});
