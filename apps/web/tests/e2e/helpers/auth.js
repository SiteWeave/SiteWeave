import { expect } from '@playwright/test';

export function getE2ECredentials() {
  const email = (process.env.E2E_TEST_EMAIL || '').trim();
  const password = (process.env.E2E_TEST_PASSWORD || '').trim();
  return { email, password, configured: Boolean(email && password) };
}

/** Password login; waits until workspace shell or dashboard is visible. */
export async function loginAsTestUser(page) {
  const { email, password, configured } = getE2ECredentials();
  if (!configured) {
    throw new Error('Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in apps/web/.env.local');
  }

  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toBeVisible();

  const emailInput = page.getByTestId('login-email');
  const passwordInput = page.getByTestId('login-password');
  await emailInput.click();
  await emailInput.fill(email);
  await passwordInput.click();
  await passwordInput.fill(password);

  const submit = page.getByTestId('login-submit');
  await expect(submit).toBeEnabled({ timeout: 15_000 });

  const authResponse = page.waitForResponse(
    (res) => res.url().includes('/auth/v1/token') && res.request().method() === 'POST',
    { timeout: 30_000 },
  );

  await submit.click();

  const response = await authResponse;
  let authBody = {};
  try {
    authBody = await response.json();
  } catch {
    authBody = {};
  }

  if (!response.ok() || authBody?.error) {
    const detail =
      authBody?.error_description
      || authBody?.msg
      || authBody?.error
      || `HTTP ${response.status()}`;
    throw new Error(
      `E2E login failed (${detail}). Verify E2E_TEST_EMAIL and E2E_TEST_PASSWORD in apps/web/.env.local.`,
    );
  }

  await expect(page).not.toHaveURL(/\/login$/, { timeout: 90_000 });
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 90_000 });
}
