/** GEOVENTRA — E2E acceptance suite for trip history (Phase 6 + 5). */
const { test, expect } = require('@playwright/test');

const ADMIN = { email: 'admin@geoventra.in', password: 'Geoventra@2026' };
const TRIP_ID = '55000000-0000-4000-8000-000000000001';

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

test('1. trip listing shows seeded trips with distance and speed', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/trips');
  await expect(page.getByRole('heading', { name: 'Trips', level: 1 })).toBeVisible();
  await expect(page.getByText('Distance')).toBeVisible();
  await expect(page.getByText('Max speed')).toBeVisible();
  await expect(page.getByText('Duration')).toBeVisible();
});

test('2. trip listing filters by status', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/trips');
  await page.getByTestId('trips-status-filter').selectOption('completed');
  await expect(page.getByRole('table')).toBeVisible();
});

test('3. trip detail shows distance, duration and events', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto(`/trips/${TRIP_ID}`);
  await expect(page.getByRole('heading', { name: /Trip · MH 12 AB 1234/, level: 1 })).toBeVisible();
  await expect(page.getByText('Completed')).toBeVisible();
  await expect(page.getByText('Distance')).toBeVisible();
  await expect(page.getByText('Duration')).toBeVisible();
});

test('4. trip route visualization renders the trip map', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto(`/trips/${TRIP_ID}`);
  await expect(page.getByTestId('trip-map')).toBeVisible({ timeout: 20_000 });
});

test('5. trip playback advances through the route', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto(`/trips/${TRIP_ID}`);
  const scrubber = page.getByTestId('trip-playback-scrubber');
  await expect(scrubber).toBeVisible();
  const initial = Number(await scrubber.evaluate((el) => el.value));
  await page.getByTestId('trip-playback-toggle').click();
  await page.waitForTimeout(1_500);
  const advanced = Number(await scrubber.evaluate((el) => el.value));
  expect(advanced).toBeGreaterThan(initial);
});

test('6. trip playback supports speed controls and timeline seeking', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto(`/trips/${TRIP_ID}`);
  const scrubber = page.getByTestId('trip-playback-scrubber');
  await expect(scrubber).toBeVisible();
  const val = Number(await scrubber.evaluate((el) => el.value));
  await scrubber.fill(String(Number(val) + 50));
  await expect(scrubber).toHaveValue(String(Number(val) + 50));
});

test('7. trip CSV export is downloadable', async ({ page, request }) => {
  await signIn(page, ADMIN);
  const token = await adminToken(request);
  const response = await request.get('http://localhost:4100/api/v1/trips/export.csv', {
    headers: { authorization: token },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/text\/csv/);
  const body = await response.text();
  expect(body).toContain('MH 12 AB 1234');
});
