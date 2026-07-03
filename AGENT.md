# Clubhouse HQ Agent Guide

Clubhouse HQ is a tournament operations and live scoring application for golf events. The current architecture includes localStorage-backed tournament workflows, mobile scorecards, review flows, and Supabase-backed score persistence through the Score Service and Score Repository.

Agents working in this project should preserve the existing product behavior unless the user explicitly asks for a behavior change. Scoring, score review, tournament setup, and score persistence are sensitive workflows.

## Development Workflow

Use this workflow for implementation tasks:

1. Design
2. Implement
3. Build
4. Test
5. Commit
6. Sync

Do not skip the build and test steps after implementation unless the user explicitly tells you not to run them.

## Working Rules

- Make small, focused changes.
- Never mix refactors with bug fixes.
- Never change scoring rules without explicit approval.
- Prefer automation over manual steps.
- Keep localStorage behavior unless the user explicitly asks to remove or replace it.
- Preserve the existing flow: UI to service layer to repository to persistence backend where that architecture exists.
- Run `npm run build` and `npm run test:e2e` after implementation.
- Stop and ask if blocked by architecture decisions, product rules, secrets, or database permissions.
- Do not commit unless explicitly instructed.

## Change Discipline

Before editing, inspect the relevant files and existing patterns. Keep changes close to the requested behavior and avoid broad cleanup. If unrelated issues are discovered, report them separately instead of folding them into the current change.
