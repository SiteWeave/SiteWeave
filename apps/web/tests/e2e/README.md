# E2E tests (Playwright)

```bash
npm run test:e2e
```

Set credentials for auth and projects smoke tests (never commit real values):

```bash
export E2E_TEST_EMAIL=your-test-user@example.com
export E2E_TEST_PASSWORD=your-test-password
```

Specs:
- `auth.spec.js` — login smoke + invalid credentials (login test skips without creds)
- `projects.spec.js` — sidebar navigation + open first project (requires creds)

Optional: `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_SKIP_WEBSERVER=1` when dev server is already running.

CI: configure `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` repository secrets for the web build workflow.
