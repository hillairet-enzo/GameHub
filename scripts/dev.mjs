// Starts the Astro dev server in the foreground.
//
// Astro 7 detects terminals opened by AI coding tools and then starts the server in the
// background without printing anything. Tauri would wait for it forever, so we turn that
// detection off here. Every other argument is passed to `astro dev` unchanged.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const astroBin = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));

const child = spawn(process.execPath, [astroBin, 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ASTRO_DEV_BACKGROUND: '1' },
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
