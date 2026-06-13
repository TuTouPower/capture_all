# ZIP 完整包导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 ZIP 完整包导出，使二进制响应体（GPT 图片等）被真正采集并以独立文件形式还原；保留现有 JSON/JSONL/HAR/HTML 为轻量导出。

**Architecture:** 采集层不再丢弃 CDP 二进制 body，记录 encoding/mime/byte_size 并受单一采集上限约束。页面侧模块 `archive_builder` 接收 `get_capture_data` 返回的完整结构化数据，用 fflate `zipSync` 一次性组装 ZIP（小文本内联进各 jsonl，二进制与大文本落 `bodies/` 文件，附 README/manifest），v1 接受非流式 + 页面内存打包。sha256 用 `crypto.subtle`，base64 用 `atob`。

**Tech Stack:** TypeScript strict、Chrome MV3、Vitest、`fflate`（zip 打包）、Web Crypto（sha256）。

**基准 spec:** `docs/superpowers/specs/2026-06-13-zip-archive-export-design.md`

---

## 约定

- 命名 `snake_case`，缩进 4 空格。
- 每个 task 独立 commit（仅在用户要求时执行提交步骤）。
- 测试先 RED 再 GREEN。
- 运行单测：`npm test -- <文件>`；全量：`npm test`；构建：`npm run build`。

---

## 文件结构

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/shared/types.ts` | body encoding/bytes/mime 字段、配置字段 | 修改 |
| `src/shared/constants.ts` | 默认配置、采集上限、内联阈值常量 | 修改 |
| `src/shared/body_routing.ts` | 判定 body 内联/落文件/省略 + mime→ext + safe_id | 新建 |
| `src/shared/hash.ts` | sha256_hex | 新建 |
| `src/background/network_capture.ts` | 二进制不丢、记录 encoding/mime/byte_size、采集上限、base64 精确解码长度 | 修改 |
| `src/shared/archive_builder.ts` | 接收 CaptureData，组装 ZIP 包（页面侧） | 新建 |
| `src/shared/export_settings.ts` | `.zip` 扩展名 | 确认 |
| `src/dashboard/dashboard.ts` | ZIP 导出入口 + 设置 UI | 修改 |
| `src/popup/popup.ts` | ZIP 导出入口 | 修改 |
| `src/detail/detail.ts` | ZIP 导出入口 | 修改 |
| `docs/TASKS.md` | 任务记录 | 修改 |

删除项：
- `src/background/archive_exporter.ts` — 不存在（spec v1 改页面侧后不再需要 SW 构建模块）。
- SW `export_archive` action — 不新增（复用已有 `get_capture_data` 通道）。

---

## Task 1: 引入 fflate 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 fflate**

```bash
npm install fflate@^0.8.2
```

Expected: `package.json` 的 `dependencies` 出现 `"fflate": "^0.8.2"`，`node_modules/fflate` 存在。

- [ ] **Step 2: 验证可导入**

```bash
node -e "const {zipSync,strToU8}=require('fflate');const z=zipSync({'a.txt':strToU8('hi')});console.log('zip bytes',z.length>0)"
```

Expected: `zip bytes true`

- [ ] **Step 3: Commit**（仅在用户要求时执行）

```bash
git add package.json package-lock.json
git commit -m "chore: 引入 fflate 用于 ZIP 导出（页面侧打包）"
```

---

## Task 2: 配置迁移（采集上限 + 内联阈值）

**Files:**
- Modify: `src/shared/constants.ts:22-23,37-38,51-52`
- Modify: `src/shared/types.ts:496-499,514-517`
- Test: `tests/archive_config.test.ts` (新建)

- [ ] **Step 1: 写失败测试**

Create `tests/archive_config.test.ts`:

```typescript
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

```bash
npm test -- tests/archive_config.test.ts
```

Expected: FAIL（`MAX_BODY_CAPTURE_BYTES` undefined）

- [ ] **Step 3: 改 constants.ts**

`src/shared/constants.ts` 第 22-23 行替换为：

```typescript
export const MAX_BODY_CAPTURE_BYTES = 100 * 1024 * 1024; // 100MB 单 body 采集上限
export const INLINE_TEXT_MAX_BYTES = 32 * 1024; // 32KB 文本内联阈值
```

第 37-38 行（`DEFAULT_CONFIG` 内）替换：

```typescript
    max_body_capture_bytes: MAX_BODY_CAPTURE_BYTES,
    inline_text_max_bytes: INLINE_TEXT_MAX_BYTES,
```

第 51-52 行（`DEFAULT_USER_CONFIG` 内）替换：

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

```bash
npm test -- tests/archive_config.test.ts
```

Expected: PASS

- [ ] **Step 6: 检查编译断点**

