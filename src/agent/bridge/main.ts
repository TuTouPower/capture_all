import { parse_bridge_cli_args, parse_bridge_config } from './config';
import { create_bridge_server } from './server';

async function main(): Promise<void> {
    const raw_config = parse_bridge_cli_args(process.argv.slice(2));
    const config = parse_bridge_config(raw_config);
    const server = await create_bridge_server(config);

    process.stdout.write(`record-all bridge listening at ${server.url}\n`);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
