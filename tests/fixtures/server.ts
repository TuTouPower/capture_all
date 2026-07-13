import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 17832;
const FIXTURES_DIR = join(fileURLToPath(import.meta.url), '..');

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
};

function set_cors(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function send_json(res: ServerResponse, status: number, data: unknown): void {
    set_cors(res);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

async function serve_static(res: ServerResponse, pathname: string): Promise<void> {
    const file_path = join(FIXTURES_DIR, pathname.replace(/^\//, ''));

    try {
        const info = await stat(file_path);
        if (!info.isFile()) {
            send_json(res, 404, { error: 'not_found' });
            return;
        }

        const ext = extname(file_path).toLowerCase();
        const content_type = MIME_TYPES[ext] || 'application/octet-stream';
        const content = await readFile(file_path);

        set_cors(res);
        res.writeHead(200, { 'Content-Type': content_type, 'Content-Length': content.length });
        res.end(content);
    } catch {
        send_json(res, 404, { error: 'not_found' });
    }
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
        set_cors(res);
        res.writeHead(204);
        res.end();
        return;
    }

    if (pathname === '/api/test' && req.method === 'GET') {
        send_json(res, 200, { status: 'ok', message: 'E2E_API_MARKER' });
        return;
    }

    if (pathname === '/api/echo' && req.method === 'GET') {
        send_json(res, 200, { echo: url.searchParams.get('data') || '' });
        return;
    }

    serve_static(res, pathname);
});

server.listen(PORT, () => {
    console.log(`E2E test server running at http://localhost:${PORT}`);
});
