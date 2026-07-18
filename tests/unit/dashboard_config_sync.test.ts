// @vitest-environment jsdom
// tests/dashboard_config_sync.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { clamp_body_size_bytes } from '../../src/extension/dashboard/dashboard_settings'

const project_root = resolve(__dirname, '..', '..')
const dashboard_source = readFileSync(resolve(project_root, 'src/extension/dashboard/dashboard_settings.ts'), 'utf8')

describe('settings 配置同步行为', () => {
    describe('persist 逻辑结构', () => {
        it('persist 先更新内存 user_config，再调用 save_user_config', () => {
            // 验证 persist 函数体内：先 spread 更新，再异步保存
            const persist_match = dashboard_source.match(
                /async function persist\(patch[^)]*\)[^{]*\{([\s\S]*?)\n\}/
            )
            expect(persist_match).toBeTruthy()
            const body = persist_match![1]
            const merge_pos = body.indexOf('...get_user_config()')
            const save_pos = body.indexOf('save_user_config')
            expect(merge_pos).toBeGreaterThan(-1)
            expect(save_pos).toBeGreaterThan(-1)
            expect(merge_pos).toBeLessThan(save_pos)
        })
    })

    describe('BUG-006: 采集上限保存行为', () => {
        const BODY_MAX = 1024 * 1048576   // 1GB
        const INLINE_MAX = 1024 * 1024    // 1MB

        it('输入 1024MB → 保存为 1073741824 字节', () => {
            // 模拟 UI 输入 1024 → change handler 乘 1048576 → clamp
            const result = clamp_body_size_bytes(String(1024 * 1048576), 5242880, BODY_MAX)
            expect(result).toBe(1073741824)
        })

        it('输入 1024KB → 保存为 1048576 字节', () => {
            const result = clamp_body_size_bytes(String(1024 * 1024), 65536, INLINE_MAX)
            expect(result).toBe(1048576)
        })

        it('输入 2048MB → 被夹到 1GB', () => {
            const result = clamp_body_size_bytes(String(2048 * 1048576), 5242880, BODY_MAX)
            expect(result).toBe(BODY_MAX)
        })

        it('输入 0KB → 保存为 0', () => {
            const result = clamp_body_size_bytes(String(0), 65536, INLINE_MAX)
            expect(result).toBe(0)
        })

        it('非数字输入 → 使用 fallback 默认值', () => {
            const result = clamp_body_size_bytes('abc', 5242880, BODY_MAX)
            expect(result).toBe(5242880)
        })
    })

    describe('设置字段绑定完整性', () => {
        const fields = [
            'redact_data',
            'system_time_timezone',
            'detail_time_display_mode',
            'export_capture_directory',
            'export_log_directory',
            'export_filename_template',
            'export_save_as',
            'max_body_capture_bytes',
            'inline_text_max_bytes',
        ]

        for (const field of fields) {
            it(`${field} 在设置 UI 中有绑定`, () => {
                const pattern = new RegExp(`(data-cfg="${field}"|sw\\('${field}'|seg\\('${field}')`)
                expect(dashboard_source).toMatch(pattern)
            })
        }
    })
})
