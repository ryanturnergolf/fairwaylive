# Continuous Implementation

Use this prompt to run the standard autonomous implementation loop for Clubhouse HQ.

## Purpose

Carry a requested milestone from inspection through implementation, verification, cleanup, and final reporting without repeated prompting.

## Standard Loop

1. Read `AGENT.md`.
2. Read `PLAYBOOK.md`.
3. Read `TESTING.md`.
4. Read the requested automation file.
5. Inspect the current implementation.
6. Implement the milestone.
7. Run `npm run build`.
8. Run `npm run test:e2e`.
9. If build fails, fix it.
10. If tests fail, fix them.
11. Repeat until build and tests are green.
12. Review `git diff` for unrelated changes.
13. Remove debug code.
14. Run `automation/release-checklist.md`.
15. Produce one final summary only.

## Stop Conditions

Stop only if blocked by:

- Architecture decision.
- Missing secrets.
- Missing permissions.
- Ambiguous product requirement.

## Final Summary

The final summary should include:

- Milestone completed.
- Files changed.
- Build result.
- Playwright result.
- Release checklist result.
- Any blocker or risk, if present.

Do not commit unless explicitly instructed.
