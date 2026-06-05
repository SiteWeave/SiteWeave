import { test, expect } from '@playwright/test';

test.describe('public routes smoke', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('signup page renders', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading')).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('protected routes redirect to login', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('legacy /messages redirects toward team or login', async ({ page }) => {
    await page.goto('/messages');
    await expect(page).toHaveURL(/\/(login|team)/, { timeout: 15_000 });
  });

  test('invite page loads without crashing', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/invite/smoke-test-token');
    await expect(page.locator('body')).toBeVisible();
    expect(errors.filter((m) => !/ResizeObserver/i.test(m))).toEqual([]);
  });
});
