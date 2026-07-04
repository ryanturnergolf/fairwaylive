# Implement Feature

Use this prompt when adding a new Clubhouse HQ feature.

## Required Reading

Read these files first:

- `AGENT.md`
- `PLAYBOOK.md`
- `TESTING.md`

Follow their workflow and stopping rules.

## Goal

Implement the requested feature with the smallest safe change that fits the existing architecture and product behavior.

## Loop

Use this loop until the work is green:

1. Inspect the relevant code, tests, docs, and current Git state.
2. Implement the smallest focused change.
3. Run `npm run build`.
4. Run Playwright with `npm run test:e2e`.
5. If build or tests fail, inspect the failure and fix only the related issue.
6. Repeat build and Playwright until green.
7. Report the result.

## Stop Conditions

Stop only for:

- Architectural decisions that require product or owner input.
- Missing secrets or credentials.
- Database or filesystem permissions that cannot be resolved safely.
- Unclear requirements where a reasonable assumption could change product behavior.

## Constraints

- Do not mix refactors with feature work.
- Do not change scoring rules without explicit approval.
- Do not remove localStorage behavior unless explicitly requested.
- Do not commit unless explicitly instructed.

## Final Report

Report:

- Files changed.
- Feature behavior added.
- What was intentionally not changed.
- Build result.
- Playwright result.
- Any remaining risks.
