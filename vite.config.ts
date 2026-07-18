import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/extension/manifest.json';

export default defineConfig({
    define: {
        __BUILD_TIME__: JSON.stringify(new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().replace('T',' ').slice(0,19)),
    },
    plugins: [crx({ manifest })],
    build: {
        outDir: 'artifacts/dist',
    rollupOptions: {
            input: {
                background: 'src/extension/background/service_worker.ts',
                content: 'src/extension/content/content_script.ts',
                popup: 'src/extension/popup/popup.html',
                dashboard: 'src/extension/dashboard/dashboard.html',
                devtools: 'src/extension/devtools/devtools.html'
            }
        }
    }
});
