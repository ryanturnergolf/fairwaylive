# Clubhouse HQ Backup And Recovery Runbook

Last updated: 2026-07-31

## Purpose And Scope

This runbook defines the minimum backup, recovery, communication, and verification process required before Clubhouse HQ opens a controlled beta. It documents the current Supabase and Tournament Aggregate architecture; it does not assume that point-in-time recovery (PITR), cross-region replicas, or another paid Supabase capability is enabled.

This runbook applies to the connected production Supabase project, the deployed application, and operator-controlled recovery artifacts. It does not treat browser localStorage as a database backup.

## Recovery Roles

Assign people to these roles before beta. One person may hold more than one role during a small controlled beta, but every role must have a named primary and backup contact.

| Role | Responsibility |
| --- | --- |
| Beta Release Owner | Approves releases, confirms backups, and authorizes rollback or restore. |
| Database Recovery Lead | Operates Supabase backup/restore tooling and preserves recovery evidence. |
| Tournament Incident Lead | Pauses tournament operations, records affected events, and communicates with coaches. |
| Verification Lead | Validates restored identities, totals, Reviews, readiness, and read-only state. |

Only an authorized project administrator may perform a database restore. Coaches and players must not attempt recovery through browser editing, direct table access, duplicate events, or replacement score rows.

## Authoritative Data And Backup Scope

Supabase durable tables are the recovery authority. Backups must include the complete database schema, migration ledger, public and private application schemas, functions, triggers, RLS policies, and data needed to preserve relationships and audit history.

The protected data scope includes:

- coach ownership and tournament membership,
- tournaments and their creation/finalization metadata,
- `tournament_players`, `tournament_rounds`, pairings, and `tournament_scorecards`,
- `score_entries`, `score_hole_entries`, and `score_review_status`,
- `tournament_state_snapshots`,
- share tokens, team codes, Qualifying access codes, and their private exchange/rate-limit records where included by the backup mechanism,
- Qualifying sessions, days, participants, groups, memberships, scorer assignments, and finalization metadata,
- seasons, roster players, and season memberships,
- statistic definitions, immutable versions, packages, assignments, and `statistic_hole_values`.

Authoritative scoring and event records must be recovered together. A tournament row restored without its players, rounds, pairings, scorecards, scores, Review state, and relevant Qualifying metadata is not a valid recovery.

### Non-authoritative recovery inputs

- `tournament_state_snapshots` are cached workspace envelopes, not a substitute for durable Tournament Engine rows.
- Browser localStorage is an offline cache and recovery aid for the specific browser profile only.
- Printed scorecards, screenshots, exports, and coach notes may corroborate an incident but are not database authority.
- QA seed data is disposable and must not be mixed into a production recovery.

## Backup Strategy

### Required cadence

| Operating state | Required protection |
| --- | --- |
| No active tournament | One verified database backup every 24 hours. |
| Before a production migration or release | Confirm a restorable backup immediately before deployment and record its timestamp. |
| During an active controlled-beta tournament | Recovery coverage capable of meeting the 15-minute RPO target for the full event window. |
| After finalization | Record a post-finalization backup or PITR checkpoint after authoritative state is verified. |

### Supabase plan-dependent options

If the connected Supabase plan provides managed backups and PITR, the Database Recovery Lead must confirm that they are enabled, record the retention window, and verify that the project can restore to an isolated recovery target or an approved project restore point.

If PITR is not available, use scheduled logical backups through a supported Supabase/PostgreSQL export mechanism. At minimum:

1. create and verify a full logical backup before the event,
2. capture logical backups frequently enough during active scoring to meet the agreed RPO,
3. create a backup after Review convergence and before finalization,
4. create a backup after finalization,
5. encrypt and store backups outside the application host with access restricted to recovery owners.

A plan or process that cannot meet the active-tournament RPO must be recorded as an accepted beta limitation before the event. localStorage does not close that gap.

### Backup evidence

For every backup or managed recovery point, record:

- UTC timestamp,
- Supabase project reference and environment,
- migration ledger/version,
- application commit deployed,
- backup type and retention expiration,
- encrypted storage location or managed-backup identifier,
- operator,
- verification result and file checksum when a logical file is produced.

Never place database dumps, access tokens, passwords, service-role keys, or recovery credentials in the repository, application logs, tickets, or coach-facing communication.

## Recovery Objectives

| Context | RPO | RTO |
| --- | --- | --- |
| Active tournament scoring | 15 minutes | 2 hours |
| Between events | 24 hours | 4 hours |

RPO is the maximum acceptable authoritative data loss measured from the incident to the latest usable recovery point. RTO is the target time to restore service and complete integrity verification. These are operational targets, not claims about the current Supabase plan. The Beta Release Owner must confirm the selected backup mechanism can meet them before beta.

## Incident Intake And Communication

