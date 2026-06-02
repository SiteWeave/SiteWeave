import { test, expect } from '@playwright/test';

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.describe('auth smoke', () => {
  test('email login reaches workspace shell', async ({ page }) => {
    test.skip(!email || !password, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run login e2e');

    await page.goto('/login');
    await expect(page.getByTestId('login-form')).toBeVisible();

    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 60_000 });
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
