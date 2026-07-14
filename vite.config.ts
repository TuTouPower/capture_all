import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
    define: {
        __BUILD_TIME__: JSON.stringify(new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().replace('T',' ').slice(0,19)),
    },
    plugins: [crx({ manifest })],
    build: {
        outDir: 'artifacts/dist',
    rollupOptions: {
            input: {
                background: 'src/background/service_worker.ts',
                content: 'src/content/content_script.ts',
                popup: 'src/popup/popup.html',
                dashboard: 'src/dashboard/dashboard.html',
                devtools: 'src/devtools/devtools.html'
            }
        }
    }
});
