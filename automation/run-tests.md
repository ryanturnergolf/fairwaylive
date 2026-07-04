# Run Tests

Use this prompt to verify the current Clubhouse HQ working tree.

## Goal

Build the app, run Playwright, and summarize results clearly.

## Steps

1. Inspect current Git state.
2. Run `npm run build`.
3. Run `npm run test:e2e`.
4. If failures occur, capture the important error output.
5. Categorize each failure.

## Failure Categories

- Build failure: TypeScript, Next.js compilation, missing env requirements, or production build errors.
- App failure: runtime behavior, navigation, hydration, state, persistence, or UI behavior breaks.
- Test failure: brittle selector, fixture mismatch, timing issue, or incorrect test expectation.

## Constraints

- Do not modify files unless explicitly asked to fix failures.
- Do not skip failing tests.
- Do not delete useful failure artifacts until the result has been reported.

## Final Report

Report:

- Build result.
- Playwright result.
- Failure category, if any.
- Most relevant error lines.
- Recommended next step.