```bash
npm run build 2>&1 | grep -E "error|max_request_body_bytes|max_response_body_bytes" || echo "build check done"
```

Expected: 报出仍引用旧字段的位置（network_capture.ts、redaction.ts、popup.ts、dashboard.ts、external_cdp_bridge_client.ts、body_capture_coordinator.ts、相关测试）。这些在后续 Task 3/7 处理；本步仅记录，不强求 build 绿。

- [ ] **Step 7: Commit**（仅在用户要求时执行）

```bash
git add src/shared/constants.ts src/shared/types.ts tests/archive_config.test.ts
git commit -m "refactor: 合并 body 上限为采集上限+内联阈值"
```

---

## Task 3: 采集层保存二进制 body + request body 独立 mime

**Files:**
- Modify: `src/shared/types.ts:263-268`
- Modify: `src/background/network_capture.ts:298-311`
- Test: `tests/network_cdp.test.ts`（已存在，新增/修改用例）

- [ ] **Step 1: 写失败测试**

在 `tests/network_cdp.test.ts` 的 `describe('CDP-first: primary record emission'` 内新增用例：

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
        expect(emitted[0].data.response_body_bytes).toBe(5);
    });

    it('marks binary exceeding ceiling as too_large, preserves encoding', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: 'A'.repeat(2000000),
            base64Encoded: true,
        });
        await setup_capture({ max_body_capture_bytes: 1024 });

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'cdp_big',
                request: { url: 'https://example.com/big.jpg', method: 'GET', headers: {} },
                type: 'Image',
            }
        );
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'cdp_big' }
        );
        await new Promise(r => setTimeout(r, 20));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.response_body_status).toBe('too_large');
        expect(emitted[0].data.response_body_encoding).toBe('base64');
        expect(emitted[0].data.response_body).toBeNull();
        expect(emitted[0].data.response_body_bytes).toBeGreaterThan(0);
    });
```

修改现有 `'handles binary response as unsupported_binary'` 用例：
- 测试名改为 `'captures binary response (was unsupported_binary)'`。
- 断言改为 `expect(emitted[0].data.response_body_status).toBe('captured')`、`expect(emitted[0].data.response_body_encoding).toBe('base64')`。

- [ ] **Step 2: 运行确认失败**

```bash
npm test -- tests/network_cdp.test.ts
```

Expected: FAIL（`response_body_encoding` undefined / 仍是 unsupported_binary）

- [ ] **Step 3: 加类型字段**

在 `src/shared/types.ts` 的 `NetworkRequestData` 接口内（第 263-268 行附近），于既有 body 字段后补入：

```typescript
    request_body_encoding: 'utf8' | 'base64' | null;
    request_body_bytes: number | null;
    request_body_mime: string | null;
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
                byte_size = base64_decoded_size(result.body);
                encoding = 'base64';
                if (byte_size > config.max_body_capture_bytes) {
                    body_status = 'too_large';
                } else {
                    body = result.body;
                    body_status = 'captured';
                }
            } else {
                byte_size = new TextEncoder().encode(result.body).length;
                encoding = 'utf8';
                if (byte_size > config.max_body_capture_bytes) {
                    body_status = 'too_large';
                } else {
                    const body_result = build_cdp_body_result(result.body, config.max_body_capture_bytes);
                    body = body_result.body;
                    preview = body_result.preview;
                    body_status = body_result.status;
                }
            }

            const body_result: CdpBodyResult = { body, status: body_status, timestamp: Date.now(), preview, encoding, byte_size };
```

在同文件顶部追加 `base64_decoded_size` 工具函数：

```typescript
function base64_decoded_size(b64: string): number {
    const trimmed = b64.replace(/\s/g, '');
    const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
    return Math.floor(trimmed.length * 3 / 4) - padding;
}
```

- [ ] **Step 5: 扩展 CdpBodyResult 与下游字段**

找到 `CdpBodyResult` interface，补：

```typescript
    encoding?: 'utf8' | 'base64' | null;
    byte_size?: number | null;
```

在 `build_cdp_primary_network_event` 和 `build_cdp_body_event` 两处构造内写入新字段：

```typescript
    response_body_encoding: body_result.encoding ?? null,
    response_body_bytes: body_result.byte_size ?? null,
    request_body_encoding: meta?.request_body ? 'utf8' : null,
    request_body_bytes: meta?.request_body ? new TextEncoder().encode(meta.request_body).length : null,
    request_body_mime: meta?.request_body_mime ?? null,
```

`CdpRequestMeta` interface 新增：

```typescript
    request_body_mime?: string | null;
```

在 `Network.requestWillBeSent` handler 中提取 request body mime：

```typescript
    const req_headers = (params.request?.headers || {}) as Record<string, string>;
    const request_body_mime = (req_headers['content-type'] || req_headers['Content-Type']) ?? null;
