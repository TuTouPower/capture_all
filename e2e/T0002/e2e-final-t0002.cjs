#!/usr/bin/env node
// e2e-final-t0002.cjs — T0002 E2E acceptance (feat/op-dev build)

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, 'artifacts/dist');
const OUTPUT_DIR = path.resolve(__dirname, 'docs/omni_powers/op_execution/acceptance/T0002/baselines');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function wait_for_sw_ready(context, popup_url) {
    const cp = await context.newPage();
    try {
        await cp.goto(popup_url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            try { const r = await cp.evaluate(() => chrome.runtime.sendMessage({ action: 'get_status' })); if (r) return; } catch {}
            await new Promise(r => setTimeout(r, 500));
        }
        throw new Error('SW not ready');
    } finally { await cp.close(); }
}

async function get_visible_marker_info(page) {
    return page.evaluate(() => {
        const markers = [];
        const all = document.querySelectorAll('.tl-tick,.tl-dot,.tl-diamond');
        all.forEach(el => {
            if (el.offsetParent === null) return;
            const r = el.getBoundingClientRect();
            markers.push({
                idx: el.getAttribute('data-event-idx'),
                cx: r.x + r.width / 2,
                cy: r.y + r.height / 2,
                top: r.y,
                left: r.x,
                w: r.width,
                h: r.height,
            });
        });
        return markers;
    });
}

async function ph_left(page) {
    return page.evaluate(() => { const p = document.getElementById('tlPlayhead'); return p ? p.style.left : null; });
}

async function insp_visible(page) {
    return page.evaluate(() => { const i = document.querySelector('.dt-insp'); return i ? i.offsetParent !== null : false; });
}

async function insp_text(page) {
    return page.evaluate(() => { const i = document.querySelector('.dt-insp'); return i ? (i.textContent || '') : ''; });
}

async function click_lanes_empty(page) {
    const box = await page.locator('#tlLanes').boundingBox();
    if (box) { await page.mouse.click(box.x + 10, box.y + 50); await page.waitForTimeout(500); }
}

async function click_at(page, cx, cy) {
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(800);
}