1. Open one incident record and assign an incident ID.
2. Record detection time in UTC, reporter, affected coach, tournament and Qualifying UUIDs, player/round/hole identities, and the last known correct time.
3. Ask coaches and players to stop edits, Review actions, code rotation, submission, and finalization for the affected event. Do not ask them to recreate rows.
4. Preserve screenshots, request timestamps, browser/device details, and relevant centralized logs when available. Never capture raw scoring codes or share tokens.
5. The Database Recovery Lead identifies the last known good recovery point and reports expected data loss and recovery time.
6. The Beta Release Owner chooses targeted recovery, full restore, supported in-product correction, or no action.
7. Provide coaches with status at incident start, after the recovery choice, when verification begins, and when service resumes.
8. Record the final timeline, recovered objects, verification evidence, and any data intentionally not restored.

## Recovery Decision Rules

- Prefer a supported in-product correction when it preserves the immutable audit trail and fixes the authoritative outcome.
- Use targeted database recovery only when authoritative rows were deleted or overwritten and the normal product workflow cannot restore their meaning.
- Use a full database restore only for broad corruption, destructive migration, compromised integrity, or project-wide data loss.
- Restore into an isolated recovery project/database first whenever the Supabase plan and incident permit it.
- Never use player names, team names, or presentation IDs to guess durable identities.
- Never overwrite current production with a cached snapshot or browser localStorage envelope.
- Never unfinalize or rewrite finalized records by ad hoc SQL. Use an explicitly approved administrative workflow or restore a consistent pre-incident graph.

## Standard Restore Preparation

1. Confirm the production project reference and affected environment aloud with a second operator.
2. Confirm the incident scope and write pause.
3. Capture a fresh backup of the current damaged state for evidence and rollback of the recovery itself.
4. Select a recovery point before the incident but after the last required migration.
5. Verify the recovery point's migration ledger is compatible with the deployed application commit.
6. Restore or load the recovery point into an isolated target when possible.
7. Compare affected row counts, UUIDs, ownership, timestamps, aggregate versions, official flags, and finalization state.
8. Produce a reviewed recovery set or approve a full-project restore.
9. Execute recovery inside a database transaction where supported. Preserve original UUIDs and referential order.
10. Retain before/after evidence without recording secrets or raw tokens.

## Scenario Procedures

### Accidental tournament deletion

Tournament deletion can cascade into related players, scores, Review state, snapshots, rounds, scorecards, codes, tokens, and Qualifying records. Treat it as a tournament-graph incident.

1. Stop activity for the event and record both Tournament and Qualifying UUIDs.
2. Locate a recovery point immediately before deletion.
3. Restore it into an isolated target and enumerate the complete tournament graph.
4. Verify owner/membership, players, rounds, pairings, scorecards, score and hole rows, Reviews, snapshots, official decisions, finalization, Qualifying records, and access artifacts.
5. Prefer restoring the entire consistent graph with original UUIDs. Do not create a replacement tournament or map by name.
6. Revoke or rotate access artifacts only after recovery and only through their supported management workflow; already-open tokens may be part of the incident scope.
7. Run the post-restore validation checklist before reopening access.

### Accidental score modification

1. Identify tournament, round, golfer `player_id`, `entered_by_player_id`, hole, and exact modification time.
2. Preserve the current self, marker, official, Review, and statistic rows.
3. If the product's existing official-resolution workflow can correct the outcome while preserving originals, use it instead of database restoration.
4. If an original row was destructively overwritten or deleted, retrieve its exact identity and prior values from the isolated recovery point.
5. Restore only the missing/damaged authoritative rows and their audit links. Do not replace a self row with a marker row or manufacture compatibility rows.
6. Recalculate Review, leaderboard projection, readiness, and finalization eligibility through normal reads after recovery.

### Accidental player deletion

Roster-player history uses restrictive foreign keys, while tournament participant records are event snapshots. Determine which identity was affected before acting.

1. Distinguish permanent `roster_players`, `qualifying_participants`, and round/event-specific `tournament_players` IDs.
2. Prefer archive/restore lifecycle actions for roster players; never recreate a permanent player by matching a name.
3. If an event player was deleted, recover the same UUID plus its round, pairing, scorecard, score, Review, and roster-link relationships from the recovery point.
4. Verify other seasons and historical events were not changed.
5. Confirm player access resolves only the intended participant after recovery.

### Accidental Review or finalization issue

1. Preserve all original self, marker, official, and Review rows.
2. Use the existing Director official-resolution workflow for a wrong decision when it supports an append-only later correction.
3. Do not delete prior official decisions or rewrite audit rows.
4. If finalization occurred with corrupt or missing authority, stop all edits and compare the complete event graph with the pre-finalization recovery point.
5. Do not manually clear finalized flags or bypass finalized-write triggers. Use only an approved administrative reopen path, or perform an authorized consistent restore.
6. After correction, verify Review counts, zero unresolved discrepancies, official leaderboard projection, readiness, Tournament/Qualifying timestamps, and read-only enforcement.

### Full database restore

The exact operation depends on the connected Supabase plan and available restore tooling.

1. Declare a project-wide incident and pause application use through available hosting/project controls.
2. Capture the damaged state and confirm the latest known good recovery point.
3. Confirm backup compatibility with the expected migration ledger and application commit.
4. Follow the supported Supabase managed restore process when available. If using a logical backup, restore first to an isolated project/database and validate it before production promotion or an approved production import.
5. Verify authentication ownership, public/private schemas, functions, triggers, policies, grants, migration ledger, and all authoritative data collections.
6. Deploy or select the compatible application commit.
7. Complete the post-restore validation and smoke workflow.
8. Reopen access gradually and monitor all mutations during the observation period.

