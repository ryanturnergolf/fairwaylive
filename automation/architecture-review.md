# Architecture Review

Use this prompt when reviewing Clubhouse HQ architecture.

## Goal

Review whether the current implementation is consistent with the Project Bible, Roadmap, and `AGENT.md`, then recommend only necessary improvements.

## Review Inputs

Read available project guidance first, including:

- `AGENT.md`
- `PLAYBOOK.md`
- Project Bible, if present.
- Roadmap, if present.
- Relevant feature docs or migrations.

## Checklist

- Confirm the implementation follows established architecture boundaries.
- Confirm service and repository layers are used where expected.
- Check that UI behavior is not coupled directly to persistence details unless that is an existing pattern.
- Detect duplicated logic, unclear ownership, and unnecessary abstractions.
- Detect technical debt that creates real product or maintenance risk.
- Separate required improvements from optional cleanup.

## Constraints

- Do not recommend broad rewrites unless the current architecture blocks the requested goal.
- Do not mix architecture cleanup with bug fixes unless necessary.
- Do not change files during review unless explicitly instructed.

## Final Report

Report:

- Architecture alignment.
- Risks or technical debt.
- Necessary improvements.
- Optional improvements.
- Recommended next action.
