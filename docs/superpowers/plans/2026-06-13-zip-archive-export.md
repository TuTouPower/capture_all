# ZIP 完整包导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 ZIP 完整包导出，使二进制响应体（GPT 图片等）被真正采集并以独立文件形式还原；保留现有 JSON/JSONL/HAR/HTML 为轻量导出。

**Architecture:** 采集层不再丢弃 CDP 二进制 body，记录 encoding/mime/byte_size 并受单一采集上限约束。新增 `archive_exporter` 模块组装 ZIP：小文本内联进各 jsonl，二进制与大文本落 `bodies/` 文件，附 README/manifest。ZIP 打包用成熟库 `fflate`，sha256 用 `crypto.subtle`。

**Tech Stack:** TypeScript strict、Chrome MV3、Vitest、`fflate`（zip 打包）、Web Crypto（sha256）。

**基准 spec:** `docs/superpowers/specs/2026-06-13-zip-archive-export-design.md`

---

## 约定

- 命名 `snake_case`，缩进 4 空格。
- 每个 task 独立 commit。
- 测试先 RED 再 GREEN。
- 运行单测：`npm test -- <文件>`；全量：`npm test`；构建：`npm run build`。

---

## 文件结构

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/shared/types.ts` | body encoding/bytes 字段、配置字段 | 修改 |
| `src/shared/constants.ts` | 默认配置、采集上限、内联阈值常量 | 修改 |
| `src/shared/body_routing.ts` | 判定 body 内联/落文件/省略 + mime→ext | 新建 |
| `src/shared/hash.ts` | sha256_hex | 新建 |
| `src/background/network_capture.ts` | 二进制不丢、记录 encoding/mime/byte_size、采集上限 | 修改 |
| `src/background/archive_exporter.ts` | 组装 ZIP 包 | 新建 |
| `src/background/service_worker.ts` | `export_archive` action | 修改 |
| `src/shared/export_settings.ts` | `.zip` 扩展名 | 修改（已支持任意 ext，验证） |
| `src/dashboard/dashboard.ts` | ZIP 导出入口 + 设置 UI | 修改 |
| `src/popup/popup.ts` | ZIP 导出入口 | 修改 |
| `src/detail/detail.ts` | ZIP 导出入口 | 修改 |
| `docs/TASKS.md` | 任务记录 | 修改 |

---

## Task 1: 引入 fflate 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 fflate**

Run:
```bash
npm install fflate@^0.8.2
```
Expected: `package.json` 的 `dependencies` 出现 `"fflate": "^0.8.2"`，`node_modules/fflate` 存在。

- [ ] **Step 2: 验证可导入**

Run:
```bash
node -e "const {zipSync}=require('fflate');const z=zipSync({'a.txt':new TextEncoder().encode('hi')});console.log('zip bytes',z.length>0)"
```
Expected: `zip bytes true`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 引入 fflate 用于 ZIP 导出"
```

---

## Task 2: 配置迁移（采集上限 + 内联阈值）

**Files:**
- Modify: `src/shared/constants.ts:22-23,37-38,51-52`
- Modify: `src/shared/types.ts:496-499,514-517`
- Test: `tests/archive_config.test.ts` (新建)

**说明:** 移除 `MAX_REQUEST_BODY_BYTES`/`MAX_RESPONSE_BODY_BYTES` 双上限，统一为 `MAX_BODY_CAPTURE_BYTES`(100MB) 与 `INLINE_TEXT_MAX_BYTES`(32KB)。`RecordConfig`/`UserConfig` 用 `max_body_capture_bytes` 与 `inline_text_max_bytes` 替换 `max_request_body_bytes`/`max_response_body_bytes`。

- [ ] **Step 1: 写失败测试**

Create `tests/archive_config.test.ts`:
```typescript
// tests/archive_config.test.ts — 配置迁移：采集上限 + 内联阈值
import { describe, it, expect } from 'vitest';
import {
    MAX_BODY_CAPTURE_BYTES,
    INLINE_TEXT_MAX_BYTES,
    DEFAULT_CONFIG,
    DEFAULT_USER_CONFIG,
} from '../src/shared/constants';

describe('body size config migration', () => {
    it('exposes 100MB capture ceiling and 32KB inline threshold', () => {
        expect(MAX_BODY_CAPTURE_BYTES).toBe(104857600);
        expect(INLINE_TEXT_MAX_BYTES).toBe(32768);
    });

    it('DEFAULT_CONFIG carries new fields and drops old ones', () => {
        expect(DEFAULT_CONFIG.max_body_capture_bytes).toBe(104857600);
        expect(DEFAULT_CONFIG.inline_text_max_bytes).toBe(32768);
        expect('max_request_body_bytes' in DEFAULT_CONFIG).toBe(false);
        expect('max_response_body_bytes' in DEFAULT_CONFIG).toBe(false);
    });

    it('DEFAULT_USER_CONFIG carries new fields and drops old ones', () => {
        expect(DEFAULT_USER_CONFIG.max_body_capture_bytes).toBe(104857600);
        expect(DEFAULT_USER_CONFIG.inline_text_max_bytes).toBe(32768);
        expect('max_request_body_bytes' in DEFAULT_USER_CONFIG).toBe(false);
        expect('max_response_body_bytes' in DEFAULT_USER_CONFIG).toBe(false);
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/archive_config.test.ts`
Expected: FAIL（`MAX_BODY_CAPTURE_BYTES` undefined）

