import { probe_bridge_health, type BridgeHealthStatus, parse_bridge_cli_args, parse_bridge_config, resolve_bridge_token } from './config';
import { create_bridge_server } from './server';
import { pathToFileURL } from 'node:url';

// t183 AC-004: --probe 子命令——SessionStart hook 复用同一探测逻辑（probe_bridge_health），
// 避免 shell 侧独立写「HTTP 200 即健康」的漂移逻辑。返回三态（不 exit，可测；exit 由入口处理）。
export async function run_bridge_probe(probe_url: string): Promise<BridgeHealthStatus> {
    return probe_bridge_health(probe_url);
}

export async function run_bridge_main(argv: string[] = process.argv.slice(2)): Promise<void> {
    // t183: --probe <url> 优先处理（hook 探测入口，不进入启动流程）
    const probe_index = argv.indexOf('--probe');
    if (probe_index !== -1) {
        const probe_url = argv[probe_index + 1];
        if (!probe_url) {
            throw new Error('--probe requires a bridge URL');
        }
        const status = await run_bridge_probe(probe_url);
        process.stdout.write(`${status}\n`);
        process.exit(status === 'healthy' ? 0 : status === 'occupied' ? 2 : 3);
        return;
    }

    const raw_config = parse_bridge_cli_args(argv);

    const host = raw_config.host || '127.0.0.1';
    const port = raw_config.port;

    if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Invalid bridge port');
    }

    const bridge_url = `http://${host}:${port}`;

    // t183 AC-003: 三态判定——本服务健康→already listening；2xx 非本服务→明确错误退出；
    // 不可达→正常启动。
    const health = await probe_bridge_health(bridge_url);
    if (health === 'healthy') {
        process.stdout.write(`capture-all bridge already listening at ${bridge_url}\n`);
        return;
    }
    if (health === 'occupied') {
        throw new Error(
            `Port ${port} is occupied by a non-capture-all service: GET ${bridge_url}/health returned 2xx but lacks capture-all identity. ` +
            'Refusing to treat it as a running bridge.',
        );
    }

    const resolved = await resolve_bridge_token(
        raw_config.token,
        process.env.CAPTURE_ALL_BRIDGE_TOKEN,
    );
    raw_config.token = resolved.token;

    const config = parse_bridge_config(raw_config);
    const server = await create_bridge_server(config);

    process.stdout.write(`capture-all bridge listening at ${server.url}\n`);
    if (resolved.source === 'generated') {
        process.stdout.write(`mcp token saved to ${resolved.file_path}\n`);
    }
}

// 入口：作为主模块直接运行时执行（测试 import 不触发）
const is_main = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (is_main) {
    run_bridge_main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
    });
}
