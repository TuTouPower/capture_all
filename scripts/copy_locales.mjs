// Copy src/extension/_locales/ into artifacts/dist/_locales/ so MV3 default_locale
// resolves at extension root. crxjs does not auto-copy _locales when the manifest
// source lives under src/extension/.
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const source = 'src/extension/_locales';
const destination = 'artifacts/dist/_locales';

if (!existsSync(source)) {
    throw new Error(`_locales source not found: ${source}`);
}

if (!existsSync('artifacts/dist')) {
    mkdirSync('artifacts/dist', { recursive: true });
}

cpSync(source, destination, { recursive: true });
console.log(`copied ${source} -> ${destination}`);
