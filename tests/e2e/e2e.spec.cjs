/**
 * GEOVENTRA — E2E acceptance suite for the P0 surfaces.
 *
 * Scenarios:
 *   1.  User login
 *   2.  Fleet map loads
 *   3.  Vehicle markers display
 *   4.  Vehicle selection opens details
 *   5.  Live location updates (websocket push after an ingest)
 *   6.  Offline vehicle handling (stale position renders offline)
 *   7.  Trip listing and details
 *   8.  Trip route playback
 *   9.  Geofence creation
 *   10. Geofence entry/exit alerts
 *   11. Organisation-level authorization (empty second org)
 *
 * Runs against the deterministic `geoventra_test` database (see global-setup.ts).
 */

const { test, expect } = require('@playwright/test');

const ADMIN = { email: 'admin@geoventra.in', password: 'Geoventra@2026' };
const NORTHSTAR_ADMIN = { email: 'admin@northstar.in', password: 'Geoventra@2026' };
const VEHICLE_1 = 'e1000000-0000-4000-8000-000000000001';
const VEHICLE_3 = 'e1000000-0000-4000-8000-000000000003';
const TRIP_ID = '55000000-0000-4000-8000-000000000001';
const INGEST_URL = 'http://localhost:4100/api/v1/tracking/ingest';
const INGEST_KEY = 'integration-ingest-key';

async function signIn(page, credentials) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('http://localhost:3100/');
}

test('1. user login', async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
});

test('2. fleet map loads', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/tracking');
  await expect(page.getByTestId('fleet-map')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Live Tracking', level: 1 })).toBeVisible();
});

test('3. vehicle markers display', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/tracking');
  await expect(page.getByTestId('fleet-map')).toBeVisible({ timeout: 20_000 });

  // Fit-to-fleet unclusters the three seeded vehicles.
  await page.getByRole('button', { name: /fit to fleet/i }).click();
  await expect(page.locator('[data-testid="vehicle-marker"]')).toHaveCount(3, { timeout: 20_000 });
});

test('4. vehicle selection opens details drawer', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/tracking');
  await page.getByRole('button', { name: /fit to fleet/i }).click();

  const marker = page.locator(`[data-vehicle-id="${VEHICLE_1}"]`);
  await marker.waitFor({ state: 'visible', timeout: 20_000 });
  await marker.click();

  const drawer = page.getByTestId('vehicle-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('MH 12 AB 1234');
  await expect(drawer).toContainText('Pune Freight Truck 01');
  await expect(drawer).toContainText('Speed');
  await expect(drawer).toContainText('Heading');
  await expect(drawer).toContainText('Ignition');
  await expect(drawer).toContainText('GPS timestamp');
  await expect(drawer).toContainText('Tracker');
});

test('5. live location updates after an ingest', async ({ page, request }) => {
  await signIn(page, ADMIN);
  await page.goto('/tracking');
  await page.getByRole('button', { name: /fit to fleet/i }).click();

  const marker = page.locator(`[data-vehicle-id="${VEHICLE_1}"]`);
  await marker.waitFor({ state: 'visible', timeout: 20_000 });
  await marker.click();

  const drawer = page.getByTestId('vehicle-drawer');
  await expect(drawer).toBeVisible();
  // Fixture seeds speed 46.5 km/h.
  await expect(drawer).toContainText('46.5 km/h', { timeout: 10_000 });

  // Push a fresh position through the ingest endpoint; the websocket merge should update the drawer.
  const response = await request.post(INGEST_URL, {
    headers: { 'content-type': 'application/json', 'x-ingest-key': INGEST_KEY },
    data: {
      events: [
        {
          deviceId: 'GEO-GPS-0001',
          vehicleId: VEHICLE_1,
          latitude: 18.5312,
          longitude: 73.8612,
          speedKph: 62.4,
          heading: 101,
          ignition: true,
          batteryVoltage: 13.2,
          gpsSignal: 'ok',
          odometerKm: 84_513.4,
          recordedAt: new Date().toISOString(),
        },
      ],
    },
  });
  expect(response.status()).toBe(202);

  await expect(drawer).toContainText('62.4 km/h', { timeout: 10_000 });
});

test('6. offline vehicle renders from last-known position', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/tracking');
  await page.getByRole('button', { name: /fit to fleet/i }).click();

  const marker = page.locator(`[data-vehicle-id="${VEHICLE_3}"]`);
  await marker.waitFor({ state: 'visible', timeout: 20_000 });
  await expect(marker).toHaveClass(/vehicle-marker--offline/);
  await marker.click();

  const drawer = page.getByTestId('vehicle-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Offline');
});

