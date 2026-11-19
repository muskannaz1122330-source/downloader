/**
 * Runs the Vitest suite against a real Backend API started in deterministic
 * offline-fixture mode. Keeps child-process lifecycle out of Vite's dev server
 * so `npm test` exits cleanly (no orphan on port 4000, no close timeout).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = ['../Backend', '../backend']
  .map((c) => path.resolve(frontendRoot, c))
  .find((c) => fs.existsSync(path.join(c, 'src', 'server.js')));

if (!backendRoot) {
  console.error('[test] Backend directory not found next to Frontend/.');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 4000);
const HOST = '127.0.0.1';

function portIsOpen() {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(400);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
    sock.connect(PORT, HOST);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fixtureEnv = {
  ...process.env,
  NODE_ENV: 'test',
  ULTRA_FIXTURES: '1',
  TRUST_PROXY_HOPS: '1',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@ultradownloader.pro',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'FixtureOnly_Admin!2026',
  ADMIN_PIN: process.env.ADMIN_PIN || '2580',
  ADMIN_TOTP_SECRET: process.env.ADMIN_TOTP_SECRET || 'JBSWY3DPEHPK3PXP',
};

let backend = null;
let finished = false;

function stopBackend() {
  if (backend && !backend.killed) backend.kill('SIGTERM');
  backend = null;
}
process.on('exit', stopBackend);
process.on('SIGINT', () => {
  stopBackend();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopBackend();
  process.exit(143);
});

async function main() {
  const alreadyUp = await portIsOpen();
  if (!alreadyUp) {
    backend = spawn(process.execPath, [path.join(backendRoot, 'src', 'server.js')], {
      cwd: backendRoot,
      stdio: 'ignore',
      env: fixtureEnv,
    });
    for (let i = 0; i < 60; i += 1) {
      if (await portIsOpen()) break;
      if (backend.exitCode !== null) {
        console.error(`[test] Backend exited early with code ${backend.exitCode}`);
        process.exit(1);
      }
      await sleep(200);
    }
    if (!(await portIsOpen())) {
      console.error('[test] Backend did not become ready on port ' + PORT);
      stopBackend();
      process.exit(1);
    }
  }

  const vitestBin = path.join(frontendRoot, 'node_modules', '.bin', 'vitest');
  const runner = spawn(vitestBin, ['run'], {
    cwd: frontendRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', ULTRA_FIXTURES: '1' },
  });

  const code = await new Promise((resolve) => runner.once('exit', (c) => resolve(c ?? 1)));
  finished = true;
  stopBackend();
  process.exit(code);
}

main().catch((err) => {
  if (!finished) {
    console.error('[test] runner error:', err);
    stopBackend();
    process.exit(1);
  }
});
