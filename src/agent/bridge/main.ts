import { is_bridge_healthy, parse_bridge_cli_args, parse_bridge_config, resolve_bridge_token } from './config';
import { create_bridge_server } from './server';

async function main(): Promise<void> {
    const raw_config = parse_bridge_cli_args(process.argv.slice(2));

    const host = raw_config.host || '127.0.0.1';
    const port = raw_config.port;

    if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Invalid bridge port');
    }

    const bridge_url = `http://${host}:${port}`;

    if (await is_bridge_healthy(bridge_url)) {
        process.stdout.write(`capture-all bridge already listening at ${bridge_url}\n`);
        return;
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

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
