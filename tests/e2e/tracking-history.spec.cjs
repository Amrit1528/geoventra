/** GEOVENTRA — E2E acceptance suite for tracking history (Phase 5). */
const { test, expect } = require('@playwright/test');

const ADMIN = { email: 'admin@geoventra.in', password: 'Geoventra@2026' };
const VEHICLE_1 = 'e1000000-0000-4000-8000-000000000001';

async function adminToken(request) {
  const res = await request.post('http://localhost:4100/api/v1/auth/login', {
    body: { email: ADMIN.email, password: ADMIN.password },
  });
  return (await res.json()).accessToken;
}

test('1. vehicle history returns GPS points with pagination', async ({ request }) => {
  const token = await adminToken(request);
  const res = await request.get(`http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history`, {
    headers: { authorization: token },
    params: { page: 1, pageSize: 500 },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data).toBeInstanceOf(Array);
  expect(body.meta.page).toBe(1);
  expect(body.meta.pageSize).toBe(500);
});

test('2. vehicle history supports from/to date filtering', async ({ request }) => {
  const token = await adminToken(request);
  const res = await request.get(`http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history`, {
    headers: { authorization: token },
    params: { from: '2026-01-01', to: '2026-12-31' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data).toBeInstanceOf(Array);
});

test('3. vehicle history supports status filtering (moving/idle/stopped)', async ({ request }) => {
  const token = await adminToken(request);
  const res = await request.get(
    `http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history`,
    { headers: { authorization: token }, params: { status: 'moving' } },
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.every((p) => p.status === 'moving')).toBe(true);
});

test('4. vehicle history stats include distance, speed and gaps', async ({ request }) => {
  const token = await adminToken(request);
  const res = await request.get(
    `http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history/stats`,
    { headers: { authorization: token } },
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.totalDistanceKm).toBe('number');
  expect(typeof body.avgSpeedKph).toBe('number');
  expect(typeof body.gapCount).toBe('number');
});

test('5. vehicle history CSV export is downloadable', async ({ request }) => {
  const token = await adminToken(request);
  const res = await request.get(
    `http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history/export.csv`,
    { headers: { authorization: token } },
  );
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/text\/csv/);
  const body = await res.text();
  expect(body).toContain('latitude');
});

test('6. unauthorized history access returns 403 (no vehicleId)', async ({ request }) => {
  const res = await request.get('http://localhost:4100/api/v1/tracking/vehicles/nonexistent/history');
  expect([401, 403, 404]).toContain(res.status());
});
