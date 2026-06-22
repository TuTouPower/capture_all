// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { clamp_body_size_bytes } from '../src/dashboard/dashboard_settings'

const project_root = resolve(__dirname, '..')
const src = readFileSync(resolve(project_root, 'src/dashboard/dashboard_settings.ts'), 'utf8')

describe('BUG-006: 采集上限 / 内联文本上限单位', () => {
    const BODY_MAX = 1024 * 1048576
    const INLINE_MAX = 1024 * 1024

    describe('字节 ↔ 显示单位 round-trip', () => {
        it('5242880 字节 → 5 MB → 保存回 5242880', () => {
            const display_mb = 5242880 / 1048576
            expect(display_mb).toBe(5)
            const saved = clamp_body_size_bytes(String(display_mb * 1048576), 5242880, BODY_MAX)
            expect(saved).toBe(5242880)
        })

        it('65536 字节 → 64 KB → 保存回 65536', () => {
            const display_kb = 65536 / 1024
            expect(display_kb).toBe(64)
            const saved = clamp_body_size_bytes(String(display_kb * 1024), 65536, INLINE_MAX)
            expect(saved).toBe(65536)
        })

        it('非整数 MB 会被 Math.round 四舍五入', () => {
            // 1536 * 1024 = 1572864 字节 = 1.5 MB
            const bytes = 1536 * 1024
            const display_mb = Math.round(bytes / 1048576)
            expect(display_mb).toBe(2) // 1.5 → 2
        })
    })

    describe('UI 约束验证', () => {
        it('采集上限最大 1024 MB（1 GB），保存不被夹', () => {
            const saved = clamp_body_size_bytes(String(1024 * 1048576), 5242880, BODY_MAX)
            expect(saved).toBe(1073741824)
        })

        it('内联文本上限最大 1024 KB（1 MB），保存不被夹', () => {
            const saved = clamp_body_size_bytes(String(1024 * 1024), 65536, INLINE_MAX)
            expect(saved).toBe(1048576)
        })

        it('超限值被夹到上限', () => {
            expect(clamp_body_size_bytes(String(2048 * 1048576), 5242880, BODY_MAX)).toBe(BODY_MAX)
            expect(clamp_body_size_bytes(String(2048 * 1024), 65536, INLINE_MAX)).toBe(INLINE_MAX)
        })

        it('非数字使用 fallback', () => {
            expect(clamp_body_size_bytes('abc', 5242880, BODY_MAX)).toBe(5242880)
        })

        it('负数返回 0', () => {
            expect(clamp_body_size_bytes('-100', 5242880, BODY_MAX)).toBe(0)
        })
    })
})

describe('BUG-007: 日志级别不与最大日志大小重叠', () => {
    it('日志级别 field 跨 2 列（span2）', () => {
        // render_settings 中日志级别 field 有 span2 class
        const match = src.match(/日志级别[\s\S]{0,200}span2|span2[\s\S]{0,200}日志级别/)
        expect(match).toBeTruthy()
    })
})

describe('BUG-008: 当前日志大小用 input 而非 span', () => {
    it('logSize 是 readonly input 元素', () => {
        // 渲染 HTML 中 logSize 是 input[readonly]，不是 span
        const input_match = src.match(/<input\s+id="logSize"[^>]*readonly/)
        expect(input_match).toBeTruthy()
    })

    it('wire_diagnostics_settings 对 logSize 赋 .value（非 .textContent）', () => {
        // 函数体内 logSize 用 .value = 赋值
        const fn_match = src.match(/function wire_diagnostics_settings[\s\S]*?^\}/m)
        expect(fn_match).toBeTruthy()
        expect(fn_match![0]).toMatch(/logSize[\s\S]*?\.value\s*=/)
        expect(fn_match![0]).not.toMatch(/logSize[\s\S]*?\.textContent\s*=/)
    })
})