test('7. trip listing and details', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/trips');

  await expect(page.getByRole('heading', { name: 'Trips', level: 1 })).toBeVisible();
  const table = page.getByRole('table');
  await expect(table.getByText('MH 12 AB 1234').first()).toBeVisible();
  await expect(table.getByText('Vivaan Patel').first()).toBeVisible();
  await expect(table.getByText('completed').first()).toBeVisible();

  // Open the deterministic fixture trip directly.
  await page.goto(`/trips/${TRIP_ID}`);
  await expect(page.getByRole('heading', { name: /Trip · MH 12 AB 1234/, level: 1 })).toBeVisible();
  await expect(page.getByText('Completed').first()).toBeVisible();
  await expect(page.getByText('Distance')).toBeVisible();
  await expect(page.getByText('Duration')).toBeVisible();
  await expect(page.getByText('Events')).toBeVisible();
});

test('8. trip route playback advances', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto(`/trips/${TRIP_ID}`);

  await expect(page.getByTestId('trip-map')).toBeVisible({ timeout: 20_000 });
  const scrubber = page.getByTestId('trip-playback-scrubber');
  await expect(scrubber).toBeVisible();

  const initialValue = await scrubber.evaluate((element) => Number(element.value));
  await page.getByTestId('trip-playback-toggle').click();
  await page.waitForTimeout(1_500);
  const advancedValue = await scrubber.evaluate((element) => Number(element.value));

  expect(advancedValue).toBeGreaterThan(initialValue);
});

test('9. geofence creation', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/geofences');

  await expect(page.getByRole('heading', { name: 'Geofences', level: 1 })).toBeVisible();
  await expect(page.getByTestId('geofence-map')).toBeVisible({ timeout: 20_000 });

  // Enter circle-draw mode and place the centre by clicking the map.
  await page.getByRole('button', { name: /^circle$/i }).click();
  const mapBox = await page.getByTestId('geofence-map').boundingBox();
  if (!mapBox) throw new Error('geofence map bounding box not available');
  await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);

  // The creation form appears; name the geofence and save.
  const nameInput = page.getByPlaceholder('e.g. Mumbai Depot');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('E2E Test Circle');
  await page.getByTestId('geofence-save').click();

  await expect(page.getByText('E2E Test Circle').first()).toBeVisible({ timeout: 15_000 });
});

test('10. geofence entry alerts after a boundary crossing', async ({ page, request }) => {
  await signIn(page, ADMIN);

  // Read the E2E circle (created in scenario 9) to get its exact centre.
  const login = await request.post('http://localhost:4100/api/v1/auth/login', {
    data: { email: ADMIN.email, password: ADMIN.password },
  });
  const accessToken = (await login.json()).accessToken;
  const listResponse = await request.get('http://localhost:4100/api/v1/geofences', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const circles = (await listResponse.json()).data.filter((geofence) => geofence.name === 'E2E Test Circle');
  expect(circles.length).toBeGreaterThan(0);
  const circle = circles[0];

  await page.goto('/geofences');
  await expect(page.getByTestId('geofence-map')).toBeVisible({ timeout: 20_000 });

  // Ingest a position exactly at the circle's centre → entry event.
  const ingest = await request.post(INGEST_URL, {
    headers: { 'content-type': 'application/json', 'x-ingest-key': INGEST_KEY },
    data: {
      events: [
        {
          deviceId: 'GEO-GPS-0001',
          vehicleId: VEHICLE_1,
          latitude: circle.centerLatitude,
          longitude: circle.centerLongitude,
          speedKph: 0,
          heading: 0,
          ignition: true,
          recordedAt: new Date().toISOString(),
        },
      ],
    },
  });
  expect(ingest.status()).toBe(202);

  // The events feed should list the entry.
  await page.getByRole('tab', { name: 'Events' }).click();
  await expect(page.getByText('E2E Test Circle').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('entry').first()).toBeVisible();
});

test('11. organisation-level authorization', async ({ page }) => {
  // A second org with no fleet must not see Geoventra vehicles.
  await signIn(page, NORTHSTAR_ADMIN);
  await page.goto('/tracking');

  await expect(page.getByText('0 of 0 shown')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('MH 12 AB 1234')).toHaveCount(0);
  await expect(page.getByText('MH 12 CD 5678')).toHaveCount(0);
  await expect(page.getByText('MH 12 EF 9012')).toHaveCount(0);
});
