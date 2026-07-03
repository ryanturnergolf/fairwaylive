# Clubhouse HQ Implementation Playbook

## Standard Loop

Use this loop for implementation work:

1. Inspect the relevant code, tests, and current Git state.
2. Implement the smallest safe change.
3. Run `npm run build`.
4. Run `npm run test:e2e`.
5. If something fails, inspect the failure and fix only the related issue.
6. Repeat build and test until the requested change is verified or a real blocker is found.
7. Report the files changed, behavior changed, and verification results.

## Final Report Format

Final reports should be concise and include:

- Files changed.
- What changed.
- What was intentionally not changed.
- Build result.
- Test result.
- Any known risks or follow-up recommendations.

If a command could not be run, say exactly which command was skipped or failed and why.

## When To Stop

Stop and ask the user before proceeding when:

- The requested change conflicts with existing architecture.
- Product behavior or scoring rules are ambiguous.
- Secrets, API keys, Supabase credentials, or database permissions are required.
- A fix would require unrelated refactoring.
- Tests reveal a broader regression outside the requested scope.
- The user explicitly asks for review or investigation only.

## Unrelated Changes

Unrelated changes are edits that do not directly support the requested behavior, test, documentation, or verification. Examples include formatting unrelated files, renaming components, changing package versions, altering scoring rules, moving storage schemas, or refactoring adjacent modules without need.

Do not revert unrelated user changes. Work around them when possible. If they block the requested task, report the conflict and ask how to proceed.

## Failed Tests

When tests fail:

- Read the failure output and identify whether it is related to the current change.
- Fix related failures with the smallest safe adjustment.
- Do not hide failures by skipping tests unless the user explicitly approves.
- Do not rewrite app behavior only to satisfy a brittle test.
- Prefer deterministic fixtures and stable selectors.
- Rerun the failing test first, then rerun the broader suite.
