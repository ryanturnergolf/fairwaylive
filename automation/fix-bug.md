# Fix Bug

Use this prompt when fixing a reported Clubhouse HQ bug.

## Goal

Reproduce the bug, identify the root cause, implement the smallest safe fix, and verify the fix with build and Playwright.

## Loop

1. Inspect current Git state.
2. Reproduce the bug or confirm the failure mode from logs, tests, or code.
3. Find the root cause.
4. Implement the smallest safe fix.
5. Run `npm run build`.
6. Run Playwright with `npm run test:e2e`.
7. If anything fails, inspect the failure and fix only the related issue.
8. Repeat until passing or blocked.

## Constraints

- Preserve existing product behavior outside the bug.
- Do not change scoring rules without explicit approval.
- Do not hide failures by skipping tests.
- Do not mix unrelated cleanup or refactors into the fix.
- Do not commit unless explicitly instructed.

## Final Report

Report:

- Reproduction or observed failure.
- Root cause.
- Files changed.
- Fix summary.
- Build result.
- Playwright result.
- Any follow-up recommendations.
