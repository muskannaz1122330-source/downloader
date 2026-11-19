import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createBackendApp } from '../src/app.js';
import { initDatabase } from '../src/db/database.js';
import { signAdminAccessToken } from '../src/security/cryptoVault.js';
import { authenticator } from 'otplib';

/** Regression tests for the P0 security findings in PROJECT_AUDIT.md. */
describe('Security regressions (P0)', () => {
  let app;

  beforeAll(async () => {
    await initDatabase();
    app = createBackendApp();
  }, 60000);

  it('C4: rejects cross-origin requests from an unknown origin', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('C3: system control endpoints require a super-admin session', async () => {
    await request(app).get('/api/v1/system/db-diagnostics').expect(401);
    await request(app).put('/api/v1/system/settings').send({}).expect(401);
    await request(app).post('/api/v1/system/cookies').send({ cookiesTxt: 'a'.repeat(20) }).expect(401);
    await request(app).post('/api/v1/system/clear-cache').expect(401);
    await request(app).post('/api/v1/system/db-maintenance').send({}).expect(401);
  });

  it('H10: admin JWT in a query string is never accepted', async () => {
    const token = signAdminAccessToken({ id: 'x', email: 'x@y.z', fullName: 'X', role: 'super_admin' });
    await request(app)
      .get(`/api/v1/admin/live-cards?adminToken=${encodeURIComponent(token)}`)
      .expect(401);
    await request(app)
      .get('/api/v1/admin/live-cards')
      .set('X-Admin-Token', `Bearer ${token}`)
      .expect(200);
  });

  it('C2: TOTP is mandatory — empty and fixed dev codes both fail', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/v1/admin/padlock/verify')
      .send({ pin: process.env.ADMIN_PIN })
      .expect(200);

    const credentials = {
      identifier: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    };
    await agent.post('/api/v1/admin/auth/login').send({ ...credentials, totpCode: '' }).expect(401);
    await agent.post('/api/v1/admin/auth/login').send({ ...credentials, totpCode: '123456' }).expect(401);

    // A genuinely generated RFC-6238 code succeeds (no bypass needed).
    await agent
      .post('/api/v1/admin/auth/login')
      .send({
        ...credentials,
        totpCode: authenticator.generate(process.env.ADMIN_TOTP_SECRET),
      })
      .expect(200);
  });

  it('C6: download file routes require a registered user', async () => {
    await request(app).get('/api/v1/downloads/dl-any/file').expect(401);
    await request(app).get('/api/v1/downloads/dl-any/idm-export').expect(401);
    await request(app).post('/api/v1/downloads/dl-any/open-in-idm').expect(401);
  });

  it('M16/M17: stored streamUrl and IDM targets reject unsafe URLs', async () => {
    await request(app)
      .post('/api/v1/share')
      .send({ url: 'https://www.youtube.com/watch?v=WhWc3b3KhnY', streamUrl: 'javascript:alert(1)' })
      .expect(400);
    await request(app)
      .post('/api/v1/downloads/send-direct-idm')
      .send({ streamUrl: 'http://127.0.0.1:4000/internal' })
      .expect(400);
  });

  it('H8: health reports standby honestly', async () => {
    const res = await request(app).get('/api/v1/health').expect(200);
    const db = res.body.data.database;
    expect(db.available).toBe(true);
    expect(db.connected).toBe(db.mysqlConnected);
    expect(db.standbyMode).toBe(!db.mysqlConnected);
  });

  it('fixture routes are mounted only in fixture mode', async () => {
    const res = await request(app).get('/api/v1/__fixtures__/health');
    expect(res.status).toBe(200);
    expect(res.body.data.liveNetworkRequired).toBe(false);
  });

  it('sources-health endpoint is admin-only and never claims 222 verified sources', async () => {
    await request(app).get('/api/v1/admin/sources-health').expect(401);
    const token = signAdminAccessToken({ id: 'x', email: 'x@y.z', fullName: 'X', role: 'super_admin' });
    const res = await request(app)
      .get('/api/v1/admin/sources-health')
      .set('X-Admin-Token', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.catalogueSize).toBeGreaterThan(200);
    expect(res.body.data.verifiedCount).toBeLessThanOrEqual(res.body.data.catalogueSize);
    expect(res.body.data.unverifiedCount).toBeGreaterThan(0);
  });
});
