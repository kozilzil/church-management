import { spawn } from 'node:child_process';
import console from 'node:console';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  throw new Error('A command is required.');
}

const child = spawn(command, args, { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error(`Could not start ${command}: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});
