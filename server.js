import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serverEntry = path.join(__dirname, 'server.ts');
let tsxCli;

if (!existsSync(serverEntry)) {
  console.error(`Missing server entry file: ${serverEntry}`);
  process.exit(1);
}

try {
  tsxCli = require.resolve('tsx/cli');
} catch {
  console.error('Missing local tsx package. Run npm install before starting the server.');
  process.exit(1);
}

// Hostinger requires a .js startup file, while the app server remains authored in TypeScript.
const server = spawn(process.execPath, [tsxCli, serverEntry], {
  cwd: __dirname,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

server.on('error', (error) => {
  console.error(`Failed to start ${serverEntry}: ${error.message}`);
  process.exit(1);
});

server.on('exit', (code) => {
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!server.killed) {
      server.kill(signal);
    }
  });
}
