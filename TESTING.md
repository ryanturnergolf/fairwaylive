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
npm ci
npx playwright install --with-deps chromium
npm run build
npm run test:e2e
```

The job stops on the first failing step. Playwright `test-results/` and `playwright-report/` artifacts are uploaded only when the job fails and are retained for seven days. The workflow uses no production Supabase credentials; the existing suite relies on deterministic fixtures, route interception, and public build-time fallbacks rather than direct CI writes to the connected production project.

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
