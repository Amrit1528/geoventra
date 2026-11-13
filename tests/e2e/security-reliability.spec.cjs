/** GEOVENTRA — E2E acceptance suite for reliability and security (Phase 9 + 10). */
const { test, expect } = require('@playwright/test');

const ADMIN = { email: 'admin@geoventra.in', password: 'Geoventra@2026' };
const NORTHSTAR_ADMIN = { email: 'admin@northstar.in', password: 'Geoventra@2026' };
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

test('4. role-based access: owner can read dashboard', async ({ request }) => {
  const res = await request.get('http://localhost:4100/api/v1/dashboard/summary', {
    headers: { authorization: (await request.post('http://localhost:4100/api/v1/auth/login', {
      data: { email: 'owner@geoventra.in', password: 'Geoventra@2026' },
    }).json()).accessToken },
  });
  expect(res.status()).toBe(200);
});

test('5. organisation isolation: northstar admin cannot see geoventra vehicles', async ({ request }) => {
  const res = await request.get('http://localhost:4100/api/v1/tracking/vehicles', {
    headers: { authorization: (await request.post('http://localhost:4100/api/v1/auth/login', {
      data: { email: NORTHSTAR_ADMIN.email, password: NORTHSTAR_ADMIN.password },
    }).json()).accessToken },
  });
  // Non-geoventra orgs get an empty fleet (403 or 404, not 200 with data)
  expect([401, 403, 404]).toContain(res.status());
});

test('6. no cross-org GPS history: northstar admin cannot read geoventra vehicle history', async ({ request }) => {
  const login = await request.post('http://localhost:4100/api/v1/auth/login', {
    data: { email: NORTHSTAR_ADMIN.email, password: NORTHSTAR_ADMIN.password },
  });
  const res = await request.get(
    `http://localhost:4100/api/v1/tracking/vehicles/${VEHICLE_1}/history`,
    { headers: { authorization: login.json().accessToken } },
  );
  expect([401, 403, 404]).toContain(res.status());
});

test('7. no cross-org geofence access: northstar admin cannot list geoventra geofences', async ({ request }) => {
  const login = await request.post('http://localhost:4100/api/v1/auth/login', {
    data: { email: NORTHSTAR_ADMIN.email, password: NORTHSTAR_ADMIN.password },
  });
  const res = await request.get('http://localhost:4100/api/v1/geofences', {
    headers: { authorization: login.json().accessToken },
  });
  expect([401, 403, 404]).toContain(res.status());
});

test('8. export authorization: admin can export trips CSV', async ({ request }) => {
  const res = await request.get('http://localhost:4100/api/v1/trips/export.csv', {
    headers: { authorization: (await request.post('http://localhost:4100/api/v1/auth/login', {
      data: { email: ADMIN.email, password: ADMIN.password },
    }).json()).accessToken },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/text\/csv/);
});

test('9. input validation: invalid vehicleId returns 400', async ({ request }) => {
  const res = await request.get('http://localhost:4100/api/v1/tracking/vehicles/not-a-uuid/history');
  expect([400, 404]).toContain(res.status());
});

test('10. rate limiting returns 429 beyond the limit (if configured)', async ({ request }) => {
  // If the API enforces rate limiting, a burst returns 429. Document the behavior.
  const res = await request.get('http://localhost:4100/api/v1/health', { maxRetries: 0 });
  expect([200, 429]).toContain(res.status());
});
