import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
    plugins: [crx({ manifest })],
    build: {
        outDir: 'artifacts/dist',
    rollupOptions: {
            input: {
                background: 'src/background/service_worker.ts',
                content: 'src/content/content_script.ts',
                popup: 'src/popup/popup.html',
                detail: 'src/detail/detail.html',
                dashboard: 'src/dashboard/dashboard.html',
                devtools: 'src/devtools/devtools.html',
                devtools_panel: 'src/devtools/devtools_panel.html'
            }
        }
    }
});
