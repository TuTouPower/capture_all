import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
    plugins: [crx({ manifest })],
    build: {
        rollupOptions: {
            input: {
                background: 'background/service_worker.ts',
                content: 'content/content_script.ts',
                popup: 'popup/popup.html',
                detail: 'detail/detail.html',
                devtools: 'devtools/devtools.html',
                devtools_panel: 'devtools/devtools_panel.html'
            }
        }
    }
});
