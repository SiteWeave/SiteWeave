import { test, expect } from '@playwright/test';
import { getE2ECredentials, loginAsTestUser } from './helpers/auth.js';

test.describe('projects smoke', () => {
  test.beforeEach(async ({ page }) => {
    const { configured } = getE2ECredentials();
    test.skip(!configured, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in apps/web/.env.local');
    await loginAsTestUser(page);
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
