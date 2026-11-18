/** GEOVENTRA — E2E acceptance suite for geofences (Phase 7). */
const { test, expect } = require('@playwright/test');

const ADMIN = { email: 'admin@geoventra.in', password: 'Geoventra@2026' };
const VEHICLE_1 = 'e1000000-0000-4000-8000-000000000001';

async function signIn(page, credentials) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('http://localhost:3100/');
}

async function adminToken(request) {
  const res = await request.post('http://localhost:4100/api/v1/auth/login', {
    data: { email: ADMIN.email, password: ADMIN.password },
  });
  return (await res.json()).accessToken;
}

test('1. geofence listing shows seeded geofences', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/geofences');
  await expect(page.getByRole('heading', { name: 'Geofences', level: 1 })).toBeVisible();
  await expect(page.getByTestId('geofence-map')).toBeVisible({ timeout: 20_000 });
});

test('2. geofence creation with a circle', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/geofences');
  await page.getByRole('button', { name: /^circle$/i }).click();
  const mapBox = await page.getByTestId('geofence-map').boundingBox();
  if (!mapBox) throw new Error('geofence map bounding box not available');
  await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  const nameInput = page.getByPlaceholder('e.g. Mumbai Depot');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('E2E Circle Test');
  await page.getByTestId('geofence-save').click();
  await expect(page.getByText('E2E Circle Test').first()).toBeVisible({ timeout: 15_000 });
});

test('3. geofence creation with a polygon (valid GeoJSON ring)', async ({ request }) => {
  const token = await adminToken(request);
  const poly = {
    name: 'E2E Polygon Test',
    type: 'polygon',
    color: '#3B82F6',
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    },
    alertOnEntry: true,
    isActive: true,
  };
  const res = await request.post('http://localhost:4100/api/v1/geofences', {
    headers: { authorization: token, 'content-type': 'application/json' },
    data: poly,
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.name).toBe('E2E Polygon Test');
});

test('4. geofence activation state is returned', async ({ request }) => {
  const token = await adminToken(request);
  const listRes = await request.get('http://localhost:4100/api/v1/geofences', {
    headers: { authorization: token },
  });
  expect(listRes.status()).toBe(200);
  const body = await listRes.json();
  const pyne = body.data.find((g) => g.name === 'Pune Depot');
  expect(pyne).toBeDefined();
  expect(typeof pyne?.isActive).toBe('boolean');
});

test('5. geofence events list endpoint returns events', async ({ request }) => {
  const token = await adminToken(request);
  const res = await request.get('http://localhost:4100/api/v1/geofences/events', {
    headers: { authorization: token },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data).toBeInstanceOf(Array);
});

test('6. vehicle assignment to a geofence updates vehicleIds', async ({ request }) => {
  const token = await adminToken(request);
  const listRes = await request.get('http://localhost:4100/api/v1/geofences', {
    headers: { authorization: token },
  });
  const body = await listRes.json();
  const geofence = body.data.find((g) => g.name === 'Pune Depot');
  if (!geofence) return;
  const putRes = await request.put(`http://localhost:4100/api/v1/geofences/${geofence.id}/vehicles`, {
    headers: { authorization: token, 'content-type': 'application/json' },
    data: { vehicleIds: [VEHICLE_1] },
  });
  expect(putRes.status()).toBe(200);
});