```

存入 meta 时带上：

```typescript
    cdp_request_meta.set(req_id, {
        ...
        request_body_mime,
    });
```

- [ ] **Step 6: 运行确认通过**

```bash
npm test -- tests/network_cdp.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**（仅在用户要求时执行）

```bash
git add src/shared/types.ts src/background/network_capture.ts tests/network_cdp.test.ts
git commit -m "feat: 采集二进制响应体为 base64 而非丢弃，增加 request body mime"
```

---

## Task 4: body 路由模块

**Files:**
- Create: `src/shared/body_routing.ts`
- Test: `tests/body_routing.test.ts` (新建)

- [ ] **Step 1: 写失败测试**

Create `tests/body_routing.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { plan_body, ext_for_mime, is_text_body, safe_request_id } from '../src/shared/body_routing';

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
    });
});

describe('safe_request_id', () => {
    it('preserves alphanumeric dot dash underscore', () => {
        expect(safe_request_id('abc.123_xyz-0')).toBe('abc.123_xyz-0');
    });
    it('replaces special chars', () => {
        expect(safe_request_id('req/123:test!')).toBe('req_123_test_');
    });
    it('deduplicates conflicts', () => {
        const used = new Set<string>();
        expect(safe_request_id('a', used)).toBe('a');
        used.add('a');
        expect(safe_request_id('a', used)).toBe('a_2');
        used.add('a_2');
        expect(safe_request_id('a', used)).toBe('a_3');
    });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm test -- tests/body_routing.test.ts
```

Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现模块**

Create `src/shared/body_routing.ts`:

```typescript
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

export function safe_request_id(id: string, used?: Set<string>): string {
    let safe = '';
    for (const ch of id) {
        if (/[a-zA-Z0-9._-]/.test(ch)) {
            safe += ch;
        } else {
            safe += '_';
        }
    }
    if (!safe) safe = 'unknown';
    if (!used) return safe;
    let candidate = safe;
    let n = 2;
    while (used.has(candidate)) {
        candidate = `${safe}_${n}`;
        n++;
    }
    used.add(candidate);
    return candidate;
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npm test -- tests/body_routing.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**（仅在用户要求时执行）

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

```bash
npm test -- tests/hash.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现**

Create `src/shared/hash.ts`:

```typescript
export async function sha256_hex(data: Uint8Array): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
    }
    return hex;
}
```

**测试环境注意**：若 Vitest 运行环境缺少 `globalThis.crypto.subtle`（低版本 Node），在 `tests/hash.test.ts` 顶部加 polyfill：

```typescript
// polyfill for Node < 22
if (!globalThis.crypto?.subtle) {
    const { webcrypto } = require('node:crypto');
    (globalThis as any).crypto = webcrypto;
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npm test -- tests/hash.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**（仅在用户要求时执行）

```bash
git add src/shared/hash.ts tests/hash.test.ts
git commit -m "feat: 新增 sha256_hex 工具"
```

---

## Task 6: archive_builder 组装 ZIP（页面侧）

**Files:**
- Create: `src/shared/archive_builder.ts`
- Test: `tests/archive_builder.test.ts` (新建)

**说明:** 接收 `get_capture_data` 返回的完整结构化数据（`CaptureData`），在页面侧用 `fflate.zipSync` 一次性打包。为可测，导出辅助函数 `build_network_jsonl_line` 和 `render_readme`，以及整包 `build_archive`。

- [ ] **Step 1: 理解输入数据格式**

`build_archive` 的输入来自 `chrome.runtime.sendMessage({ action: 'get_capture_data', session_id })` 的返回值。该接口返回包含 `capture`、`events`、`network_requests`、`console_events` 的对象，与既有的 `ExportableCaptureData` 结构一致。测试时直接构造此对象。

- [ ] **Step 2: 写失败测试**

Create `tests/archive_builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { build_network_jsonl_line, render_readme, build_archive } from '../src/shared/archive_builder';
import { strFromU8, unzipSync } from 'fflate';
import type { NetworkRequestData, CaptureRecord } from '../src/shared/types';

function make_req(overrides: Partial<NetworkRequestData> = {}): NetworkRequestData {
    return {
        request_id: 'req1',
        url: 'https://example.com/api',
        method: 'GET',
        status_code: 200,
        status_text: null,
        protocol: null,
        resource_type: 'xhr',
        initiator: null,
        duration_ms: 100,
        start_time_ms: 1000,
        end_time_ms: 1100,
        request_headers: { 'content-type': 'application/json' },
        response_headers: { 'content-type': 'application/json' },
        headers_status: 'captured',
        request_body: null,
        request_body_status: 'not_enabled',
        request_body_encoding: null,
        request_body_bytes: null,
        request_body_mime: null,
        response_body: '{"ok":true}',
        response_preview: '{"ok":true}',
        response_body_status: 'captured',
        response_body_encoding: 'utf8',
        response_body_bytes: 11,
        mime_type: 'application/json',
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'cdp_primary',
        body_capture_mode: 'extension_cdp',
        url_status: 'captured',
        ...overrides,
    };
}

