import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from './app.module.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(__dirname, '../../..');
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://geoventra@localhost:5432/geoventra_test';
const TSX_BIN = resolve(REPO_ROOT, 'apps/api/node_modules/.bin/tsx');
const ADMIN_EMAIL = 'admin@geoventra.in';
const ADMIN_PASSWORD = 'Geoventra@2026';

describe('Differentiating features API (integration)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
    process.env.DATABASE_SCHEMA = 'geoventra';
    process.env.INGEST_SHARED_SECRET = 'integration-ingest-key';
    process.env.JWT_ACCESS_SECRET = 'integration-access-secret';
    process.env.PORT = '0';
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    await client.end();
    await execFileAsync(TSX_BIN, ['database/migrate.ts', '--database', TEST_DATABASE_URL], { cwd: REPO_ROOT });
    await execFileAsync(TSX_BIN, ['database/seeds/seed.ts', '--database', TEST_DATABASE_URL], { cwd: REPO_ROOT });
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/live', 'health/ready'] });
    await app.init();
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }).expect(200);
    accessToken = response.body.accessToken;
  }, 180_000);

  afterAll(async () => { await app?.close(); });

  const auth = () => ({ authorization: `Bearer ${accessToken}` });

  it('insights rules + evaluate', async () => {
    await request(app.getHttpServer()).get('/api/v1/insights/rules').set(auth()).expect(200);
    const res = await request(app.getHttpServer()).post('/api/v1/insights/evaluate').set(auth()).send({}).expect(201);
    expect(res.body).toHaveProperty('created');
    await request(app.getHttpServer()).get('/api/v1/insights/events').set(auth()).expect(200);
  });

  it('scorecards compute + results', async () => {
    const vehicles = await request(app.getHttpServer()).get('/api/v1/vehicles').set(auth()).expect(200);
    const vid = vehicles.body?.data?.[0]?.id;
    if (vid) {
      await request(app.getHttpServer()).post('/api/v1/scorecards/compute').set(auth()).send({ entityType: 'vehicle', entityId: vid, periodStart: '2020-01-01', periodEnd: '2030-01-01' }).expect(201);
    }
    await request(app.getHttpServer()).get('/api/v1/scorecards/results').set(auth()).expect(200);
    await request(app.getHttpServer()).get('/api/v1/scorecards/configs').set(auth()).expect(200);
  });

  it('delivery link create + public view + revoke', async () => {
    const vehicles = await request(app.getHttpServer()).get('/api/v1/vehicles').set(auth()).expect(200);
    const vid = vehicles.body?.data?.[0]?.id;
    const created = await request(app.getHttpServer()).post('/api/v1/delivery/links').set(auth()).send({ vehicleId: vid, label: 'test' }).expect(201);
    expect(created.body.token).toBeTruthy();
    const token = created.body.token;
    const view = await request(app.getHttpServer()).get(`/api/v1/delivery/public/${token}`).expect(200);
    expect(view.body).toHaveProperty('status');
    await request(app.getHttpServer()).post(`/api/v1/delivery/links/${created.body.id}/revoke`).set(auth()).expect(201);
    const revokedRes = await request(app.getHttpServer()).get(`/api/v1/delivery/public/${token}`);
    expect(revokedRes.status).toBeGreaterThanOrEqual(400);
  });

  it('commercial endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/billing/plans').set(auth()).expect(200);
    const plan = await request(app.getHttpServer()).post('/api/v1/billing/plans').set(auth()).send({ code: 'TEST-' + Date.now(), name: 'Test Plan', priceCents: 100 }).expect(201);
    await request(app.getHttpServer()).get('/api/v1/billing/subscriptions').set(auth()).expect(200);
    await request(app.getHttpServer()).get('/api/v1/billing/invoices').set(auth()).expect(200);
    await request(app.getHttpServer()).get('/api/v1/partners').set(auth()).expect(200);
    const partner = await request(app.getHttpServer()).post('/api/v1/partners').set(auth()).send({ name: 'P', partnerType: 'installer' }).expect(201);
    await request(app.getHttpServer()).get(`/api/v1/partners/${partner.body.id}/customers`).set(auth()).expect(200);
    await request(app.getHttpServer()).get('/api/v1/branding').set(auth()).expect(200);
    await request(app.getHttpServer()).put('/api/v1/branding').set(auth()).send({ companyName: 'Acme' }).expect(200);
  });

  it('device adapters endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/device-adapters/health').set(auth()).expect(200);
    await request(app.getHttpServer()).get('/api/v1/device-adapters/manufacturers').set(auth()).expect(200);
    await request(app.getHttpServer()).get('/api/v1/device-adapters/models').set(auth()).expect(200);
    await request(app.getHttpServer()).get('/api/v1/device-adapters/connection-status').set(auth()).expect(200);
    await request(app.getHttpServer()).get('/api/v1/device-adapters/ingestion-audit').set(auth()).expect(200);
  });

  it('maintenance reminders', async () => {
    await request(app.getHttpServer()).get('/api/v1/maintenance/reminders').set(auth()).expect(200);
  });
});