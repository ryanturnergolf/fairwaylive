# Clubhouse HQ Production Release And Rollback Runbook

Last updated: 2026-07-31

## Purpose And Scope

This runbook defines the production release, smoke-test, rollback, communication, and rehearsal process required before Clubhouse HQ opens a controlled beta. It uses the repository's existing Git, Next.js, Playwright, and linked Supabase workflows. It does not assume a specific application hosting provider, CI/CD system, traffic-control feature, preview environment, or database rollback capability.

Application releases and database migrations are separate operational actions. The release record must identify both the application commit and remote migration ledger so operators can prove they are compatible.

## Release Roles

Assign a named primary and backup for each role before beta. One person may fill multiple roles in a small beta, but the release may not proceed without explicit ownership.

| Role | Responsibility |
| --- | --- |
| Release Owner | Coordinates the release, maintains the release record, and owns the go/no-go recommendation. |
| Deployment Approver | Reviews evidence and authorizes production deployment. Must not approve an unexplained failing check. |
| Database Migration Operator | Confirms the linked Supabase project, migration ledger, backup checkpoint, and migration result. |
| Rollback Authority | May stop a deployment, redeploy the known-good application, or invoke incident recovery. |
| Verification Lead | Runs production smoke tests and records pass/fail evidence. |
| Communications Lead | Notifies coaches and operators of freeze windows, release status, incidents, rollback, and recovery. |

The Release Owner and Deployment Approver should be different people when staffing permits. The person who wrote a high-risk migration should not be its only reviewer.

## Release Record

Create one immutable release record before deployment containing:

- release identifier and UTC date,
- release owner, approver, migration operator, rollback authority, verifier, and communications lead,
- candidate Git commit and previous known-good Git commit,
- expected production hostname and hosting project/environment,
- expected Supabase project name and reference,
- local and remote migration ledgers,
- backup/recovery-point identifier and timestamp,
- environment-variable verification result without secret values,
- build result,
- Playwright result and expected test count,
- focused/manual verification results,
- release notes and known limitations,
- deployment start/end times,
- deployed application commit and remote migration result,
- production smoke-test evidence,
- go/no-go and rollback decisions.

Never place passwords, database URLs containing credentials, raw access codes, share tokens, Supabase keys, or backup secrets in the release record.

## Tournament-Day Release Policy

### Standard freeze window

No routine application deployment or database migration is allowed from 24 hours before the first scheduled controlled-beta tee time until:

1. all active Tournament and Qualifying events are finalized or formally suspended,
2. post-finalization verification passes,
3. the post-event backup/recovery point is recorded, and
4. a two-hour observation window completes without a critical incident.

Documentation-only changes may be prepared during the freeze but should not trigger a production application deployment.

### Prohibited changes during the freeze

- schema or RLS changes,
- scoring, statistics, Review, official-resolution, readiness, leaderboard, synchronization, persistence, or finalization changes,
- dependency or runtime upgrades,
- environment-variable changes,
- token, authentication, rate-limit, or access-control changes,
- UI changes that can affect a live scoring workflow,
- QA seed execution against production unless required by an approved incident plan.

### Emergency hotfix exception

An emergency production change during the freeze is permitted only for:

- active data loss or corruption,
- inability to save or load authoritative scores,
- broken player access affecting the live field,
- security exposure,
- incorrect official results or finalization authority,
- production-wide outage.

The Rollback Authority and Deployment Approver must both authorize the exception. The hotfix must be the smallest isolated correction, include focused verification, preserve a known rollback commit, and follow the communication and observation steps in this runbook. New features, refactors, broad UX work, and unrelated fixes are prohibited.

## Release Prerequisites

### Product and operations

- No active tournament is inside the freeze window.
- The requested scope and acceptance criteria are approved.
- Known limitations and unresolved bugs have release dispositions.
- Support and incident contacts are available for the release window.
- The backup requirements in `BACKUP_RECOVERY.md` are satisfied.
- A recovery point exists immediately before any production migration.
- The previous known-good application commit is recorded and deployable.

### Repository state

1. Confirm the branch is `main`.
2. Fetch remote state and confirm local `main` equals `origin/main`.
3. Confirm the candidate commit is the reviewed commit intended for production.
4. Confirm the working tree contains no unintended files or release artifacts.
5. Review the complete diff from the deployed commit to the candidate.
6. Search for debug code, secrets, raw tokens/codes, `TODO`, `FIXME`, `console.log`, `test.only`, and `test.skip`.
7. Confirm dependency lockfile changes are intentional.
8. Confirm documentation and release notes match behavior.

