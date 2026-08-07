import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, 'server.ts');
const clientIndex = path.join(__dirname, 'dist', 'index.html');

if (!existsSync(serverEntry)) {
  console.error(`Missing server entry file: ${serverEntry}`);
  process.exit(1);
}

if (!existsSync(clientIndex)) {
  console.log('Client build not found. Running npm run build before starting the server.');

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npmCommand, ['run', 'build'], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (build.error) {
    console.error(`Failed to run client build: ${build.error.message}`);
    process.exit(1);
  }

  if (build.status !== 0 || !existsSync(clientIndex)) {
    console.error('Client build failed or did not create dist/index.html.');
    process.exit(build.status ?? 1);
  }
}

// Hostinger requires a .js startup file. Node 22 strips erasable TypeScript
// syntax natively, avoiding tsx/esbuild in the restricted production runtime.
const server = spawn(process.execPath, ['--experimental-strip-types', serverEntry], {
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
