/**
 * PM2 process definition.
 *
 * SECURITY: no secret belongs in this file. `NODE_ENV=production` makes
 * Backend/src/config/env.js FAIL FAST unless JWT_ADMIN_SECRET, JWT_USER_SECRET,
 * PADLOCK_TICKET_SECRET, AES_256_VAULT_KEY, ADMIN_TOTP_SECRET, ADMIN_PASSWORD
 * and ADMIN_PIN are provided by the environment (or a secret manager).
 * Copy Backend/.env.example to Backend/.env on the host and fill it in, or
 * export the variables from your deployment platform.
 */
module.exports = {
  apps: [
    {
      name: 'ultradownloader-backend-v10',
      script: './src/server.js',
      instances: 1, // single node keeps the in-RAM SSE bus unified (use Redis for multi-node)
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        HOST: '0.0.0.0',
        // Required behind the bundled nginx reverse proxy.
        TRUST_PROXY_HOPS: 1,
      },
    },
  ],
};