function make_capture(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
    return {
        capture_id: 'cap1',
        name: 'test',
        status: 'completed',
        started_at: '2026-06-13T00:00:00.000Z',
        ended_at: '2026-06-13T00:01:00.000Z',
        duration_ms: 60000,
        stats: { event_count: 1, nav_count: 0, request_count: 1, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, user_action_count: 0 },
        ...overrides,
    } as CaptureRecord;
}

const INLINE = 32768;

describe('build_network_jsonl_line', () => {
    it('inlines small text body', async () => {
        const req = make_req();
        const line = await build_network_jsonl_line(req, INLINE);
        const parsed = JSON.parse(line);
        expect(parsed.response_body).toBe('{"ok":true}');
        expect(parsed.response_body_ref).toBeNull();
        expect(parsed.url).toBe('https://example.com/api');
        expect(parsed.method).toBe('GET');
        expect(parsed.status_code).toBe(200);
    });

    it('writes binary body to file ref', async () => {
        const req = make_req({
            response_body: 'aGVsbG8=',
            response_body_encoding: 'base64',
            response_body_bytes: 5,
            mime_type: 'image/png',
            resource_type: 'image',
        });
        const line = await build_network_jsonl_line(req, INLINE);
        const parsed = JSON.parse(line);
        expect(parsed.response_body).toBeNull();
        expect(parsed.response_body_ref).toContain('bodies/response/req1.png');
        expect(parsed.response_body_sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('preserves all existing fields (headers, timing, etc.)', async () => {
        const req = make_req();
        const line = await build_network_jsonl_line(req, INLINE);
        const parsed = JSON.parse(line);
        expect(parsed.request_headers).toEqual({ 'content-type': 'application/json' });
        expect(parsed.response_headers).toEqual({ 'content-type': 'application/json' });
        expect(parsed.duration_ms).toBe(100);
        expect(parsed.capture_method).toBe('cdp_primary');
        expect(parsed.initiator).toBeNull();
    });
});

describe('render_readme', () => {
    it('includes counts and privacy warning', () => {
        const md = render_readme({ capture_id: 'cap1', network_count: 437, image_count: 7, event_count: 10 });
        expect(md).toContain('cap1');
        expect(md).toContain('437');
        expect(md).toContain('bodies/');
        expect(md.toLowerCase()).toContain('cookie');
        expect(md).toContain('captured');
        expect(md).toContain('too_large');
    });
});

describe('build_archive', () => {
    it('produces valid zip with manifest, README, and jsonl files', async () => {
        const archive = await build_archive({
            capture: make_capture(),
            events: [],
            network_requests: [make_req()],
            console_events: [],
        }, { inline_text_max_bytes: INLINE, system_time_timezone: 'browser' });
        const unzipped = unzipSync(archive);
        expect(unzipped['manifest.json']).toBeDefined();
        expect(unzipped['README.md']).toBeDefined();
        expect(unzipped['network.jsonl']).toBeDefined();
        const manifest = JSON.parse(strFromU8(unzipped['manifest.json']));
        expect(manifest.format).toBe('capture_all_archive');
        expect(manifest.counts.network).toBe(1);
    });

    it('creates bodies/ entries for binary content', async () => {
        const archive = await build_archive({
            capture: make_capture(),
            events: [],
            network_requests: [make_req({
                response_body: 'aGVsbG8=',
                response_body_encoding: 'base64',
                response_body_bytes: 5,
                mime_type: 'image/png',
                resource_type: 'image',
            })],
            console_events: [],
        }, { inline_text_max_bytes: INLINE, system_time_timezone: 'browser' });
        const unzipped = unzipSync(archive);
        const png_path = Object.keys(unzipped).find(k => k.startsWith('bodies/response/') && k.endsWith('.png'));
        expect(png_path).toBeDefined();
        expect(unzipped[png_path!].length).toBe(5);
    });
});
```

- [ ] **Step 3: 运行确认失败**

```bash
npm test -- tests/archive_builder.test.ts
```

Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 archive_builder**

Create `src/shared/archive_builder.ts`:

```typescript
import { zipSync, strToU8 } from 'fflate';
import { plan_body } from './body_routing';
import { sha256_hex } from './hash';
import type { NetworkRequestData, CaptureRecord, RecordEvent, ConsoleLog } from './types';
import { add_absolute_system_time, add_capture_system_times } from './system_time';

interface ArchiveInput {
    capture: CaptureRecord;
    events: RecordEvent[];
    network_requests: NetworkRequestData[];
    console_events: ConsoleLog[];
}

interface ArchiveOptions {
    inline_text_max_bytes: number;
    system_time_timezone: string;
}

function b64_to_bytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export async function build_network_jsonl_line(
    req: NetworkRequestData,
    inline_text_max_bytes: number,
): Promise<string> {
    const result: Record<string, unknown> = { ...req };

    const resp_plan = plan_body(
        {
            encoding: req.response_body_encoding ?? null,
            mime: req.mime_type,
            byte_size: req.response_body_bytes,
            status: req.response_body_status,
            has_body: req.response_body !== null,
        },
        inline_text_max_bytes,
    );
    if (resp_plan.placement === 'file' && req.response_body) {
        const ext = resp_plan.ext ?? 'bin';
        const bytes = req.response_body_encoding === 'base64'
            ? b64_to_bytes(req.response_body)
            : strToU8(req.response_body);
        result.response_body = null;
        result.response_body_ref = `bodies/response/${req.request_id}.${ext}`;
        result.response_body_bytes = bytes.length;
        result.response_body_sha256 = await sha256_hex(bytes);
    } else if (resp_plan.placement === 'omit') {
        result.response_body = null;
    }

    const req_plan = plan_body(
        {
            encoding: req.request_body_encoding ?? null,
            mime: req.request_body_mime ?? null,
            byte_size: req.request_body_bytes,
            status: req.request_body_status,
            has_body: req.request_body !== null,
        },
        inline_text_max_bytes,
    );
    if (req_plan.placement === 'file' && req.request_body) {
        const ext = req_plan.ext ?? 'bin';
        const bytes = req.request_body_encoding === 'base64'
            ? b64_to_bytes(req.request_body)
            : strToU8(req.request_body);
        result.request_body = null;
        result.request_body_ref = `bodies/request/${req.request_id}.${ext}`;
        result.request_body_bytes = bytes.length;
        result.request_body_sha256 = await sha256_hex(bytes);
    } else if (req_plan.placement === 'omit') {
        result.request_body = null;
    }

    return JSON.stringify(result);
}

export function render_readme(info: {
    capture_id: string;
    network_count: number;
    image_count: number;
    event_count: number;
}): string {
    return [
        '# Capture All 采集包',
        '',
        '本文件夹是 Capture All（全采）浏览器扩展导出的一次网页采集记录。',
        '',
        `采集 ID：${info.capture_id}`,
        `网络请求：${info.network_count} 条（其中图片约 ${info.image_count} 张）`,
        `事件：${info.event_count} 条`,
        '',
        '## 文件说明',
        '- `manifest.json` — 包格式版本与文件清单',
        '- `capture.json` — 本次采集的时间、时区、配置、统计摘要',
        '- `network.jsonl` — 每行一条网络请求',
        '- `events.jsonl` — 用户行为等事件',
        '- `console.jsonl` — 控制台日志',
        '- `bodies/` — 请求与响应的正文文件（图片、字体、大文本等）',
        '',
        '## 怎么看网络请求',
        '用文本编辑器打开 `network.jsonl`，每行是一条请求的 JSON。',
        '',
        '## 怎么打开图片/附件',
        '某条请求若有 `response_body_ref`（如 `bodies/response/xxx.png`），',
        '到该路径下双击对应文件即可打开；图片就是真实图片文件。',
        '',
        '## 字段说明',
        '- 时间字段已按采集时设置的时区格式化',
        '- `status_code`：HTTP 状态码',
        '- `response_body_status`：`captured` 已保存正文；`too_large` 正文过大仅留信息；',
        '  `not_enabled` 未启用正文采集；`cdp_failed` 获取失败；`unsupported_binary` 无法判定的编码',
        '',
        '## 隐私警告',
        '本包可能包含 Cookie、Token、上传的图片、聊天内容等敏感信息，请勿随意分享。',
        '',
    ].join('\n');
}

export async function build_archive(
    input: ArchiveInput,
    options: ArchiveOptions,
): Promise<Uint8Array> {
    const { capture, events, network_requests, console_events } = input;
    const { inline_text_max_bytes, system_time_timezone } = options;
    const files: Record<string, Uint8Array> = {};

    const add_file = (path: string, content: Uint8Array) => {
        if (files[path]) {
            const base = path.replace(/\.[^.]+$/, '');
            const ext = path.split('.').pop() ?? 'bin';
            let n = 2;
            while (files[`${base}_${n}.${ext}`]) n++;
            files[`${base}_${n}.${ext}`] = content;
        } else {
            files[path] = content;
        }
    };

    let image_count = 0;
    const net_lines: string[] = [];
    for (const req of network_requests) {
        const line = await build_network_jsonl_line(req, inline_text_max_bytes);
        const parsed = JSON.parse(line);
        if (req.resource_type === 'image') image_count++;

        const resp_body = req.response_body;
        const resp_encoding = req.response_body_encoding;
        if (parsed.response_body_ref && resp_body) {
            const bytes = resp_encoding === 'base64' ? b64_to_bytes(resp_body) : strToU8(resp_body);
            add_file(parsed.response_body_ref, bytes);
        }
        const req_body = req.request_body;
        const req_encoding = req.request_body_encoding;
        if (parsed.request_body_ref && req_body) {
            const bytes = req_encoding === 'base64' ? b64_to_bytes(req_body) : strToU8(req_body);
            add_file(parsed.request_body_ref, bytes);
        }

        net_lines.push(line);
    }
    files['network.jsonl'] = strToU8(net_lines.join('\n'));

    files['events.jsonl'] = strToU8(events.map(e => JSON.stringify(add_absolute_system_time(e, { system_time_timezone } as any))).join('\n'));
    files['console.jsonl'] = strToU8(console_events.map(c => JSON.stringify(add_absolute_system_time(c, { system_time_timezone } as any))).join('\n'));

    files['capture.json'] = strToU8(JSON.stringify(add_capture_system_times(capture, { system_time_timezone } as any), null, 2));

    files['manifest.json'] = strToU8(JSON.stringify({
        format: 'capture_all_archive',
        format_version: 1,
        capture_id: capture.capture_id,
        counts: {
            network: network_requests.length,
            events: events.length,
            console: console_events.length,
            images: image_count,
        },
        files: Object.keys(files).sort(),
    }, null, 2));

    const event_count = events.length;
    files['README.md'] = strToU8(render_readme({
        capture_id: capture.capture_id,
        network_count: network_requests.length,
        image_count,
        event_count,
    }));

    return zipSync(files);
}
```

- [ ] **Step 5: 运行确认通过**

```bash
npm test -- tests/archive_builder.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**（仅在用户要求时执行）

```bash
git add src/shared/archive_builder.ts tests/archive_builder.test.ts
git commit -m "feat: archive_builder 页面侧组装 ZIP 完整包"
```

---

## Task 7: 修复采集层旧字段引用 + 设置 UI

**Files:**
- Modify: `src/background/network_capture.ts`（NetworkCaptureConfig 字段）
- Modify: `src/shared/redaction.ts`
- Modify: `src/background/external_cdp_bridge_client.ts`
- Modify: `src/background/body_capture_coordinator.ts`
- Modify: `src/popup/popup.ts`
- Modify: `src/dashboard/dashboard.ts`（设置 UI）
- Test: 更新 `tests/dashboard_config_sync.test.ts`、`tests/network_capture.test.ts`、`tests/redaction.test.ts`、`tests/external_cdp_bridge_client.test.ts`

- [ ] **Step 1: 列出残留引用**

```bash
grep -rn "max_request_body_bytes\|max_response_body_bytes\|MAX_REQUEST_BODY_BYTES\|MAX_RESPONSE_BODY_BYTES" src tests
```

Expected: 列出待改清单（network_capture.ts、redaction.ts、popup.ts、dashboard.ts、external_cdp_bridge_client.ts、body_capture_coordinator.ts、及对应测试）。

- [ ] **Step 2: 改设置 UI 测试（RED）**

`tests/dashboard_config_sync.test.ts` 中，将断言 `max_request_body_bytes`/`max_response_body_bytes` 的项改为：

```typescript
        ['max_body_capture_bytes', '104857600'],
        ['inline_text_max_bytes', '32768'],
```

- [ ] **Step 3: 运行确认失败**

```bash
npm test -- tests/dashboard_config_sync.test.ts
```

Expected: FAIL

- [ ] **Step 4: 改源码**

- `src/background/network_capture.ts`：`NetworkCaptureConfig` 内 `max_request_body_bytes`/`max_response_body_bytes` 两字段替换为 `max_body_capture_bytes: number; inline_text_max_bytes: number;`；所有读取处改 `config.max_body_capture_bytes`。
- `src/shared/redaction.ts`：`truncate_request_body`/`truncate_response_body` 默认参数 `MAX_REQUEST_BODY_BYTES`/`MAX_RESPONSE_BODY_BYTES` 改为 `MAX_BODY_CAPTURE_BYTES`（import 调整）。
- `src/background/external_cdp_bridge_client.ts`：`max_response_body_bytes` 形参改名 `max_body_capture_bytes`。
- `src/background/body_capture_coordinator.ts`：传参 `config.max_response_body_bytes` 改 `config.max_body_capture_bytes`。
- `src/popup/popup.ts`：`get_record_config()` 内 body 限制字段改为：

```typescript
    max_body_capture_bytes: user_config.max_body_capture_bytes,
    inline_text_max_bytes: user_config.inline_text_max_bytes,
```

- `src/dashboard/dashboard.ts`：设置页移除 `data-cfg="max_request_body_bytes"`/`max_response_body_bytes` 两个 input，新增：

```html
<input class="input mono" type="number" data-cfg="max_body_capture_bytes"
    min="1024" max="1073741824" step="1024">
<input class="input mono" type="number" data-cfg="inline_text_max_bytes"
    min="0" max="1048576" step="1024">
```

保存分支改为：

```typescript
else if (name === 'max_body_capture_bytes') await persist({
    [name]: clamp_body_size_bytes(v, DEFAULT_USER_CONFIG.max_body_capture_bytes)
} as Partial<UserConfig>);
else if (name === 'inline_text_max_bytes') await persist({
    [name]: clamp_body_size_bytes(v, DEFAULT_USER_CONFIG.inline_text_max_bytes)
} as Partial<UserConfig>);
```

- 更新 `tests/network_capture.test.ts`、`tests/redaction.test.ts`、`tests/external_cdp_bridge_client.test.ts` 中对旧字段/默认值（1048576）的断言为新字段名/新默认值（104857600）。更新 `tests/network_cdp.test.ts` 中 `make_cfg()` 默认值。

- [ ] **Step 5: 运行全量单测 + 构建**

```bash
npm test && npm run build
```

Expected: 全部 PASS，build 绿。任何残留旧字段引用在此步暴露并修正。

- [ ] **Step 6: Commit**（仅在用户要求时执行）

```bash
git add src tests
git commit -m "refactor: 全链路改用采集上限并更新设置 UI"
```

---

## Task 8: 导出入口接入 ZIP

**Files:**
- Modify: `src/dashboard/dashboard.ts`
- Modify: `src/popup/popup.ts`
- Modify: `src/detail/detail.ts`
- Modify: `src/shared/export_settings.ts`（确认 `.zip` ext 允许）
- Test: `tests/archive_entry.test.ts` (新建，源码审计)

- [ ] **Step 1: 写失败测试**

Create `tests/archive_entry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('ZIP export entries', () => {
    it('dashboard sends get_capture_data and builds archive', () => {
        const src = read('src/dashboard/dashboard.ts');
        expect(src).toMatch(/build_archive\(/);
        expect(src).toMatch(/archive_builder/);
        expect(src).toMatch(/\.zip/);
    });
    it('detail offers archive format', () => {
        const src = read('src/detail/detail.ts');
        expect(src).toMatch(/archive_builder/);
    });
    it('popup can export archive', () => {
        const src = read('src/popup/popup.ts');
        expect(src).toMatch(/build_archive\(/);
    });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm test -- tests/archive_entry.test.ts
```

Expected: FAIL

- [ ] **Step 3: 改 popup.ts（主导出改 ZIP）**

`src/popup/popup.ts` 第 9-10 行 import 追加：

```typescript
import { build_archive } from '../shared/archive_builder';
```

`#exportBtn` handler 改为：

```typescript
            const resp = await chrome.runtime.sendMessage({
                action: 'get_capture_data',
                session_id: finished_capture.capture_id,
            });
            if (resp?.capture) {
                const archive = await build_archive(resp, {
                    inline_text_max_bytes: user_config.inline_text_max_bytes,
                    system_time_timezone: user_config.system_time_timezone,
                });
                const blob = new Blob([archive], { type: 'application/zip' });
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

更新 `tests/popup_export.test.ts`：把断言 `action: 'export_json'` 的用例改为 `action: 'get_capture_data'`，并保留 `build_capture_filename` 与 `download_blob` 断言。

- [ ] **Step 4: 改 dashboard.ts**

`src/dashboard/dashboard.ts` import 追加：

```typescript
import { build_archive } from '../shared/archive_builder';
```

`export_session` 内追加 archive 分支（在 `format === 'archive'` 判断块）：

```typescript
    const action_map: Record<string, string> = {
        archive: 'get_capture_data',
        html: 'export_html', har: 'export_har', jsonl: 'export_jsonl', json: 'export_json',
    };
    if (format === 'archive') {
        const r = await chrome.runtime.sendMessage({ action: 'get_capture_data', session_id: id });
        if (!r?.capture) { alert('导出失败'); return; }
        const archive = await build_archive(r, {
            inline_text_max_bytes: user_config.inline_text_max_bytes,
            system_time_timezone: user_config.system_time_timezone,
        });
        const blob = new Blob([archive], { type: 'application/zip' });
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

导出格式下拉（`#dtExportFmt`）加：

```html
<option value="archive">ZIP 完整包</option>
```

作为首选项。列表批量导出 `data-export` 也需识别 archive。

- [ ] **Step 5: 改 detail.ts**

`src/detail/detail.ts` import 追加：

```typescript
import { build_archive } from '../shared/archive_builder';
```

新增 `export_archive_zip` 函数并绑定 HTML 按钮：

```typescript
async function export_archive_zip(): Promise<void> {
    if (!is_extension) return;
    const response = await chrome.runtime.sendMessage({ action: 'get_capture_data', session_id });
    if (!response?.capture) return;
    const archive = await build_archive(response, {
        inline_text_max_bytes: user_config.inline_text_max_bytes,
        system_time_timezone: user_config.system_time_timezone,
    });
    const blob = new Blob([archive], { type: 'application/zip' });
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

- [ ] **Step 6: 确认 .zip 扩展名**

```bash
grep "ExportExtension" src/shared/export_settings.ts
```

确认 `ExportExtension` 允许 `'zip'`。若限定为 `'json' | 'jsonl' | 'html' | 'har'`，追加 `| 'zip'`。

- [ ] **Step 7: 运行单测 + 构建**

```bash
npm test -- tests/archive_entry.test.ts tests/popup_export.test.ts && npm run build
```

Expected: PASS，build 绿。

- [ ] **Step 8: Commit**（仅在用户要求时执行）

```bash
git add src tests
git commit -m "feat: popup/dashboard/detail 接入 ZIP 完整包导出"
```

---

## Task 9: 文档收尾

**Files:**
- Modify: `docs/TASKS.md`
- Modify: `docs/superpowers/specs/2026-06-13-zip-archive-export-design.md`（标记已实现—实现后执行）

- [ ] **Step 1: 更新 TASKS.md**

在 `## P0 · 功能缺陷` 区追加：

```markdown
### P0.45 二进制响应体被丢弃 + 新增 ZIP 完整包导出
- **详细设计**：`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md`
- **实施计划**：`docs/superpowers/plans/2026-06-13-zip-archive-export.md`
- **现象**：CDP 返回 base64Encoded 的图片/字体等二进制响应被标 unsupported_binary、body 置 null；单 JSON 承载大二进制导致导出内存爆且 grep 受污染。
- **修复**：采集层保存二进制为 base64；新增 ZIP 完整包导出（bodies/ 独立文件 + jsonl 引用 + README，页面侧组装）；body 上限合并为采集上限(100MB)+内联阈值(32KB)。
- **影响文件**：network_capture.ts、archive_builder.ts、body_routing.ts、hash.ts、types.ts、constants.ts、popup/dashboard/detail、设置 UI。
```

- [ ] **Step 2: 标记 spec 已实现**（全部实现完成后）

`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md` 顶部 `**状态**：待实现` 改为 `**状态**：已实现 — 2026-06-13`。

- [ ] **Step 3: 全量验证**

```bash
npm test && npm run build
```

Expected: 全部 PASS，build 绿。

- [ ] **Step 4: Commit**（仅在用户要求时执行）

```bash
git add docs/TASKS.md docs/superpowers/specs/2026-06-13-zip-archive-export-design.md
git commit -m "docs: 记录 P0.45 ZIP 导出完成"
```

---

## 自查清单

- `build_archive` 输入来自 SW `get_capture_data` 返回值（Task 6/8），与既有 `ExportableCaptureData` 同结构。
- `build_network_jsonl_line` 以 `{ ...req }` 展开保留全部既有字段，再覆盖 body/ref（Task 6 实现），满足 review MED #4。
- request body 使用 `request_body_mime`（独立字段，Task 3），满足 review HIGH #3。
- `too_large` 时 `encoding` 保留不置 null（Task 3 实现），满足 review MED #6。
- `safe_request_id` 处理 conflict（Task 4 实现），满足 review MED #5。
- `base64_decoded_size` 含 padding 修正（Task 3 实现），满足 review HIGH #4。
- ZIP 在页面侧用 `fflate.zipSync` 打包（Task 6），用户进程内存预算高于 SW；v1 不宣称流式。满足 review HIGH #1/#2。
- 分页限制：`get_capture_data` 无 limit，全量读取；manifest 计数反映实际条数。满足 review MED #3。
- `atob`/`crypto.subtle` 在测试环境按需 polyfill（Task 5/6 文档说明），满足 review MED #1/#2。
- Commit 步骤标注"仅在用户要求时执行"，满足 review MED #7。
