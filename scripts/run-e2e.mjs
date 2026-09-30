import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createStaticTestServer } from './serve-static.mjs';

const host = '127.0.0.1';
const port = 4173;
const localBaseURL = `http://${host}:${port}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || localBaseURL;
const server = process.env.PLAYWRIGHT_BASE_URL ? null : createStaticTestServer();

if (server) {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, resolveListen);
  });
}

const playwrightCli = resolve('node_modules', '@playwright', 'test', 'cli.js');
const child = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
  env: { ...process.env, PLAYWRIGHT_BASE_URL: baseURL },
  stdio: 'inherit',
});

const exitCode = await new Promise((resolveExit, rejectExit) => {
  child.once('error', rejectExit);
  child.once('exit', (code, signal) => resolveExit(signal ? 1 : (code ?? 1)));
});

if (server) {
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
}
process.exitCode = exitCode;