- [ ] **Step 3: 改 constants.ts**

`src/shared/constants.ts` 第 22-23 行替换：
```typescript
export const MAX_BODY_CAPTURE_BYTES = 100 * 1024 * 1024; // 100MB 单 body 采集上限
export const INLINE_TEXT_MAX_BYTES = 32 * 1024; // 32KB 文本内联阈值
```
第 37-38 行（DEFAULT_CONFIG 内）替换：
```typescript
    max_body_capture_bytes: MAX_BODY_CAPTURE_BYTES,
    inline_text_max_bytes: INLINE_TEXT_MAX_BYTES,
```
第 51-52 行（DEFAULT_USER_CONFIG 内）替换：
```typescript
    max_body_capture_bytes: MAX_BODY_CAPTURE_BYTES,
    inline_text_max_bytes: INLINE_TEXT_MAX_BYTES,
```

- [ ] **Step 4: 改 types.ts**

`src/shared/types.ts` 第 498-499 行（`RecordConfig` 内）替换：
```typescript
    max_body_capture_bytes: number;
    inline_text_max_bytes: number;
```
第 516-517 行（`UserConfig` 内）替换：
```typescript
    max_body_capture_bytes: number;
    inline_text_max_bytes: number;
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test -- tests/archive_config.test.ts`
Expected: PASS

- [ ] **Step 6: 修复编译断点**

Run: `npm run build`
Expected: 报错列出仍引用 `max_request_body_bytes`/`max_response_body_bytes`/`MAX_REQUEST_BODY_BYTES`/`MAX_RESPONSE_BODY_BYTES` 的位置（network_capture.ts、redaction.ts、popup.ts、dashboard.ts、external_cdp_bridge_client.ts、body_capture_coordinator.ts、相关测试）。这些在后续 Task 3/7/8 处理；本步仅记录，不强求 build 绿。

- [ ] **Step 7: Commit**

```bash
git add src/shared/constants.ts src/shared/types.ts tests/archive_config.test.ts
git commit -m "refactor: 合并 body 上限为采集上限+内联阈值"
```

---

## Task 3: 采集层保存二进制 body

**Files:**
- Modify: `src/shared/types.ts:263-268`
- Modify: `src/background/network_capture.ts:298-311`
- Test: `tests/network_cdp.test.ts`（已存在，新增用例）

**说明:** `base64Encoded:true` 不再标 `unsupported_binary`，改为 `captured` 并记录 `response_body_encoding='base64'`。新增 body encoding/bytes 字段。采集上限改读 `config.max_body_capture_bytes`。

- [ ] **Step 1: 写失败测试**

在 `tests/network_cdp.test.ts` 的 `describe('CDP-first: primary record emission'` 内新增：
```typescript
    it('captures binary response as base64 with captured status', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: 'aGVsbG8=',
            base64Encoded: true,
        });
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'cdp_png',
                request: { url: 'https://example.com/i.png', method: 'GET', headers: {} },
                type: 'Image',
            }
        );
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'cdp_png' }
        );
        await new Promise(r => setTimeout(r, 20));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.response_body_status).toBe('captured');
        expect(emitted[0].data.response_body_encoding).toBe('base64');
        expect(emitted[0].data.response_body).toBe('aGVsbG8=');
    });
```
同时把现有 `'handles binary response as unsupported_binary'` 用例改名为 `'captures binary response (was unsupported_binary)'`，断言改为 `expect(emitted[0].data.response_body_status).toBe('captured')`、`expect(emitted[0].data.response_body_encoding).toBe('base64')`。

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/network_cdp.test.ts`
Expected: FAIL（`response_body_encoding` undefined / 仍是 unsupported_binary）

- [ ] **Step 3: 加类型字段**

`src/shared/types.ts` 第 263-268 行，在 body 字段块内补：
```typescript
    request_body: string | null;
    request_body_status: BodyCaptureStatus;
    request_body_encoding: 'utf8' | 'base64' | null;
    request_body_bytes: number | null;
    response_body: string | null;
    response_preview: string | null;
    response_body_status: BodyCaptureStatus;
    response_body_encoding: 'utf8' | 'base64' | null;
    response_body_bytes: number | null;
```

- [ ] **Step 4: 改采集逻辑**

`src/background/network_capture.ts` 第 298-311 行替换为：
```typescript
            let body_status: BodyCaptureStatus = 'cdp_failed';
            let body: string | null = null;
            let preview: string | null = null;
            let encoding: 'utf8' | 'base64' | null = null;
            let byte_size: number | null = null;

            if (!result || typeof result.body !== 'string') {
                logger.debug('get_body_failed', { req_id, reason: 'no_body_in_result' });
            } else if (result.base64Encoded) {
                byte_size = Math.floor(result.body.length * 3 / 4);
                if (byte_size > config.max_body_capture_bytes) {
                    body_status = 'too_large';
                } else {
                    body = result.body;
                    encoding = 'base64';
                    body_status = 'captured';
                }
            } else {
                byte_size = new TextEncoder().encode(result.body).length;
                if (byte_size > config.max_body_capture_bytes) {
                    body_status = 'too_large';
                } else {
                    const body_result = build_cdp_body_result(result.body, config.max_body_capture_bytes);
                    body = body_result.body;
                    preview = body_result.preview;
                    body_status = body_result.status;
                    encoding = 'utf8';
                }
            }

            const body_result: CdpBodyResult = { body, status: body_status, timestamp: Date.now(), preview, encoding, byte_size };
