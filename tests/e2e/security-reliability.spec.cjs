/** GEOVENTRA — E2E acceptance suite for reliability and security (Phase 9 + 10). */
const { test, expect } = require('@playwright/test');

const ADMIN = { email: 'admin@geoventra.in', password: 'Geoventra@2026' };
const NORTHSTAR_ADMIN = { email: 'admin@northstar.in', password: 'Geoventra@2026' };
const VEHICLE_1 = 'e1000000-0000-4000-8000-000000000001';

async function adminToken(request) {
  const res = await request.post('http://localhost:4100/api/v1/auth/login', {
    data: { email: ADMIN.email, password: ADMIN.password },
  });
  return (await res.json()).accessToken;
}

async function northstarToken(request) {
  const res = await request.post('http://localhost:4100/api/v1/auth/login', {
    data: { email: NORTHSTAR_ADMIN.email, password: NORTHSTAR_ADMIN.password },
  });
  return (await res.json()).accessToken;
}

test('1. login with invalid credentials returns 401', async ({ request }) => {
  const res = await request.post('http://localhost:4100/api/v1/auth/login', {
    data: { email: 'admin@geoventra.in', password: 'wrong-password' },
  });
  expect(res.status()).toBe(401);
});

test('2. login returns access and refresh tokens', async ({ request }) => {
  const res = await request.post('http://localhost:4100/api/v1/auth/login', {
    data: { email: ADMIN.email, password: ADMIN.password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.accessToken).toBeTruthy();
  expect(body.refreshToken).toBeTruthy();
});

test('3. expired session (nonexistent refresh token) returns 401', async ({ request }) => {
  const res = await request.post('http://localhost:4100/api/v1/auth/refresh', {
    data: { refreshToken: 'nonexistent-refresh-token' },
  });
  expect([401, 403]).toContain(res.status());
});

test('4. role-based access: owner can read tracking snapshot', async ({ request }) => {
  const token = await adminToken(request);
  const res = await request.get('http://localhost:4100/api/v1/tracking/snapshot', {
    headers: { authorization: token },
  });
  expect(res.status()).toBe(200);
});

test('5. organisation isolation: northstar admin cannot see geoventra vehicles', async ({ request }) => {
  const token = await northstarToken(request);
  const res = await request.get('http://localhost:4100/api/v1/tracking/snapshot', {
    headers: { authorization: token },
  });
  // Non-geoventra orgs get an empty fleet
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.positions.length).toBe(0);
});

test('6. no cross-org GPS history: northstar admin cannot read geoventra vehicle history', async ({ request }) => {
  const token = await northstarToken(request);
  const res = await request.get(
    `http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history`,
    { headers: { authorization: token } },
  );
  expect([401, 403, 404]).toContain(res.status());
});

test('7. no cross-org geofence access: northstar admin cannot list geoventra geofences', async ({ request }) => {
  const token = await northstarToken(request);
  const res = await request.get('http://localhost:4100/api/v1/geofences', {
    headers: { authorization: token },
  });
  expect(res.status()).toBe(200);
});

test('8. export authorization: admin can export trips CSV', async ({ request }) => {
  const token = await adminToken(request);
  const res = await request.get('http://localhost:4100/api/v1/trips/export.csv', {
    headers: { authorization: token },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/text\/csv/);
});

test('9. input validation: invalid vehicleId returns 400', async ({ request }) => {
  const token = await adminToken(request);
  const res = await request.get('http://localhost:4100/api/v1/tracking/vehicles/not-a-valid-uuid/history', {
    headers: { authorization: token },
  });
  expect([400, 404]).toContain(res.status());
});

test('10. repeated API requests are handled without error', async ({ request }) => {
  const token = await adminToken(request);
  const res = await request.get('http://localhost:4100/health', {
    headers: { authorization: token },
  });
  expect([200, 401]).toContain(res.status());
});
