import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const project_root = resolve(__dirname, '..')

describe('popup detail URL', () => {
    it('opens the detail page at the built extension source path', () => {
        const popup_source = readFileSync(resolve(project_root, 'src/popup/popup.ts'), 'utf8')
        const match = popup_source.match(/chrome\.runtime\.getURL\(`([^`?]+)\?session=\$\{sessionId\}`\)/)

        expect(match?.[1]).toBe('src/detail/detail.html')
        expect(existsSync(resolve(project_root, match?.[1] ?? ''))).toBe(true)
    })
})
