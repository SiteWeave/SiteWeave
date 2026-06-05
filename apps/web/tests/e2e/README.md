# E2E tests (Playwright)

```bash
npm run test:e2e
```

Set credentials for auth and projects smoke tests in `apps/web/.env.local` (never commit real values):

```env
E2E_TEST_EMAIL=your-test-user@example.com
E2E_TEST_PASSWORD=your-test-password
```

Playwright loads `.env.local` automatically via `playwright.config.js`. You can still override with shell `export` if needed.

Specs:
- `public-routes.spec.js` — login, signup, auth guards, invite page (no creds)
- `auth.spec.js` — login smoke + invalid credentials (login test skips without creds)
- `projects.spec.js` — sidebar navigation + open first project (requires creds)

Optional: `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_SKIP_WEBSERVER=1` when dev server is already running.

CI: configure `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` repository secrets for the web build workflow.
