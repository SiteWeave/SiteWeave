import { test, expect } from '@playwright/test';
import { getE2ECredentials, loginAsTestUser } from './helpers/auth.js';

test.describe('auth smoke', () => {
  test('email login reaches workspace shell', async ({ page }) => {
    const { configured } = getE2ECredentials();
    test.skip(!configured, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in apps/web/.env.local');

    await loginAsTestUser(page);
    await expect(page.getByTestId('app-shell')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('invalid@example.com');
    await page.getByTestId('login-password').fill('wrong-password-123');
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('app-shell')).not.toBeVisible();
  });
});