```

- [ ] **Step 5: 扩展 CdpBodyResult 与下游字段**

在 `src/background/network_capture.ts` 找到 `interface CdpBodyResult`（含 `body`/`status`/`timestamp`/`preview`），补两个可选字段：
```typescript
    encoding?: 'utf8' | 'base64' | null;
    byte_size?: number | null;
```
在 `build_cdp_primary_network_event`（构造 `NetworkRequestData` 的函数）与 `build_cdp_body_event` 内，写入新字段：
```typescript
    response_body_encoding: body_result.encoding ?? null,
    response_body_bytes: body_result.byte_size ?? null,
    request_body_encoding: null,
    request_body_bytes: meta?.request_body ? new TextEncoder().encode(meta.request_body).length : null,
```
（request body 当前仅文本路径，编码恒 utf8 时设 `request_body ? 'utf8' : null`；按实际构造处变量名调整。）

- [ ] **Step 6: 运行确认通过**

Run: `npm test -- tests/network_cdp.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/background/network_capture.ts tests/network_cdp.test.ts
git commit -m "feat: 采集二进制响应体为 base64 而非丢弃"
```

---

## Task 4: body 路由模块

**Files:**
- Create: `src/shared/body_routing.ts`
- Test: `tests/body_routing.test.ts` (新建)

**说明:** 纯函数判定 body 放置：`inline`/`file`/`omit`，并由 mime 推扩展名。

- [ ] **Step 1: 写失败测试**

Create `tests/body_routing.test.ts`:
```typescript
// tests/body_routing.test.ts — body 路由规则
import { describe, it, expect } from 'vitest';
import { plan_body, ext_for_mime, is_text_body } from '../src/shared/body_routing';

const INLINE = 32768;

describe('plan_body', () => {
    it('omits when status is too_large', () => {
        const p = plan_body({ encoding: 'base64', mime: 'image/png', byte_size: 999, status: 'too_large', has_body: false }, INLINE);
        expect(p.placement).toBe('omit');
    });

    it('omits when no body present', () => {
        const p = plan_body({ encoding: null, mime: null, byte_size: null, status: 'not_enabled', has_body: false }, INLINE);
        expect(p.placement).toBe('omit');
    });

    it('routes binary to file with mime ext', () => {
        const p = plan_body({ encoding: 'base64', mime: 'image/png', byte_size: 5000, status: 'captured', has_body: true }, INLINE);
        expect(p.placement).toBe('file');
        expect(p.ext).toBe('png');
    });

    it('routes large text to file', () => {
        const p = plan_body({ encoding: 'utf8', mime: 'text/html', byte_size: 40000, status: 'captured', has_body: true }, INLINE);
        expect(p.placement).toBe('file');
        expect(p.ext).toBe('html');
    });

    it('routes small text to inline', () => {
        const p = plan_body({ encoding: 'utf8', mime: 'application/json', byte_size: 100, status: 'captured', has_body: true }, INLINE);
        expect(p.placement).toBe('inline');
    });

    it('treats unknown mime without base64 as text', () => {
        const p = plan_body({ encoding: null, mime: 'application/json', byte_size: 10, status: 'captured', has_body: true }, INLINE);
        expect(p.placement).toBe('inline');
    });
});

describe('ext_for_mime', () => {
    it('maps known mimes', () => {
        expect(ext_for_mime('image/png')).toBe('png');
        expect(ext_for_mime('image/jpeg')).toBe('jpg');
        expect(ext_for_mime('font/woff2')).toBe('woff2');
        expect(ext_for_mime('application/json')).toBe('json');
    });
    it('falls back to bin', () => {
        expect(ext_for_mime('application/octet-stream')).toBe('bin');
        expect(ext_for_mime(null)).toBe('bin');
    });
});

