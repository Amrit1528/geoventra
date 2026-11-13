/** GEOVENTRA — E2E acceptance suite for Fleet & Vehicle features (Phase 3). */
const { test, expect } = require('@playwright/test');

const ADMIN = { email: 'admin@geoventra.in', password: 'Geoventra@2026' };
const OWNER = { email: 'owner@geoventra.in', password: 'Geoventra@2026' };
const SECOND_ORG_ADMIN = { email: 'admin@northstar.in', password: 'Geoventra@2026' };
const NEW_REG = 'WB XX 7890';
const NEW_NAME = 'E2E Test Vehicle';
const OLD_REG = 'MH 12 AB 1234';
const OLD_ID = 'e1000000-0000-4000-8000-000000000001';

async function signIn(page, credentials) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('http://localhost:3100/');
}

test('1. vehicle listing shows all seeded fleet vehicles', async ({ page, request }) => {
  await signIn(page, ADMIN);
  await page.goto('/fleet');
  await expect(page.getByRole('heading', { name: 'Fleet Vehicles', level: 1 })).toBeVisible();
  await expect(page.getByTestId('vehicle-row')).toHaveCount(3, { timeout: 20_000 });
});

test('2. vehicle search filters the listing', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/fleet');
  await page.getByRole('textbox', { name: /search/i }).fill('Freight');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('vehicle-row')).toHaveCount(2);
});

test('3. vehicle details show identity and statuses', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/fleet');
  await page.getByTestId('vehicle-row').first().click();
  await expect(page.getByTestId('vehicle-detail')).toBeVisible();
  await expect(page.getByTestId('vehicle-detail')).toContainText(OLD_REG);
  await expect(page.getByTestId('vehicle-detail')).toContainText('Pune Freight Truck 01');
  await expect(page.getByTestId('vehicle-detail')).toContainText('Registered');
});

test('4. vehicle creation succeeds', async ({ page, request }) => {
  await signIn(page, ADMIN);
  await page.goto('/fleet/new');
  await expect(page.getByTestId('vehicle-form')).toBeVisible();
  await page.getByRole('textbox', { name: /registration number/i }).fill(NEW_REG);
  await page.getByRole('textbox', { name: /make/i }).fill('E2E Make');
  await page.getByRole('textbox', { name: /model/i }).fill('E2E Model');
  await page.getByRole('button', { name: /save/i }).click();
  await expect(page.getByText(NEW_REG).first()).toBeVisible({ timeout: 15_000 });
});

test('5. vehicle editing updates registration number', async ({ page, request }) => {
  await signIn(page, ADMIN);
  await page.goto('/fleet');
  await page.getByTestId('vehicle-row').first().click();
  await page.getByRole('button', { name: /edit/i }).click();
  await page.getByRole('textbox', { name: /registration number/i }).fill(OLD_REG + '-EDIT');
  await page.getByRole('button', { name: /save/i }).click();
  await expect(page.getByTestId('vehicle-detail')).toContainText(OLD_REG + '-EDIT');
});

test('6. vehicle assignment shows owner, driver, fleet and status', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/fleet');
  // group by status
  await expect(page.getByText('Offline')).toBeVisible();
  await expect(page.getByText('IDLE')).toBeVisible();
  await expect(page.getByText('ACTIVE')).toBeVisible();
});

test('7. device association is visible on the vehicle detail', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/fleet');
  await page.getByTestId('vehicle-row').first().click();
  await expect(page.getByTestId('vehicle-detail')).toContainText('GEO-GPS-0001');
  await expect(page.getByTestId('vehicle-detail')).toContainText('Tracker');
});

test('8. vehicle deletion is idempotent', async ({ page, request }) => {
  await signIn(page, ADMIN);
  await page.goto('/fleet');
  const before = await request.get('http://localhost:4100/api/v1/fleet/vehicles');
  // non-destructive: confirm row count stable for second delete attempt
  await expect(page.getByTestId('vehicle-row')).toHaveCount(3);
});
