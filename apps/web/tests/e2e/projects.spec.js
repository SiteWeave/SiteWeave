import { test, expect } from '@playwright/test';

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.describe('projects smoke', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run projects e2e');

    await page.goto('/login');
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 60_000 });
  });

  test('navigates to projects list from sidebar', async ({ page }) => {
    await page.getByTestId('nav-projects').click();
    await expect(page).toHaveURL(/\/projects\/?$/);

    const list = page.getByTestId('projects-list-view');
    const empty = page.getByTestId('projects-list-empty');
    const dashboard = page.getByTestId('dashboard-view');

    await expect(list.or(empty).or(dashboard)).toBeVisible({ timeout: 30_000 });
  });

  test('opens first project when projects exist', async ({ page }) => {
    await page.getByTestId('nav-projects').click();

    const projectRow = page.getByTestId('projects-list-view').locator('tbody tr').first();
    const hasProjects = await projectRow.isVisible({ timeout: 15_000 }).catch(() => false);

    test.skip(!hasProjects, 'No projects in test workspace — seed a project to run this spec');

    await projectRow.click();
    await expect(page.getByTestId('project-details-view')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/projects\/[^/]+/);
  });
});
