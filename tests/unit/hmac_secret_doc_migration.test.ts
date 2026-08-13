// tests/unit/hmac_secret_doc_migration.test.ts
// t174 AC-001~004: HMAC secret 文档/注释与 combined 契约一致性
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project_root = resolve(__dirname, '..', '..');
const spec = readFileSync(resolve(project_root, 'docs/specs/content_postmessage_nonce.md'), 'utf8');
const preamble_src = readFileSync(resolve(project_root, 'src/extension/content/content_page_script.ts'), 'utf8');
const network_hook_src = readFileSync(resolve(project_root, 'src/extension/content/network_hook.ts'), 'utf8');
const storage_src = readFileSync(resolve(project_root, 'src/extension/content/storage_capture.ts'), 'utf8');
const websocket_src = readFileSync(resolve(project_root, 'src/extension/content/websocket_capture.ts'), 'utf8');

describe('HMAC secret 文档迁移（t174）', () => {
    it('AC-001: spec 定义 combined 契约（nonce + per-start secret + per-message HMAC）', () => {
        expect(spec).toContain('per-message HMAC');
        expect(spec).toContain('per-start secret');
        expect(spec).toContain('canonical payload');
        // 拒绝规则：缺失/畸形/失配/过期签名
        expect(spec).toContain('缺失签名');
        expect(spec).toContain('畸形签名');
        expect(spec).toContain('签名不匹配');
        expect(spec).toContain('nonce 过期');
        // secret 非 window 暴露
        expect(spec).toContain('非 `window` 暴露');
    });

    it('AC-002: 注入注释明确残余风险（观察注入过程的对抗页面可读 secret）', () => {
        expect(preamble_src).toContain('残余风险');
        expect(preamble_src).toContain('ADR-020');
        expect(preamble_src).toContain('对抗页面');
    });

    it('AC-004a: 三通道注释不宣称可对抗观察注入的页面（普通页面限定）', () => {
        // 注释须含「普通页面」限定，且不出现无条件的「页面脚本无法读取」
        for (const src of [network_hook_src, storage_src, websocket_src]) {
            expect(src).toContain('普通页面');
            expect(src).not.toMatch(/页面脚本无法读取[^（(]*。/);
        }
    });

    it('AC-004b: 威胁模型边界与 ADR-020 一致（排除对抗页面）', () => {
        expect(preamble_src).toContain('威胁模型排除');
        expect(preamble_src).toContain('观察注入过程的');
    });
});