describe('is_text_body', () => {
    it('base64 encoding is binary regardless of mime', () => {
        expect(is_text_body('base64', 'text/html')).toBe(false);
    });
    it('text mimes are text', () => {
        expect(is_text_body(null, 'text/css')).toBe(true);
        expect(is_text_body(null, 'image/svg+xml')).toBe(true);
        expect(is_text_body(null, 'application/ld+json')).toBe(true);
    });
    it('binary mimes are binary', () => {
        expect(is_text_body(null, 'image/png')).toBe(false);
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/body_routing.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现模块**

Create `src/shared/body_routing.ts`:
```typescript
// shared/body_routing.ts — 决定 body 内联进 jsonl / 落 bodies 文件 / 省略
import type { BodyCaptureStatus } from './types';

export type BodyEncoding = 'utf8' | 'base64';
export type BodyPlacement = 'inline' | 'file' | 'omit';

export interface BodyPlan {
    placement: BodyPlacement;
    ext: string | null;
}

const MIME_EXT: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'font/woff2': 'woff2',
    'application/font-woff2': 'woff2',
    'font/woff': 'woff',
    'application/json': 'json',
    'text/html': 'html',
    'text/css': 'css',
    'application/javascript': 'js',
    'text/javascript': 'js',
    'text/plain': 'txt',
};

export function ext_for_mime(mime: string | null): string {
    if (!mime) return 'bin';
    const base = mime.split(';')[0].trim().toLowerCase();
    if (MIME_EXT[base]) return MIME_EXT[base];
    if (base.endsWith('+json')) return 'json';
    if (base.endsWith('+xml')) return 'xml';
    return 'bin';
}

export function is_text_body(encoding: BodyEncoding | null, mime: string | null): boolean {
    if (encoding === 'base64') return false;
    if (!mime) return true;
    const base = mime.split(';')[0].trim().toLowerCase();
    if (base.startsWith('text/')) return true;
    if (base === 'application/json' || base === 'application/javascript') return true;
    if (base === 'image/svg+xml') return true;
    if (base.endsWith('+json') || base.endsWith('+xml')) return true;
    return false;
}

export function plan_body(
    opts: {
        encoding: BodyEncoding | null;
        mime: string | null;
        byte_size: number | null;
        status: BodyCaptureStatus;
        has_body: boolean;
    },
    inline_text_max_bytes: number,
): BodyPlan {
    if (opts.status === 'too_large' || !opts.has_body) {
        return { placement: 'omit', ext: null };
    }
    const text = is_text_body(opts.encoding, opts.mime);
    if (!text) {
        return { placement: 'file', ext: ext_for_mime(opts.mime) };
    }
    if ((opts.byte_size ?? 0) >= inline_text_max_bytes) {
        return { placement: 'file', ext: ext_for_mime(opts.mime) };
    }
    return { placement: 'inline', ext: null };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/body_routing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/body_routing.ts tests/body_routing.test.ts
git commit -m "feat: 新增 body 路由规则模块"
```

---

## Task 5: sha256 helper

**Files:**
- Create: `src/shared/hash.ts`
- Test: `tests/hash.test.ts` (新建)

- [ ] **Step 1: 写失败测试**

Create `tests/hash.test.ts`:
```typescript
// tests/hash.test.ts — sha256 十六进制
import { describe, it, expect } from 'vitest';
import { sha256_hex } from '../src/shared/hash';

describe('sha256_hex', () => {
    it('hashes empty input to known digest', async () => {
        const hex = await sha256_hex(new Uint8Array([]));
        expect(hex).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('hashes "abc" to known digest', async () => {
        const hex = await sha256_hex(new TextEncoder().encode('abc'));
        expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/hash.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

Create `src/shared/hash.ts`:
```typescript
// shared/hash.ts — sha256 十六进制摘要
export async function sha256_hex(data: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
    }
    return hex;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/hash.test.ts`
Expected: PASS（Node 18+ 提供 `crypto.subtle`）

- [ ] **Step 5: Commit**

```bash
git add src/shared/hash.ts tests/hash.test.ts
git commit -m "feat: 新增 sha256_hex 工具"
```

---

## Task 6: archive_exporter 组装 ZIP

**Files:**
- Create: `src/background/archive_exporter.ts`
- Test: `tests/archive_exporter.test.ts` (新建)

**说明:** 读取会话数据，逐 body 路由，组装 jsonl + bodies + manifest + capture.json + README，用 `fflate.zipSync` 打包返回 `Uint8Array`。数据读取复用 `exporter.ts` 同款 `get_*`。为可测，导出两个纯函数 `build_network_jsonl_line` 与 `render_readme`，再加整包 `export_archive`。

- [ ] **Step 1: 写失败测试**

Create `tests/archive_exporter.test.ts`:
```typescript
// tests/archive_exporter.test.ts — ZIP 组装核心
import { describe, it, expect } from 'vitest';
import { build_body_artifact, render_readme } from '../src/background/archive_exporter';

describe('build_body_artifact', () => {
    const INLINE = 32768;

    it('writes binary body to bodies/response file and returns ref + sha', async () => {
        const r = await build_body_artifact({
            request_id: 'req1',
            kind: 'response',
            body: 'aGVsbG8=',
            encoding: 'base64',
            mime: 'image/png',
            byte_size: 5,
            status: 'captured',
        }, INLINE);
        expect(r.ref).toBe('bodies/response/req1.png');
        expect(r.inline).toBeNull();
        expect(r.file).not.toBeNull();
        expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('inlines small text body', async () => {
        const r = await build_body_artifact({
            request_id: 'req2',
            kind: 'response',
            body: '{"ok":true}',
            encoding: 'utf8',
            mime: 'application/json',
            byte_size: 11,
            status: 'captured',
        }, INLINE);
        expect(r.ref).toBeNull();
        expect(r.inline).toBe('{"ok":true}');
        expect(r.file).toBeNull();
    });

    it('omits too_large body', async () => {
        const r = await build_body_artifact({
            request_id: 'req3',
            kind: 'response',
            body: null,
            encoding: null,
            mime: 'video/mp4',
            byte_size: 999999999,
            status: 'too_large',
        }, INLINE);
        expect(r.ref).toBeNull();
        expect(r.inline).toBeNull();
        expect(r.file).toBeNull();
    });
});

describe('render_readme', () => {
    it('includes counts and privacy warning', () => {
        const md = render_readme({ capture_id: 'cap1', network_count: 437, image_count: 7, event_count: 10 });
        expect(md).toContain('cap1');
        expect(md).toContain('437');
        expect(md).toContain('bodies/');
        expect(md.toLowerCase()).toContain('cookie');
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/archive_exporter.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 archive_exporter（核心函数）**

Create `src/background/archive_exporter.ts`:
```typescript
// background/archive_exporter.ts — ZIP 完整包导出
import { zipSync, strToU8 } from 'fflate';
import { get_capture, get_events_by_category, get_network_requests, get_console_events } from './storage';
import { load_user_config } from '../shared/user_config';
import { add_absolute_system_time, add_capture_system_times } from '../shared/system_time';
import { plan_body, ext_for_mime } from '../shared/body_routing';
import { sha256_hex } from '../shared/hash';
import type { NetworkRequestData } from '../shared/types';

interface BodyInput {
    request_id: string;
    kind: 'request' | 'response';
    body: string | null;
    encoding: 'utf8' | 'base64' | null;
    mime: string | null;
    byte_size: number | null;
    status: NetworkRequestData['response_body_status'];
}

interface BodyArtifact {
    inline: string | null;
    ref: string | null;
    file: { path: string; bytes: Uint8Array } | null;
    sha256: string | null;
    bytes: number | null;
    mime: string | null;
    status: string;
}

function b64_to_bytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export async function build_body_artifact(input: BodyInput, inline_text_max_bytes: number): Promise<BodyArtifact> {
    const plan = plan_body({
        encoding: input.encoding,
        mime: input.mime,
        byte_size: input.byte_size,
        status: input.status,
        has_body: input.body !== null,
    }, inline_text_max_bytes);

    const base: BodyArtifact = { inline: null, ref: null, file: null, sha256: null, bytes: input.byte_size, mime: input.mime, status: input.status };

    if (plan.placement === 'omit') return base;
    if (plan.placement === 'inline') return { ...base, inline: input.body };

    const ext = plan.ext ?? ext_for_mime(input.mime);
    const bytes = input.encoding === 'base64'
        ? b64_to_bytes(input.body as string)
        : strToU8(input.body as string);
    const ref = `bodies/${input.kind}/${input.request_id}.${ext}`;
    const sha = await sha256_hex(bytes);
    return { ...base, ref, file: { path: ref, bytes }, sha256: sha, bytes: bytes.length };
}

export function render_readme(info: { capture_id: string; network_count: number; image_count: number; event_count: number }): string {
    return [
        '# Capture All 采集包',
        '',
        '本文件夹是 Capture All（全采）浏览器扩展导出的一次网页采集记录。',
        '',
        `采集 ID：${info.capture_id}`,
        `网络请求：${info.network_count} 条（其中图片约 ${info.image_count} 张）`,
        `用户行为/事件：${info.event_count} 条`,
        '',
        '## 文件说明',
        '- `manifest.json`：包格式版本与文件清单。',
        '- `capture.json`：本次采集的时间、时区、配置、统计摘要。',
        '- `network.jsonl`：每行一条网络请求。',
        '- `events.jsonl` / `navigation.jsonl` / `console.jsonl` / `errors.jsonl` / `storage.jsonl` / `cookies.jsonl`：各类事件，每行一条。',
        '- `bodies/`：请求与响应的正文文件（图片、字体、大文本等）。',
        '',
        '## 怎么看网络请求',
        '用文本编辑器打开 `network.jsonl`，每行是一条请求的 JSON。',
        '',
        '## 怎么打开图片/附件',
        '某条请求若有 `response_body_ref`（如 `bodies/response/xxx.png`），',
        '到该路径下双击对应文件即可打开；图片就是真实图片文件。',
        '',
        '## 字段说明',
        '- 时间字段已按采集时设置的时区格式化。',
        '- `status_code`：HTTP 状态码。',
        '- `response_body_status`：`captured` 已保存正文；`too_large` 正文过大仅留信息；`not_enabled` 未启用正文采集。',
        '',
        '## 隐私警告',
        '本包可能包含 Cookie、Token、上传的图片、聊天内容等敏感信息，请勿随意分享。',
        '',
    ].join('\n');
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/archive_exporter.test.ts`
Expected: PASS

- [ ] **Step 5: 加整包 export_archive（追加到同文件末尾）**

在 `src/background/archive_exporter.ts` 追加：
```typescript
function network_line(req: NetworkRequestData, resp: BodyArtifact, reqb: BodyArtifact): string {
    return JSON.stringify({
        request_id: req.request_id,
        url: req.url,
        method: req.method,
        status_code: req.status_code,
        resource_type: req.resource_type,
        capture_method: req.capture_method,
        mime_type: req.mime_type,
        response_body_status: resp.status,
        response_body_ref: resp.ref,
        response_body_bytes: resp.bytes,
        response_body_sha256: resp.sha256,
        response_body: resp.inline,
        request_body_status: req.request_body_status,
        request_body_ref: reqb.ref,
        request_body_bytes: reqb.bytes,
        request_body_sha256: reqb.sha256,
        request_body: reqb.inline,
    });
}

export async function export_archive(capture_id: string): Promise<Uint8Array> {
    const capture = await get_capture(capture_id);
    if (!capture) throw new Error('Capture not found');

    const [user_events, nav_events, network_requests, console_logs, error_events, storage_changes, cookie_changes] = await Promise.all([
        get_events_by_category(capture_id, 'user_action', 0, 100000),
        get_events_by_category(capture_id, 'navigation', 0, 100000),
        get_network_requests(capture_id, 0, 100000),
        get_console_events(capture_id, 0, 100000),
        get_events_by_category(capture_id, 'error', 0, 100000),
        get_events_by_category(capture_id, 'storage', 0, 100000),
        get_events_by_category(capture_id, 'cookie', 0, 100000),
    ]);

    const user_config = await load_user_config();
    const inline_max = user_config.inline_text_max_bytes;
    const files: Record<string, Uint8Array> = {};

    const jsonl = (rows: unknown[]) => strToU8(rows.map((r) => JSON.stringify(add_absolute_system_time(r as never, user_config))).join('\n'));

    files['events.jsonl'] = jsonl(user_events);
    files['navigation.jsonl'] = jsonl(nav_events);
    files['console.jsonl'] = jsonl(console_logs);
    files['errors.jsonl'] = jsonl(error_events);
    files['storage.jsonl'] = jsonl(storage_changes);
    files['cookies.jsonl'] = jsonl(cookie_changes);

    const net_lines: string[] = [];
    let image_count = 0;
    for (const req of network_requests) {
        const resp = await build_body_artifact({
            request_id: req.request_id, kind: 'response',
            body: req.response_body, encoding: req.response_body_encoding,
            mime: req.mime_type, byte_size: req.response_body_bytes, status: req.response_body_status,
        }, inline_max);
        const reqb = await build_body_artifact({
            request_id: req.request_id, kind: 'request',
            body: req.request_body, encoding: req.request_body_encoding,
            mime: req.mime_type, byte_size: req.request_body_bytes, status: req.request_body_status,
        }, inline_max);
        if (resp.file) files[resp.file.path] = resp.file.bytes;
        if (reqb.file) files[reqb.file.path] = reqb.file.bytes;
        if (req.resource_type === 'image') image_count++;
        net_lines.push(network_line(req, resp, reqb));
    }
    files['network.jsonl'] = strToU8(net_lines.join('\n'));

    files['capture.json'] = strToU8(JSON.stringify(add_capture_system_times(capture, user_config), null, 2));
    files['manifest.json'] = strToU8(JSON.stringify({
        format: 'capture_all_archive',
        format_version: 1,
        capture_id,
        counts: {
            network: network_requests.length,
            events: user_events.length + nav_events.length + error_events.length + storage_changes.length + cookie_changes.length,
            console: console_logs.length,
            images: image_count,
        },
        files: Object.keys(files).sort(),
    }, null, 2));
    files['README.md'] = strToU8(render_readme({
        capture_id,
        network_count: network_requests.length,
        image_count,
        event_count: user_events.length + nav_events.length,
    }));

    return zipSync(files);
}
```

- [ ] **Step 6: 运行单测 + 构建**

Run: `npm test -- tests/archive_exporter.test.ts && npm run build`
Expected: 测试 PASS。build 可能仍因 Task 7/8 未完成而报错（network_capture/UI 旧字段），属预期。

- [ ] **Step 7: Commit**

```bash
git add src/background/archive_exporter.ts tests/archive_exporter.test.ts
git commit -m "feat: archive_exporter 组装 ZIP 完整包"
```

---

## Task 7: service_worker export_archive action

**Files:**
- Modify: `src/background/service_worker.ts:16,115-122`
- Test: `tests/archive_action.test.ts` (新建，源码审计)

- [ ] **Step 1: 写失败测试**

Create `tests/archive_action.test.ts`:
```typescript
// tests/archive_action.test.ts — SW 注册 export_archive
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sw = readFileSync(resolve(__dirname, '..', 'src/background/service_worker.ts'), 'utf8');

describe('export_archive action', () => {
    it('imports export_archive from archive_exporter', () => {
        expect(sw).toMatch(/import\s*\{\s*export_archive\s*\}\s*from\s*'.\/archive_exporter'/);
    });
    it('handles export_archive case returning archive bytes', () => {
        expect(sw).toMatch(/case 'export_archive'/);
        expect(sw).toMatch(/export_archive\(message\.session_id\)/);
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/archive_action.test.ts`
Expected: FAIL

- [ ] **Step 3: 改 service_worker.ts**

第 16 行 import 后追加：
```typescript
import { export_archive } from './archive_exporter';
```
第 121-122 行 `export_har` case 之后追加：
```typescript
        case 'export_archive': {
            const archive = await export_archive(message.session_id);
            return { success: true, archive: archive.buffer };
        }
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/archive_action.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/service_worker.ts tests/archive_action.test.ts
git commit -m "feat: SW 新增 export_archive action"
```

---

## Task 8: 修复采集层旧字段引用 + 设置 UI

**Files:**
- Modify: `src/background/network_capture.ts`（NetworkCaptureConfig 字段）
- Modify: `src/shared/redaction.ts`
- Modify: `src/background/external_cdp_bridge_client.ts`
- Modify: `src/background/body_capture_coordinator.ts`
- Modify: `src/popup/popup.ts`
- Modify: `src/dashboard/dashboard.ts`（设置 UI）
- Test: 更新 `tests/dashboard_config_sync.test.ts`、`tests/network_capture.test.ts`、`tests/redaction.test.ts`、`tests/external_cdp_bridge_client.test.ts`

**说明:** 把所有 `max_request_body_bytes`/`max_response_body_bytes` 引用统一改为 `max_body_capture_bytes`。设置页移除两个旧输入框，新增 `max_body_capture_bytes` 与 `inline_text_max_bytes` 数字框。

- [ ] **Step 1: 列出残留引用**

Run:
```bash
grep -rn "max_request_body_bytes\|max_response_body_bytes\|MAX_REQUEST_BODY_BYTES\|MAX_RESPONSE_BODY_BYTES" src tests
```
Expected: 列出待改清单。

- [ ] **Step 2: 改设置 UI 测试（RED）**

`tests/dashboard_config_sync.test.ts` 中，将断言 `max_request_body_bytes`/`max_response_body_bytes` 的项改为：
```typescript
        ['max_body_capture_bytes', '104857600'],
        ['inline_text_max_bytes', '32768'],
```
（沿用该文件既有的字段绑定遍历结构。）

- [ ] **Step 3: 运行确认失败**

Run: `npm test -- tests/dashboard_config_sync.test.ts`
Expected: FAIL

- [ ] **Step 4: 改源码**

- `src/background/network_capture.ts`：`NetworkCaptureConfig` 内 `max_request_body_bytes`/`max_response_body_bytes` 两字段替换为 `max_body_capture_bytes: number; inline_text_max_bytes: number;`；所有读取处改 `config.max_body_capture_bytes`。
- `src/shared/redaction.ts`：`truncate_request_body`/`truncate_response_body` 默认参数 `MAX_REQUEST_BODY_BYTES`/`MAX_RESPONSE_BODY_BYTES` 改为 `MAX_BODY_CAPTURE_BYTES`（import 调整）。
- `src/background/external_cdp_bridge_client.ts`：`max_response_body_bytes` 形参改名 `max_body_capture_bytes`。
- `src/background/body_capture_coordinator.ts`：传参 `config.max_response_body_bytes` 改 `config.max_body_capture_bytes`。
- `src/popup/popup.ts`：`get_record_config()` 内 body 限制字段改为 `max_body_capture_bytes: user_config.max_body_capture_bytes, inline_text_max_bytes: user_config.inline_text_max_bytes`。
- `src/dashboard/dashboard.ts`：设置页移除 `data-cfg="max_request_body_bytes"`/`max_response_body_bytes` 两个 input，新增：
```html
<input class="input mono" type="number" data-cfg="max_body_capture_bytes" min="1024" max="1073741824" step="1024">
<input class="input mono" type="number" data-cfg="inline_text_max_bytes" min="0" max="1048576" step="1024">
```
保存分支改为：
```typescript
else if (name === 'max_body_capture_bytes') await persist({ [name]: clamp_body_size_bytes(v, DEFAULT_USER_CONFIG.max_body_capture_bytes) } as Partial<UserConfig>);
else if (name === 'inline_text_max_bytes') await persist({ [name]: clamp_body_size_bytes(v, DEFAULT_USER_CONFIG.inline_text_max_bytes) } as Partial<UserConfig>);
```
（`clamp_body_size_bytes` 上限从 104857600 提升到 1073741824 以容纳 1GB 采集上限；保留下限 0 用于 inline，必要时单独 clamp。）

- 更新 `tests/network_capture.test.ts`、`tests/redaction.test.ts`、`tests/external_cdp_bridge_client.test.ts` 中对旧字段/默认值（1048576）的断言为 `max_body_capture_bytes` / `104857600`。

- [ ] **Step 5: 运行全量单测 + 构建**

Run: `npm test && npm run build`
Expected: 全部 PASS，build 绿，无残留旧字段引用。

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "refactor: 全链路改用采集上限并更新设置 UI"
```

---

## Task 9: 导出入口接入 ZIP

**Files:**
- Modify: `src/popup/popup.ts`、`src/dashboard/dashboard.ts`、`src/detail/detail.ts`
- Modify: `src/shared/export_settings.ts`（确认 `.zip` ext 允许）
- Test: `tests/archive_entry.test.ts` (新建，源码审计)

**说明:** 三个导出入口加入 `archive` 格式：发 `export_archive`，把返回的 ArrayBuffer 包成 Blob 下载，文件名 `.zip`，沿用 `track_export_dir('capture')`。

- [ ] **Step 1: 写失败测试**

Create `tests/archive_entry.test.ts`:
```typescript
// tests/archive_entry.test.ts — UI 接入 ZIP 导出
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('ZIP export entries', () => {
    it('dashboard sends export_archive and downloads zip', () => {
        const src = read('src/dashboard/dashboard.ts');
        expect(src).toMatch(/export_archive/);
        expect(src).toMatch(/\.zip/);
    });
    it('detail offers archive format', () => {
        const src = read('src/detail/detail.ts');
        expect(src).toMatch(/export_archive/);
    });
    it('popup can export archive', () => {
        const src = read('src/popup/popup.ts');
        expect(src).toMatch(/export_archive/);
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/archive_entry.test.ts`
Expected: FAIL

- [ ] **Step 3: 改 dashboard.ts**

`export_session` 内 action 选择处加入 archive 分支。在 `export_session(id, format)` 开头分流：
```typescript
    if (format === 'archive') {
        const r = await chrome.runtime.sendMessage({ action: 'export_archive', session_id: id });
        if (!r?.success || !r.archive) { alert('导出失败'); return; }
        const blob = new Blob([r.archive], { type: 'application/zip' });
        const { capture_dir } = await load_last_export_dirs();
        const filename = build_capture_filename({
            export_capture_directory: user_config.export_capture_directory,
            export_filename_template: user_config.export_filename_template,
            system_time_timezone: user_config.system_time_timezone,
        }, id, 'zip', capture_dir);
        const download_id = await download_blob(blob, filename, { save_as: true });
        track_export_dir(download_id, 'capture');
        return;
    }
```
导出格式下拉（`#dtExportFmt` 及列表导出按钮处）增加 `<option value="archive">ZIP 完整包</option>` 作为首选项。

- [ ] **Step 4: 改 detail.ts**

新增按钮处理：
```typescript
async function export_archive_zip(): Promise<void> {
    if (!is_extension) return;
    const response = await chrome.runtime.sendMessage({ action: 'export_archive', session_id });
    if (!response?.success || !response.archive) return;
    const blob = new Blob([response.archive], { type: 'application/zip' });
    const { capture_dir } = await load_last_export_dirs();
    const filename = build_capture_filename({
        export_capture_directory: user_config.export_capture_directory,
        export_filename_template: user_config.export_filename_template,
        system_time_timezone: user_config.system_time_timezone,
    }, session_id, 'zip', capture_dir);
    const download_id = await download_blob(blob, filename, { save_as: true });
    track_export_dir(download_id, 'capture');
}
```
并在 `setup_export()` 绑定（HTML 增加 `exportArchiveBtn` 按钮，详情页导出区域）：
```typescript
    document.getElementById('exportArchiveBtn')?.addEventListener('click', export_archive_zip);
```

- [ ] **Step 5: 改 popup.ts**

`#exportBtn` 改为发 `export_archive`（完成态主导出即完整包）：
```typescript
            const resp = await chrome.runtime.sendMessage({
                action: 'export_archive',
                session_id: finished_capture.capture_id,
            });
            if (resp?.success && resp.archive) {
                const blob = new Blob([resp.archive], { type: 'application/zip' });
                const { capture_dir } = await load_last_export_dirs();
                const filename = build_capture_filename(
                    {
                        export_capture_directory: user_config.export_capture_directory,
                        export_filename_template: user_config.export_filename_template,
                        system_time_timezone: user_config.system_time_timezone,
                    },
                    finished_capture.capture_id,
                    'zip',
                    capture_dir,
                );
                const download_id = await download_blob(blob, filename, { save_as: true });
                track_export_dir(download_id, 'capture');
            } else {
                logger.error('Export failed', resp?.error);
                alert(`${t('error')}: ${resp?.error ?? 'Export failed'}`);
            }
```
更新 `tests/popup_export.test.ts`：把断言 `export_json` 的用例改为 `export_archive`，并保留 `build_capture_filename` 断言。

- [ ] **Step 6: 运行单测 + 构建**

Run: `npm test -- tests/archive_entry.test.ts tests/popup_export.test.ts && npm run build`
Expected: PASS，build 绿。

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat: popup/dashboard/detail 接入 ZIP 完整包导出"
```

---

## Task 10: 文档收尾

**Files:**
- Modify: `docs/TASKS.md`
- Modify: `docs/superpowers/specs/2026-06-13-zip-archive-export-design.md`（标记已实现）

- [ ] **Step 1: 更新 TASKS.md**

在 `## P0 · 功能缺陷` 区追加条目：
```markdown
### ✅ P0.45 二进制响应体被丢弃 + 新增 ZIP 完整包导出
- **状态**：已修复 — 2026-06-13
- **详细设计**：`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md`
- **现象**：CDP 返回 base64Encoded 的图片/字体等二进制响应被标 unsupported_binary、body 置 null；单 JSON 承载大二进制导致导出内存爆且 grep 受污染。
- **修复**：采集层保存二进制为 base64；新增 ZIP 完整包导出（bodies/ 独立文件 + jsonl 引用 + README）；body 上限合并为采集上限(100MB)+内联阈值(32KB)。
- **影响文件**：network_capture.ts、archive_exporter.ts、body_routing.ts、hash.ts、service_worker.ts、types.ts、constants.ts、popup/dashboard/detail、设置 UI。
```

- [ ] **Step 2: 标记 spec 已实现**

`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md` 顶部 `**状态**：待实现` 改为 `**状态**：已实现 — 2026-06-13`。

- [ ] **Step 3: 全量验证**

Run: `npm test && npm run build`
Expected: 全部 PASS，build 绿。

- [ ] **Step 4: Commit**

```bash
git add docs/TASKS.md docs/superpowers/specs/2026-06-13-zip-archive-export-design.md
git commit -m "docs: 记录 P0.45 ZIP 导出完成"
```

---

## 自查清单（实现前确认）

- 配置字段全程一致：`max_body_capture_bytes` / `inline_text_max_bytes`（Task 2/3/8）。
- `build_body_artifact` 输入字段与 `NetworkRequestData` 新字段对应：`response_body_encoding` / `response_body_bytes` / `request_body_encoding` / `request_body_bytes`（Task 3/6）。
- `plan_body` 的 `BodyCaptureStatus` 来自 types，`too_large` 已是既有枚举值。
- ZIP 入口三处统一用 `build_capture_filename(..., 'zip', capture_dir)` + `track_export_dir('capture')`（Task 9），与 P0.40-R1 一致。
- `export_archive` 返回 `ArrayBuffer`，UI 用 `new Blob([archive])`（Task 7/9）。
