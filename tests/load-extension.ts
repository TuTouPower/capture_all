// tests/load-extension.ts
// Load the Record All extension into the existing Chrome on port 9223
import { chromium } from '@playwright/test';

const CDP_URL = 'http://localhost:9223';
const WSL_DIST_PATH = '\\\\wsl.localhost\\Ubuntu\\home\\karon\\karson_ubuntu\\record_all\\dist';

async function load_extension() {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];

    // Open chrome://extensions
    const page = await context.newPage();
    await page.goto('chrome://extensions');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Enable developer mode
    const devModeToggle = page.locator('extensions-toolbar').locator('#devMode');
    const isEnabled = await devModeToggle.isChecked();
    if (!isEnabled) {
        await devModeToggle.click();
        await page.waitForTimeout(1000);
    }
    console.log('Developer mode enabled');

    // Click "Load unpacked"
    const loadUnpacked = page.locator('#loadUnpacked');
    await loadUnpacked.click();
    await page.waitForTimeout(1000);

    // Note: The file dialog won't work via CDP automation
    // We need to use a different approach - use the Extensions API
    console.log('Load unpacked button clicked');
    console.log('Extension path:', WSL_DIST_PATH);
    console.log('');
    console.log('MANUAL STEP NEEDED:');
    console.log('In the file dialog, navigate to:');
    console.log('  \\\\wsl.localhost\\Ubuntu\\home\\karon\\karson_ubuntu\\record_all\\dist');
    console.log('Or use the Windows path equivalent of the dist folder.');

    await page.close();
    await browser.close();
}

load_extension().catch(console.error);
