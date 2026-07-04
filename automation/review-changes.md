# Review Changes

Use this prompt when reviewing the current working tree before a commit.

## Goal

Review the Git diff and decide what is intentional, what is temporary, and how changes should be grouped for commit.

## Checklist

1. Inspect `git status --short`.
2. Review diffs for tracked files.
3. Review untracked files that appear relevant.
4. Identify unrelated changes.
5. Detect debug code, temporary code, skipped tests, focused tests, console logs, TODOs, and manual test hacks.
6. Check whether package, config, schema, or generated files changed unexpectedly.
7. Recommend commit grouping.

## Unrelated Changes

Treat a change as unrelated when it does not directly support the requested behavior, test, documentation, or verification. Do not revert unrelated user changes unless explicitly instructed.

## Final Report

For each changed file, report:

- Whether the change is intentional and production-ready.
- Whether it contains leftover debugging or temporary code.
- Whether it should be included in the next commit.

Then recommend:

- Exact files to commit.
- Files to exclude.
- Suggested commit message.
