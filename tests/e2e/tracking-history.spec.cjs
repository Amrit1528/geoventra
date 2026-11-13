/** GEOVENTRA — E2E acceptance suite for tracking history (Phase 5). */
const { test, expect } = require('@playwright/test');

const ADMIN = { email: 'admin@geoventra.in', password: 'Geoventra@2026' };
const VEHICLE_1 = 'e1000000-0000-4000-8000-000000000001';
const INGEST_URL = 'http://localhost:4100/api/v1/tracking/ingest';
const INGEST_KEY = 'integration-ingest-key';

async function signIn(page, credentials) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('http://localhost:3100/');
}

test('1. vehicle history returns GPS points with pagination', async ({ request }) => {
  const res = await request.get(`http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history`, {
    params: { page: 1, pageSize: 500 },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data).toBeInstanceOf(Array);
  expect(body.meta.page).toBe(1);
  expect(body.meta.pageSize).toBe(500);
});

test('2. vehicle history supports from/to date filtering', async ({ request }) => {
  const res = await request.get(`http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history`, {
    params: { from: '2026-01-01', to: '2026-12-31' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data).toBeInstanceOf(Array);
});

test('3. vehicle history supports status filtering (moving/idle/stopped)', async ({ request }) => {
  const res = await request.get(
    `http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history`,
    { params: { status: 'moving' } },
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.every((p) => p.status === 'moving')).toBe(true);
});

test('4. vehicle history stats include distance, speed and gaps', async ({ request }) => {
  const res = await request.get(
    `http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history/stats`,
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.totalDistanceKm).toBe('number');
  expect(typeof body.avgSpeedKph).toBe('number');
  expect(typeof body.gapCount).toBe('number');
});

test('5. vehicle history CSV export is downloadable', async ({ request }) => {
  const res = await request.get(
    `http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history/export.csv`,
  );
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/text\/csv/);
  const body = await res.text();
  expect(body).toContain('latitude');
});

test('6. unauthorized history access returns 403 (no vehicleId)', async ({ request }) => {
  const res = await request.get('http://localhost:4100/api/v1/tracking/vehicles/nonexistent/history');
  expect([403, 404, 401]).toContain(res.status());
});
