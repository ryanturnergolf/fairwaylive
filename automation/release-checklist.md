# Release Checklist

Use this prompt before preparing a Clubhouse HQ change for commit, PR, or release.

## Required Checks

- `npm run build` passes.
- `npm run test:e2e` passes.
- No debug code remains.
- No unintended console logs remain.
- No TODOs remain unintentionally.
- No skipped or focused tests remain unintentionally.
- Working tree is clean or contains only intentional release changes.
- Documentation is updated when behavior, workflow, setup, or testing changed.
- Secrets are not committed.
- The change is ready to commit.

## Review Steps

1. Inspect `git status --short`.
2. Review relevant diffs.
3. Search for debug code, temporary code, `console.log`, `TODO`, `test.only`, and `test.skip`.
4. Run `npm run build`.
5. Run `npm run test:e2e`.
6. Confirm generated artifacts are not included.
7. Recommend commit files and commit message.

## Final Report

Report:

- Build result.
- Playwright result.
- Debug or TODO findings.
- Working tree status.
- Files ready to commit.
- Recommended commit message.
