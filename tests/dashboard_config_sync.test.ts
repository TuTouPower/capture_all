import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const project_root = resolve(__dirname, '..')
// Settings moved out of the popup into the dashboard (main panel) per the design demo.
const dashboard_source = readFileSync(resolve(project_root, 'src/dashboard/dashboard.ts'), 'utf8')

describe('dashboard settings update in-memory user_config before save', () => {
    it('persist() merges the patch into user_config before save_user_config', () => {
        expect(dashboard_source).toMatch(
            /user_config\s*=\s*\{\s*\.\.\.user_config,\s*\.\.\.patch\s*\};[\s\S]*save_user_config\(patch\)/
        )
    })

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
        it(`settings UI binds the ${field} config field`, () => {
            const pattern = new RegExp(`(data-cfg="${field}"|sw\\('${field}'|seg\\('${field}')`)
            expect(dashboard_source).toMatch(pattern)
        })
    }

    it('body size config fields are persisted with clamped numbers', () => {
        expect(dashboard_source).toMatch(
            /name === 'max_body_capture_bytes'[\s\S]*clamp_body_size_bytes\(/
        )
        expect(dashboard_source).toMatch(
            /name === 'inline_text_max_bytes'[\s\S]*clamp_body_size_bytes\(/
        )
    })
})