Existing local artifacts such as `debug.log`, `supabase/.temp/`, `test-results/`, or untracked test files must never be included in a production release unless explicitly reviewed and required.

### Environment

- Confirm the production hostname and hosting project/environment.
- Confirm `NEXT_PUBLIC_APP_URL` is the exact public HTTPS origin.
- Confirm `NEXT_PUBLIC_SUPABASE_URL` targets the expected production project.
- Confirm `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the intended public anon key.
- Confirm the application and Supabase URLs pass the production validator: public HTTPS, no credentials/query/fragment, no loopback or reserved test/example host, and hosted `*.supabase.co` for Supabase.
- Confirm `MONITORING_ENABLED` and `NEXT_PUBLIC_MONITORING_ENABLED` are explicit, valid, and aligned; when enabled, confirm release identity is available without recording its configured value.
- Confirm no service-role or database credential is exposed to the browser.
- Confirm Supabase authentication redirect URLs include the production origin and do not include unintended external origins.
- Record that required variables exist; never record their secret values.

### Supabase target and migration ledger

The currently verified production project is `clubhouse-hq`, reference `gfpkhptrnddvwzorhgkm`. Before every database action:

1. display the linked project reference,
2. compare it with the approved release record,
3. inspect local and remote migration ledgers,
4. identify every pending or remote-only migration,
5. stop if the target or ledger is unexpected,
6. confirm pending migrations are exactly those approved for the release,
7. confirm a current recovery point exists.

Never edit a migration that has already been applied successfully. Correct deployed defects with a new forward migration.

## Build And Test Verification

Use a clean dependency state appropriate to the locked repository and run:

```text
npm run build
npm run test:e2e
```

Release verification requires:

- production build passes,
- TypeScript and static generation pass,
- full Playwright suite passes in one complete run,
- expected test count is recorded,
- relevant focused tests pass where the release changes a protected workflow,
- no test is weakened, skipped, focused, or silently retried to obtain approval,
- browser console and network errors found during manual verification are dispositioned.

The current documentation baseline is build passed and Playwright 244/244. A later release may have a different legitimate total, but the release record must explain the change.

## Migration Safety Review

For every pending migration, verify:

- valid PostgreSQL syntax and dependency order,
- backward compatibility with the currently deployed application,
- RLS, grants, ownership, and SECURITY DEFINER exposure,
- foreign-key and delete behavior,
- trigger/function replacement safety,
- concurrency and idempotency where relevant,
- expected row rewrites, locks, and duration,
- no destructive backfill without a separate reviewed recovery plan,
- old application compatibility during the application deployment window,
- new application behavior if migration deployment is interrupted.

If the old application cannot safely run against the migrated schema, the release is not eligible for the normal controlled-beta process. Redesign it as an expand/contract or otherwise backward-compatible forward migration before deployment.

## Standard Deployment Sequence

1. **Open release record.** Confirm roles, candidate commit, previous known-good commit, target environments, and freeze eligibility.
2. **Announce release start.** Communications Lead notifies beta operators of the change and observation window.
3. **Confirm recovery.** Record the pre-release backup/recovery point required by `BACKUP_RECOVERY.md`.
4. **Verify repository.** Confirm `main`, `origin/main`, clean intended scope, reviewed diff, and release notes.
5. **Verify environment.** Confirm the production validator and `/api/health` report ready, then verify hostname, public app URL, Supabase project identity, monitoring alignment/release identity, and auth redirects without exposing values.
6. **Build and test.** Run the production build and complete Playwright suite; record results.
7. **Verify Supabase link and ledger.** Stop on any unexpected target or migration.
8. **Deploy approved additive migrations first.** Use the repository's established linked Supabase deployment workflow only after confirming backward compatibility and backup evidence.
9. **Verify remote ledger and database health.** Confirm every intended migration is applied exactly once and no pending conflict remains.
10. **Deploy the application candidate.** Use the configured production hosting provider's approved deployment mechanism and record the resulting deployment identifier/URL.
11. **Verify deployed commit.** Confirm the running release corresponds to the candidate commit through provider metadata or another approved release identifier.
12. **Run production smoke tests.** Use the checklist below with designated canary data.
13. **Observe.** Monitor authentication, API failures, score mutations, and database errors for the defined observation window.
14. **Approve or roll back.** Deployment Approver records production acceptance; Rollback Authority acts if criteria are met.
15. **Close communications.** Report success, known limitations, or rollback outcome.

Do not run migrations concurrently with an application deployment. Do not begin the next step until the previous step has a recorded result.

## Production Smoke Test Checklist

Use an approved canary coach and disposable or pre-designated canary event. Do not alter a real active or certified historical tournament. Record timestamps and identifiers, but never raw codes or tokens.

### Public and authentication

- [ ] Production homepage returns successfully over HTTPS.
- [ ] Universal player scoring-code entry is visible.
- [ ] Invalid code returns the generic safe error without leaking event type.
- [ ] Coach sign-in succeeds for the canary coach.
- [ ] Sign-out returns to the signed-out state.
- [ ] Anonymous access to authenticated routes/APIs remains rejected.

### Coach dashboard and creation

- [ ] Coach Dashboard loads without console or failed network errors.
- [ ] Existing Tournament and Qualifying catalogs load with correct ownership isolation.
- [ ] Create one disposable canary tournament through the normal idempotent workflow.
- [ ] Refresh and reauthentication preserve the same tournament UUID without duplication.
- [ ] Add or verify players and pairings through normal operations.
- [ ] Generate or recognize durable scorecards without duplicate rows.

### QR/share and mobile scorecard

- [ ] Generate or use an approved canary QR/share link.
- [ ] Signed-out scorecard opens for the correct player and round.
- [ ] Universal code entry returns only expected participants.
- [ ] Existing scorecard data reloads without hydration writes or identity crossover.
- [ ] If the canary is writable, save one disposable hole and verify self/marker identity and statistics persistence.
- [ ] No duplicate score or hole rows are created.

### Live scoring and Review

- [ ] Live leaderboard loads and updates from authoritative values.
- [ ] Individual and team totals are correct for the canary fixture.
- [ ] Competition tie positions remain correct.
- [ ] Review loads the correct self and inverse-marker identities.
- [ ] Existing official values project into standings without changing audit rows.

### Finalized read-only event

- [ ] Open a pre-designated finalized Tournament and Qualifying history record.
- [ ] Rankings, statistics, Review history, and finalization timestamps are visible.
- [ ] Score edits are rejected or unavailable.
- [ ] Access-code rotation and other finalized mutations remain disabled.
- [ ] QR/share read-only access remains valid according to current policy.

### Cleanup and acceptance

- [ ] Dispose of or clearly label the canary event through an approved non-destructive workflow.
- [ ] Confirm no certified pilot data changed.
- [ ] Confirm no unexpected score, player, pairing, Review, snapshot, token, or statistic mutations occurred.
- [ ] Verification Lead signs the smoke-test result.
- [ ] Deployment Approver records go/no-go.

## Rollback Decision Criteria

Rollback the application immediately when a release causes or plausibly causes:

- inability to authenticate or access an owned tournament,
- incorrect player/tournament isolation,
- failed or duplicated score persistence,
- incorrect score identity, totals, Review, official projection, readiness, or finalization,
- loss of finalized read-only enforcement,
- widespread 5xx/network failures,
- security or credential exposure,
- an error rate or performance regression that makes live operation unsafe.

Consider a monitored forward hotfix instead of rollback only when the old application is incompatible with an already-applied migration, rollback would increase data risk, and the smallest forward correction is understood and approved.

## Application Rollback Procedure

1. Rollback Authority declares rollback and records the reason and UTC time.
2. Communications Lead tells beta operators to stop affected mutations and finalization.
3. Preserve logs, screenshots, failed requests, release/deployment identifiers, and current database state.
4. Confirm the previous known-good commit and its compatibility with the current remote migration ledger.
5. Redeploy that exact commit using the production hosting provider's supported rollback/redeployment mechanism.
6. Do not revert or delete applied database migrations as part of application rollback.
7. Verify environment variables and production hostname remain unchanged unless they caused the incident.
8. Run the rollback validation checklist.
9. Observe the restored application for the defined incident window.
10. Communicate rollback completion, known data impact, and next steps.

If the previous application is not compatible with the current database schema, stop and invoke the forward-fix policy. Do not deploy an incompatible binary merely to restore an older UI.

## Database Forward-Fix Policy

Applied production migrations are immutable. Clubhouse HQ does not perform ad hoc down migrations during a release incident.

When a deployed migration is defective:

1. stop further application deployment if safe,
2. preserve the database state and confirm the recovery point,
3. determine whether the prior application remains compatible,
4. create a new narrowly scoped corrective migration,
5. review syntax, RLS, grants, triggers, constraints, concurrency, and historical preservation,
6. verify the corrective migration against a disposable or isolated target when possible,
7. run focused tests, production build, and full Playwright regression,
8. deploy only the corrective migration after approval,
9. verify the remote ledger and real database behavior,
10. document the defect and correction.

Use full database recovery from `BACKUP_RECOVERY.md` only when a forward fix cannot restore trustworthy authority or the migration caused broad destructive data loss.

## Rollback Validation Checklist

- [ ] Production route and homepage respond over HTTPS.
- [ ] Deployed application matches the recorded known-good commit.
- [ ] Remote migration ledger is recorded and compatible.
- [ ] Coach authentication and dashboard load.
- [ ] Existing Tournament and Qualifying records retain ownership and identity.
- [ ] Universal code and QR/share access isolate the correct participants.
- [ ] Mobile scorecard loads authoritative data.
- [ ] Score saving is tested only on an approved canary and does not duplicate rows.
- [ ] Live standings, Review, official projection, readiness, and finalization remain correct.
- [ ] Finalized events remain read-only.
- [ ] No certified historical data changed.
- [ ] Monitoring/observation shows no continuing release-related failures.
- [ ] Communications Lead reports the result and any data impact.

## Release And Rollback Communications

### Standard release messages

1. **Planned:** scope, start time, expected impact, freeze status, and contact.
2. **Started:** release identifier and observation window.
3. **Migration complete:** database result without credentials or internal secrets.
4. **Application deployed:** smoke testing in progress.
5. **Complete:** verified commit, smoke result, known limitations, and support contact.

### Incident or rollback messages

1. **Issue detected:** affected workflow and instruction to pause relevant actions.
2. **Decision:** rollback or forward-fix plan and expected next update.
3. **Restored:** known-good commit/current migration state and verification in progress.
4. **Resolved:** validation result, data impact, and whether play may resume.
5. **Follow-up:** incident review owner and timeline.

Player-facing communication must be concise and must not expose internal IDs, security controls, raw codes, tokens, or database details. Operator records may include UUIDs but not credentials.

## Required Pre-Beta Release Drill

Perform this rehearsal using the actual intended hosting workflow and a disposable non-production or isolated environment before beta:

1. Assign all release roles and open a rehearsal release record.
2. Select a known-good commit, a candidate commit, and an approved additive test migration or a no-migration candidate.
3. Confirm a recovery point under `BACKUP_RECOVERY.md`.
4. Verify branch, remote synchronization, environment identity, Supabase project link, and migration ledger.
5. Run production build and full Playwright regression.
6. Deploy the candidate using the documented standard sequence.
7. Run every applicable production smoke-test item against canary data.
8. Inject or simulate a release failure without affecting production data.
9. Exercise application rollback to the known-good commit.
10. Verify the database migration remains applied and compatible, or rehearse a forward corrective migration in the isolated environment.
11. Run the rollback validation checklist.
12. Measure deployment, detection, decision, rollback, and validation times.
13. Record gaps, update this runbook, and repeat until the release and rollback criteria pass.

The drill passes only when operators can identify the running commit and migration state, deploy safely, detect a simulated failure, restore the known-good application, preserve database authority, and complete validation within the agreed operational window.

## Unresolved Pre-Beta Assumptions

- The production application hosting provider/project and its supported rollback mechanism.
- How the running application exposes or proves its deployed commit/release identifier.
- Whether a separate preview/staging environment is available.
- How production traffic can be paused during a critical release or restore.
- Named primary and backup owners for every release role.
- The observation-window duration for routine releases outside tournament-day freeze.
- The approved canary coach, canary event, and non-destructive cleanup process.
- Whether deployment and smoke testing are manual or automated by a future CI/CD system.

These assumptions must be resolved and recorded before opening controlled beta.
