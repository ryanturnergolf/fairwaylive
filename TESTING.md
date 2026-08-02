# Clubhouse HQ Testing Guide

Clubhouse HQ uses Playwright for end-to-end browser testing. The Playwright configuration lives in `playwright.config.ts`, and e2e tests live in `tests/e2e`.

## Current Playwright Setup

The current Playwright setup runs Chromium tests against a local production server. The e2e script is:

```bash
npm run test:e2e
```

The current configuration starts the app with `npm run start -- -p 3100`, so run a production build before running e2e tests.

## Continuous Integration

`.github/workflows/ci.yml` runs for every pull request and every push to `main`. The verification job uses Node 20.x, which satisfies Next.js 16.2.9's Node `>=20.9.0` requirement, and enables npm dependency caching through `actions/setup-node`.

CI runs, in order:

```bash
validate required Supabase configuration
npm ci
npx playwright install --with-deps chromium
npm run build
npm run test:e2e
```

The job stops on the first failing step. Playwright `test-results/` and `playwright-report/` artifacts are uploaded only when the job fails and are retained for seven days.

The application must receive Supabase client configuration at build time so the browser client is created and Playwright can intercept its `/auth/v1` and `/rest/v1` requests. Configure these GitHub Actions repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

These are client-safe configuration values, not privileged server credentials. Never add a service-role key to this workflow. The validation step fails before dependency installation when either required secret is absent or the URL is not a hosted Supabase project URL.

Playwright reaches the local production server through `http://127.0.0.1:3100`; that browser test origin is intentionally separate from `NEXT_PUBLIC_APP_URL`. The latter is the externally shareable origin embedded in generated QR links. Hosted CI sets it to the reserved, non-routable test origin `https://ci.clubhouse-hq.example`, while production must provide its actual public deployment URL. This value is public configuration and does not require a GitHub secret or variable for the deterministic CI suite.

The suite primarily uses deterministic fixtures, route interception, and static migration/service contracts. It does not require a service-role credential and must not perform privileged production writes. A dedicated test or staging Supabase project with the current migration ledger is preferred for CI isolation. If the production project is used temporarily, only its public URL and anonymous key may be configured, and existing RLS remains the security boundary.

GitHub does not expose repository secrets to pull requests from forks. Those runs will fail at the explicit configuration step rather than silently skipping Supabase-dependent coverage.

The Phase 8 candidate hosted baseline is 260 tests. A local untracked `tests/e2e/qualifying-data-foundation.spec.ts` contains four additional tests and is intentionally excluded from CI until a separate milestone explicitly approves it. An unfiltered local workspace run may therefore report 264 without changing the intended hosted baseline.

Focused coach onboarding coverage verifies first-time visibility, durable dismiss/resume behavior, experienced-coach defaults, direct projection of certified readiness, and preservation of existing coach routes. Tests mock the authenticated Supabase account boundary and owner-scoped reads; they do not replace readiness calculations.

Mobile Review helpers race the two valid web-first completion states: an automatically rendered `Verify Score` view or an enabled `Review & Submit Round` action. They follow the state that actually completes instead of inferring readiness from instantaneous button snapshots. The helper adds no sleeps and does not weaken Review assertions; its focused bound covers the existing sequential score and statistics hydration contract.

The rapid Save Hole persistence regression deliberately injects write latency across all 18 holes to exercise the serialized atomic save queue. It waits for both score inputs to become editable before each next entry and has a timeout scoped to that test only. This preserves the race-condition and adjacent-hole assertions while allowing the expected atomic-save workload to complete on slower hosted runners; the global Playwright timeout is unchanged.

### Monitoring foundation

`tests/e2e/monitoring-foundation.spec.ts` verifies `/api/health`, production environment validation, sensitive-data redaction, structured reporting, and the disabled-by-default client reporting endpoint. Production requires the three existing public application/Supabase variables. Monitoring is optional and configured with:

- `MONITORING_ENABLED=true` for structured server/API reporting and acceptance of sanitized client reports,
- `NEXT_PUBLIC_MONITORING_ENABLED=true` to install browser error listeners,
- optional `APP_RELEASE` and `NEXT_PUBLIC_APP_RELEASE` labels when deployment commit metadata is not supplied automatically.

Never place a service-role key, scoring code, share/access token, auth token, or monitoring payload containing private player/score data in test configuration.

The managed test server sets `PLAYWRIGHT_MANAGED_SERVER=1` so production-mode Next.js execution retains test-origin support without weakening actual production validation. Hosted CI separately retains its `CI=true` context and reserved public QR origin. Neither marker should be set on an actual production deployment.

Production environment coverage verifies valid/missing configuration, malformed and credential-bearing URLs, HTTP/loopback/reserved production rejection, hosted Supabase enforcement, monitoring flag alignment, release identity, safe error text, and public health output.

### Developer/QA seed access

The managed test server's `PLAYWRIGHT_MANAGED_SERVER=1` marker enables the three existing seed workflows for Playwright without enabling them in an actual deployment. `tests/e2e/qa-seed-access.spec.ts` verifies production-default denial, action-boundary enforcement, local/Playwright access, explicit operator allowlisting, hidden dashboard controls, and unchanged normal Tournament creation. Production must leave `QA_SEED_TOOLS_ENABLED=false` unless a named operator needs temporary access; any enabled deployment must list only approved authenticated coach UUIDs in the server-only `QA_SEED_OPERATOR_IDS` value.

## Current Tests

- `tests/e2e/home.spec.ts`: verifies that the homepage loads.
- `tests/e2e/mobile-scorecard-persistence.spec.ts`: seeds deterministic localStorage tournament data, opens a mobile scorecard, saves player and marker scores, refreshes, and verifies the scores persist.

## How To Run

Run these commands after implementation work:

```bash
npm run build
npm run test:e2e
```

For focused debugging, run a single Playwright spec:

```bash
npx playwright test tests/e2e/mobile-scorecard-persistence.spec.ts
```

## Test Expectations

- New features should add or update tests when practical.
- Tests should use deterministic localStorage fixtures where possible.
- Prefer stable user-facing selectors such as roles and labels.
- Minimize manual testing by encoding repeatable workflows in Playwright.
- Avoid test-only changes to production behavior unless explicitly approved.
- Keep fixtures small, readable, and scoped to the workflow being tested.
