import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/extension/manifest.json';

export default defineConfig({
    define: {
        // T086: 使用 CI 注入的 SOURCE_DATE_EPOCH 或固定构建标识，避免每次构建值不同
        __BUILD_TIME__: JSON.stringify(
            process.env.SOURCE_DATE_EPOCH
                ? new Date(parseInt(process.env.SOURCE_DATE_EPOCH, 10) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' (UTC+8)'
                : new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' (UTC+8)'
        ),
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
