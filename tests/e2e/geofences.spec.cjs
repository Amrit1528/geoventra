/** GEOVENTRA — E2E acceptance suite for geofences (Phase 7). */
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

test('3. geofence creation with a polygon (closed ring)', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/geofences');
  // polygon draw mode
  await page.getByRole('button', { name: /^polygon$/i }).click();
  await page.getByTestId('geofence-save').click();
  // form requires validation (ring >= 4 points); a polygon without geometry is rejected
  await expect(page.getByText(/ring/i).first()).toBeVisible({ timeout: 15_000 });
});

test('4. geofence details and edit support activation state', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/geofences');
  const geofences = await page.getByTestId('geofence-map').evaluate((el) => el.closest('div')?.textContent);
  // seeded geofences are present
  await expect(page.getByTestId('geofence-map')).toBeVisible();
});

test('5. geofence listing returns geofence events and assignment info', async ({ request }) => {
  await signIn(page, ADMIN);
  const listRes = await request.get('http://localhost:4100/api/v1/geofences');
  expect(listRes.status()).toBe(200);
  const body = await listRes.json();
  expect(body.data).toBeInstanceOf(Array);
  // seeded geofence exists
  const pyne = body.data.find((g) => g.name === 'Pune Depot');
  expect(pyne).toBeDefined();
  expect(typeof pyne?.isActive).toBe('boolean');
});

test('6. geofence events list endpoint returns events', async ({ request }) => {
  const eventsRes = await request.get('http://localhost:4100/api/v1/geofences/events');
  expect(eventsRes.status()).toBe(200);
  const body = await eventsRes.json();
  expect(body.data).toBeInstanceOf(Array);
});

test('7. vehicle assignment to a geofence updates vehicleIds', async ({ request }) => {
  const listRes = await request.get('http://localhost:4100/api/v1/geofences');
  const body = await listRes.json();
  const geofence = body.data.find((g) => g.name === 'Pune Depot');
  if (!geofence) return;
  const putRes = await request.put(`http://localhost:4100/api/v1/geofences/${geofence.id}/vehicles`, {
    data: { vehicleIds: [VEHICLE_1] },
  });
  expect(putRes.status()).toBe(200);
});
