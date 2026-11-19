import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createLogger, defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The repository directory is `Backend` (capital B). Older Windows setups used
// `backend`. Probe both so `npm run dev` / `npm test` work on case-sensitive
// Linux/macOS filesystems as well as Windows.
const backendCwd = ['../Backend', '../backend']
  .map((candidate) => path.resolve(__dirname, candidate))
  .find((candidate) => fs.existsSync(path.join(candidate, 'src', 'server.js')))
  || path.resolve(__dirname, '../Backend');
const backendEntry = path.join(backendCwd, 'src', 'server.js');

const baseLogger = createLogger();
const cleanViteLogger = {
  ...baseLogger,
  error(msg, options) {
    if (typeof msg === 'string' && msg.includes('http proxy error:')) return;
    baseLogger.error(msg, options);
  },
};

function checkTcpOpen(host, port, timeoutMs = 450) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
    sock.connect(port, host);
  });
}

function autoStartBackendCompanionPlugin(target) {
  let companionProc = null;
  let shuttingDown = false;

  const ensureBackendDependenciesInstalled = () => {
    const checkFile = path.join(backendCwd, 'node_modules', 'mysql2', 'promise.js');
    if (fs.existsSync(checkFile)) return;
    if (!fs.existsSync(backendCwd)) {
      throw new Error(`Backend directory not found: ${backendCwd}`);
    }
    console.log('[UltraDownloader] First-time setup: installing backend packages...');
    execSync('npm install --no-audit --no-fund', { cwd: backendCwd, stdio: 'inherit' });
  };

  // Never bake admin credentials into the dev server: env.js generates random
  // one-off ones (printed to the console) or reads real values from the host.
  // Test fixtures are owned by Frontend/scripts/run-tests.mjs instead.
  const childEnv = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development',
  };

  const cleanup = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (companionProc && !companionProc.killed) {
      companionProc.kill('SIGTERM');
      companionProc = null;
    }
  };

  const launchBackendProcess = () => {
    if (shuttingDown || !fs.existsSync(backendEntry)) return;
    companionProc = spawn(process.execPath, [backendEntry], {
      cwd: backendCwd,
      stdio: 'inherit',
      windowsHide: true,
      env: childEnv,
    });
    companionProc.once('exit', (code) => {
      companionProc = null;
      if (!shuttingDown && code !== 0) setTimeout(launchBackendProcess, 1500);
    });
  };

  // Always kill the child, even if the Vite server never emits 'close' or the
  // runner calls process.exit() directly.
  process.once('exit', cleanup);
  process.once('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  return {
    name: 'ultradownloader-auto-backend-companion',
    async configureServer(server) {
      // During `npm test` the API is started by scripts/run-tests.mjs, so the
      // companion plugin must not spawn anything inside Vite/Vitest.
      if (process.env.VITEST || process.env.ULTRA_TEST_RUNNER === '1') return;
      const targetUrl = new URL(target);
      const port = Number(targetUrl.port || 4000);
      const host = targetUrl.hostname || '127.0.0.1';

      ensureBackendDependenciesInstalled();
      const alreadyUp = await checkTcpOpen(host, port);
      if (!alreadyUp) {
        console.log(
          `[UltraDownloader] Auto-starting companion Backend API on http://${host}:${port} ...`
        );
        launchBackendProcess();
        for (let i = 0; i < 40; i++) {
          if (await checkTcpOpen(host, port, 300)) break;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      server.httpServer?.once('close', cleanup);
    },
  };
}

function attachQuietProxyGuard(proxy) {
  proxy.on('error', (_err, _req, res) => {
    if (res && !res.headersSent && typeof res.writeHead === 'function') {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          success: false,
          error: {
            code: 'BACKEND_STARTING',
            message: 'Backend API is warming up — please retry in 1 second.',
          },
        })
      );
    }
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const backendTarget =
    env.VITE_BACKEND_ORIGIN || process.env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:4000';

  return {
    customLogger: cleanViteLogger,
    plugins: [react(), autoStartBackendCompanionPlugin(backendTarget)],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
      proxy: {
        '/api': { target: backendTarget, changeOrigin: true, secure: false, configure: attachQuietProxyGuard },
        '/sitemap.xml': { target: backendTarget, changeOrigin: true, secure: false, configure: attachQuietProxyGuard },
        '/robots.txt': { target: backendTarget, changeOrigin: true, secure: false, configure: attachQuietProxyGuard },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true,
      proxy: {
        '/api': { target: backendTarget, changeOrigin: true, secure: false, configure: attachQuietProxyGuard },
        '/sitemap.xml': { target: backendTarget, changeOrigin: true, secure: false },
        '/robots.txt': { target: backendTarget, changeOrigin: true, secure: false },
      },
    },
    build: {
      // hls.js is now a lazy, on-demand async chunk; it is intentionally large.
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-router-dom', 'react-dom'],
            'vendor-charts': ['recharts'],
            'vendor-motion': ['framer-motion', 'lucide-react'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setupTests.js'],
      testTimeout: 30000,
      pool: 'forks',
    },
  };
});