## Tournament Snapshot And Local Cache Recovery

`tournament_state_snapshots` stores a versioned Tournament Aggregate workspace envelope. It can restore presentation and compatibility context, but durable tables remain authoritative for tournament players, rounds, pairings, durable scorecards, score entries, hole entries, Reviews, official values, and finalization.

After recovery:

1. Compare the snapshot `tournament_id`, aggregate version, updated timestamp, status, players, rounds, pairings, scorecard presentation rows, and Review state with durable rows.
2. Allow the existing stale-snapshot reconciliation read path to enrich missing players, rounds, pairings, scorecard coverage, and generated-readiness flags from durable state.
3. Preserve complete snapshot presentation IDs, scores, names, teams, and Review data unless they conflict with durable authority.
4. Never persist an empty or incomplete snapshot over populated durable state.
5. Stable identity-specific score rows outrank snapshot presentation even when the stable row is incomplete or contains zero.
6. Official values are projected at read time and must not be written into the snapshot as replacements for original audit rows.
7. Treat browser localStorage as a per-device aid only. Record the browser/profile before clearing anything, and never copy one user's local envelope into production authority.
8. If a snapshot is unrecoverable, rebuild presentation through normal authoritative loading rather than fabricating rows.

## Post-Restore Validation

The Verification Lead must record pass/fail evidence for:

- expected owners and tournament memberships,
- tournament and Qualifying UUID continuity,
- player, round, pairing, and durable scorecard counts,
- unique self/marker score identities and hole counts,
- statistic rows and immutable Dynamic Statistics history,
- original and official audit preservation,
- Review and submission counts,
- unresolved discrepancy count,
- individual/team totals and competition ranking,
- Tournament and Qualifying readiness,
- finalization timestamps and finalized write rejection where applicable,
- universal code and QR/share participant isolation,
- snapshot reconciliation without hydration writes,
- one ordinary Tournament and one Qualifying read workflow,
- no unexpected console, API, authentication, or database errors.

Do not reopen an event if identities, totals, Review state, or finalization authority cannot be explained from durable rows.

## Tournament-Day Disaster Recovery Checklist

### Before play

- [ ] Recovery roles and contact methods are assigned.
- [ ] Supabase project reference and application commit are recorded.
- [ ] Migration ledger is current.
- [ ] Latest backup/recovery point is within the required RPO.
- [ ] Backup retention and access are confirmed.
- [ ] Tournament and Qualifying UUIDs are recorded.
- [ ] Player access instructions and paper/manual contingency are available.
- [ ] No restore drill or unresolved integrity issue is outstanding.

### When an incident occurs

- [ ] Start an incident record and UTC timeline.
- [ ] Ask affected users to stop mutations and finalization.
- [ ] Record exact event/player/round/hole identities.
- [ ] Preserve current damaged state and evidence.
- [ ] Identify the last known good recovery point.
- [ ] Estimate RPO loss and RTO.
- [ ] Choose supported correction, targeted restore, or full restore.
- [ ] Communicate status to coaches.

### Before reopening

- [ ] Recovery was peer-reviewed.
- [ ] Post-restore validation passed.
- [ ] Scores, statistics, Review, official values, readiness, and rankings agree.
- [ ] Access isolation and finalized read-only enforcement pass.
- [ ] Compatible application commit is deployed.
- [ ] Monitoring/observation owner is assigned.
- [ ] Coaches receive a recovery-complete notice and any known data-loss statement.

## Required Pre-Beta Recovery Drill

Perform this drill against a disposable non-production project or an isolated restore target before beta:

1. Create a small Tournament and Qualifying event through normal services.
2. Record UUIDs, row counts, snapshot hash/version, scores, Review state, and finalization state.
3. Produce a backup using the exact intended production mechanism.
4. Simulate deletion of one disposable tournament graph or restore into a clean isolated target.
5. Recover the backup using the documented operator procedure.
6. Verify schema, policies, triggers, ownership, event graph, score identities, Reviews, official values, snapshots, and access isolation.
7. Run the post-restore smoke workflow and measure actual RPO and RTO.
8. Record defects, revise the runbook, and repeat until the targets are met.
9. Store the drill date, operators, backup identifier, measured RPO/RTO, verification evidence, and approval in the beta release record.

The documentation milestone is complete when this runbook is reviewed. Operational backup readiness is complete only after the Supabase plan/capabilities are confirmed, recovery roles are named, and the drill passes.

## Unresolved Pre-Beta Assumptions

- Whether the connected Supabase plan includes managed daily backups and PITR.
- The managed backup retention window and whether isolated restore is available.
- The production hosting target and mechanism used to pause traffic during a full restore.
- Named primary and backup owners for release, database recovery, incident response, and verification.
- The encrypted off-platform storage location if logical backups are required.
- Whether the 15-minute active-tournament RPO can be met without PITR.

These assumptions must be resolved and recorded before opening controlled beta.