async function drag_from(page, sx, sy, dx_px) {
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.waitForTimeout(80);
    for (let i = 1; i <= 15; i++) {
        await page.mouse.move(sx + (dx_px * i) / 15, sy);
        await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(1500);
}

async function main() {
    console.log('[T0002] === E2E for T0002: Timeline Marker Click ===');
    const results = {};

    const context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-first-run', '--no-default-browser-check', '--disable-gpu',
        ],
        viewport: { width: 1280, height: 800 },
    });

    const sw = context.serviceWorkers()[0];
    const eid = sw ? sw.url().split('/')[2] : (await context.waitForEvent('serviceworker', { timeout: 30000 })).url().split('/')[2];
    console.log('[T0002] Extension:', eid);

    const popup_url = `chrome-extension://${eid}/src/popup/popup.html`;
    await wait_for_sw_ready(context, popup_url);

    let detail;
    try {
        // --- Capture ---
        const popup = await context.newPage();
        await popup.goto(popup_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await popup.waitForSelector('#startBtn', { state: 'visible', timeout: 5000 });
        await popup.waitForTimeout(300);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await context.newPage();
        await site.goto('https://www.baidu.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await site.waitForTimeout(4000);
        try {
            const kw = site.locator('#kw');
            if (await kw.isVisible({ timeout: 3000 }).catch(() => false)) {
                await kw.click();
                await kw.fill('t0002-test');
                await site.locator('#su').click();
                await site.waitForTimeout(5000);
            }
        } catch {}
        await site.close();

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(2000);
        try { await popup.waitForSelector('.act-done', { state: 'visible', timeout: 5000 }); } catch {}

        // --- Trace view ---
        const [dp] = await Promise.all([
            context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        detail = dp;
        await detail.waitForLoadState('domcontentloaded');
        await detail.waitForTimeout(2500);
        await popup.close();

        const first_row = detail.locator('.dt-row').first();
        if (await first_row.isVisible({ timeout: 3000 }).catch(() => false)) {
            await first_row.click();
            await detail.waitForTimeout(1500);
        }

        const trace_btn = detail.locator('[data-view="trace"]');
        if (await trace_btn.isVisible({ timeout: 2000 })) {
            await trace_btn.click();
            await detail.waitForTimeout(1000);
        }

        await detail.waitForSelector('#tlLanes', { state: 'visible', timeout: 5000 }).catch(() => {});
        await detail.waitForTimeout(1500);

        const markers = await get_visible_marker_info(detail);
        console.log('[T0002] Visible markers:', markers.length);
        markers.forEach((m, i) => console.log(`  [${i}] idx=${m.idx} cx=${m.cx.toFixed(0)} cy=${m.cy.toFixed(0)} top=${m.top.toFixed(0)}`));

        if (markers.length === 0) {
            for (const ac of ['AC-1','AC-2','AC-3','AC-4'])
                results[ac] = { result: 'INSUFFICIENT_EVIDENCE', reason: 'No visible markers' };
        } else {
            // Pick two markers at different Y (different lanes) for AC-3
            const m_a = markers[0];
            let m_b = markers.find(m => Math.abs(m.top - m_a.top) > 20) || markers.find(m => Math.abs(m.cx - m_a.cx) > 30) || (markers.length > 1 ? markers[1] : markers[0]);
            console.log(`[T0002] AC-3 pair: A idx=${m_a.idx} (top=${m_a.top.toFixed(0)}) B idx=${m_b.idx} (top=${m_b.top.toFixed(0)})`);

            // ═══ AC-1 ═══
            console.log('\n=== AC-1 ===');
            try {
                if (await insp_visible(detail)) await click_lanes_empty(detail);
                const ph_b = await ph_left(detail);
                await click_at(detail, m_a.cx, m_a.cy);
                const ph_a = await ph_left(detail);
                console.log('[AC-1] Playhead:', ph_b, '->', ph_a);
                results['AC-1'] = (ph_a && ph_b !== ph_a)
                    ? { result: 'PASS', evidence: `playhead moved: ${ph_b} -> ${ph_a}` }
                    : { result: 'FAIL', evidence: `no movement: ${ph_b} -> ${ph_a}` };
            } catch (e) {
                results['AC-1'] = { result: 'ERROR', reason: e.message };
            }
            console.log('[AC-1]', results['AC-1'].result);

            // ═══ AC-2 ═══
            console.log('\n=== AC-2 ===');
            try {
                if (await insp_visible(detail)) { await click_lanes_empty(detail); await detail.waitForTimeout(300); }
                await click_at(detail, m_a.cx, m_a.cy);
                const vis = await insp_visible(detail);
                const txt = await insp_text(detail);
                console.log('[AC-2] Visible:', vis, 'text_len:', txt.length);
                results['AC-2'] = (vis && txt.length > 5)
                    ? { result: 'PASS', evidence: 'inspector opened with content' }
                    : (vis ? { result: 'FAIL', evidence: 'inspector empty' } : { result: 'FAIL', evidence: 'not visible' });
            } catch (e) {
                results['AC-2'] = { result: 'ERROR', reason: e.message };
            }
            console.log('[AC-2]', results['AC-2'].result);

            // ═══ AC-3 ═══
            console.log('\n=== AC-3 ===');
            try {
                if (await insp_visible(detail)) { await click_lanes_empty(detail); await detail.waitForTimeout(300); }

                // Click marker A
                await click_at(detail, m_a.cx, m_a.cy);
                const txt_a = await insp_text(detail);
                console.log('[AC-3] A text:', txt_a.substring(0, 200));

                // Click marker B
                await click_at(detail, m_b.cx, m_b.cy);
                const txt_b = await insp_text(detail);
                console.log('[AC-3] B text:', txt_b.substring(0, 200));

                const same = txt_a === txt_b;
                console.log('[AC-3] Content same:', same);
                results['AC-3'] = !same
                    ? { result: 'PASS', evidence: 'switched' }
                    : { result: 'FAIL', evidence: `unchanged: idx=${m_a.idx} vs idx=${m_b.idx}` };
            } catch (e) {
                results['AC-3'] = { result: 'ERROR', reason: e.message };
            }
            console.log('[AC-3]', results['AC-3'].result);

            // ═══ AC-4 ═══
            console.log('\n=== AC-4 ===');
            try {
                if (await insp_visible(detail)) { await click_lanes_empty(detail); await detail.waitForTimeout(300); }

                console.log(`[AC-4] Dragging from (${m_a.cx.toFixed(0)},${m_a.cy.toFixed(0)})`);
                await drag_from(detail, m_a.cx, m_a.cy, 100);

                const iv = await insp_visible(detail);
                const ph = await ph_left(detail);
                console.log('[AC-4] Inspector:', iv, 'Playhead:', ph);
                results['AC-4'] = !iv
                    ? { result: 'PASS', evidence: 'inspector closed' }
                    : { result: 'FAIL', evidence: 'inspector opened during drag' };
            } catch (e) {
                results['AC-4'] = { result: 'ERROR', reason: e.message };
            }
            console.log('[AC-4]', results['AC-4'].result);
        }

        await detail.close();
    } catch (e) {
        console.error('[T0002] FATAL:', e.message);
    }

    await context.close();

    fs.writeFileSync(path.join(OUTPUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
    console.log('\n=== RESULTS ===');
    console.log(JSON.stringify(results, null, 2));
    console.log('\n=== SUMMARY ===');
    for (const [ac, r] of Object.entries(results)) console.log(`${ac}: ${r.result}`);

    const has_fail = Object.values(results).some(r => r.result === 'FAIL' || r.result === 'ERROR');
    process.exit(has_fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
