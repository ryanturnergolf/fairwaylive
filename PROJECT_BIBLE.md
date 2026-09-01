# Clubhouse HQ Project Bible

Last updated: 2026-09-01

## Current Repository And Beta Baseline

Status: **CONTROLLED BETA PREPARATION IN PROGRESS**

The current committed verification inventory is 389 Playwright tests across 55 tracked specifications. The Qualifying data-foundation regression specification is tracked as of commit `767ec301e73970848a01353df456a33b1ab7b64a`; it is no longer a local-only exception. Hosted CI configuration and verification are operational, and the Vercel controlled-beta production deployment remains available at `https://fairwaylive-gold.vercel.app`.

Implementation completed after the earlier controlled-pilot and UX baselines includes durable roster management UI, Dynamic Statistics configuration/mobile/Review integration, the analytics engine and query API, Player Performance Profiles, Team Performance and Team Statistics surfaces, Course Management with immutable event snapshots, flexible multi-round Qualifying, Qualifying statistics selection, reciprocal scoring stabilization, and the deployed multi-round Tournament/Qualifying scoring and leaderboard architecture. Reciprocal identity coverage distinguishes scorer from score subject with asymmetric real-flow regressions so equal scores cannot conceal an identity error.

Historical test counts and release commits below remain valid for their dated milestones; they are not the current repository baseline. Controlled Beta Preparation remains open. The multi-round production rollout, limited write canary, cleanup, and initial post-deployment monitoring baseline are verified. The active-tournament 15-minute RPO, off-device key escrow, recurring backup cadence, named recovery ownership, centralized alert delivery, and the incident-response drill remain open.

## Multi-Round Production Rollout

Status: **PHASES 1-3 COMPLETE / DEPLOYED / VERIFIED**

The deployed release is `343d3e74c6ff85fb73676437d5b105cd83ebc1a4` in Vercel deployment `dpl_HAjK3511dYCdbgUa62Jko846Nqvo`. Production Supabase project `gfpkhptrnddvwzorhgkm` has 48 migrations through `20260830000000`. Phase 1 migration `20260829000000_add_durable_multi_round_authority.sql` and Phase 2 migration `20260830000000_add_round_aware_scoring_resolution.sql` were each applied exactly once; Phase 3 required no migration.

Phase 1 established durable Tournament round UUIDs, configured 1-10-round authority, operational-current-round references, safe round-count changes, Qualifying's ten-round limit, and parent-aware constraints. Its production backfill increased durable Tournament rounds from 100 to 173, eliminated 73 missing configured slots, and preserved all 100 pre-existing round UUIDs. Phase 2 made mobile/QR scoring, reciprocal scoring, Review, Verify Score, Qualifying resume/designated access, R10, and immutable-par projection round-aware while retaining controlled legacy compatibility. Phase 3 added dynamic R1-R10 Tournament and Qualifying leaderboard navigation, expandable scorecards, independent selectors, future-round state, favorites, mobile containment, and polling-state preservation.

Pre-deployment verification passed the production build and Playwright 389/389. Gate F then proved deployed production writes with a disposable two-round Tournament (`4` in R1 and `6` in R2) and two-round Qualifying session (`3` in R1 and `5` in R2), with distinct durable identities and no Round 1 collapse. Immutable Qualifying par resolved from the event snapshot as `3 + 5 + 5 = 13`, not the invalid `holeCount * 4 = 12`. R10 was intentionally excluded from the production write canary and remains covered by local/recovery regression evidence.

Dependency-aware cleanup removed every synthetic row. All 36 public-table counts returned to the immediate pre-canary baseline, residual canary rows were zero, and the pre-existing round identity hash remained `3e223b1b56b27921bc1afb7b53173a25`. The `2026-09-01T00:28:39.414Z` monitoring baseline found zero round gaps, duplicate ordinals, invalid operational references, cross-parent mappings, scoring identity violations, reciprocal direction violations, blocked sessions, or long transactions. No genuine real multi-round event was active; production is approved for normal use and ready for monitoring of the first real event.

## Product Vision

Clubhouse HQ is a coach operations platform for college golf. The product starts with tournament operations because tournaments are the highest-pressure workflow: roster setup, pairings, scorecards, mobile scoring, live leaderboards, score review, and post-round reporting all have to work together.

Clubhouse HQ is not recruiting software. Recruiting may become a future module, but the foundation is the tournament engine and the daily operating system around coaches, teams, players, rounds, scoring, review, and decisions made during competition.

## Product Boundaries

- Tournament operations are the foundation.
- Coach operations are the long-term platform direction.
- Recruiting is out of current scope unless explicitly requested.
- Scoring rules are product-critical and should not change casually.
- QR and mobile scoring are protected workflows.
- localStorage remains a supported cache/offline fallback.
- Supabase is the future source of truth, but the migration must be incremental.

## Controlled Live-Pilot Certification

Status: **COMPLETE FOR CONTROLLED LIVE PILOT**

The Tournament Engine and Qualifying orchestration layer completed an authenticated, real-Supabase certification from player entry through synchronized finalization. This supports a controlled pilot with active operational monitoring; it does not claim unrestricted production readiness.

Certified event:

- Qualifying session: `dd6a0929-a035-4f10-9185-54324f82a5f2`
- Backing tournament: `11ddab64-36fa-4522-b9b5-cb07372bd214`
- Finalized at: `2026-07-27T02:41:33.69Z`
- Automated baseline: production build passed and Playwright passed 169/169.

Certified end-to-end workflow:

- universal homepage scoring-code entry for ordinary Tournament and Qualifying events,
- event- and team-scoped participant isolation,
- signed-out QR/share-token scorecard access,
- reciprocal self and marker scoring with durable identity-specific persistence,
- player-owned Fairway, GIR, and Putts persistence,
- authoritative refresh, resume, Review, submission, and discrepancy blocking,
- Tournament Director official-score resolution with original self and marker audit values preserved,
- immutable official-score projection into live standings after refresh,
- competition ranking for tied individual and team positions,
- readiness convergence across assignments, scorecards, submissions, Reviews, and discrepancies,
- synchronized Tournament and Qualifying finalization timestamps,
- finalized rankings, statistics, and historical results,
- read-only Tournament workspaces and Qualifying history after finalization,
- disabled score editing and access-code rotation after finalization,
- ordinary Tournament universal-code, QR/share, Review, and finalized-state regression coverage.

Certified final rankings:

- T1 Avery Brooks — 35 (-1)
- T1 Cam Riley — 35 (-1)
- T3 Noah Wilson — 36 (E)
- T3 Sam Carter — 36 (E)
- T5 Drew Patel — 37 (+1)
- T5 Jordan Lee — 37 (+1)

The certified architecture keeps Tournament Engine tables authoritative for players, rounds, pairings, scorecards, scores, statistics, Reviews, official outcomes, and finalization. Qualifying remains an orchestration and read-model layer over those durable objects rather than a second scoring engine.

## Tournament Experience Polish Certification

Status: **PHASES 9B, 9C, AND 10A COMPLETE**

The certified Tournament workflow has completed its presentation-only polish pass across the Tournament Director workspace, mobile scoring experience, and the end-to-end Tournament journey. Phase 9B standardized Tournament Director hierarchy, readiness, teams and players, pairings, scorecard generation, QR/share dialogs, team scoring codes, live scoring, Review Queue, finalization, and finalized read-only presentation. Phase 9C standardized mobile scorecard spacing, typography, touch targets, safe-area handling, progress and save states, Review, submission, and success presentation. Phase 10A completed the full workflow audit and corrected the remaining dashboard, loading/empty-state, responsive navigation, touch-target, and tournament-creation dialog issues.

These phases changed presentation and focused UX regression coverage only. They did not change scoring, Review, official resolution, finalization, analytics, persistence, synchronization, repositories, services, APIs, migrations, Supabase data, or database architecture. Production migrations remain current.

Current verification baseline:

- Application UX baseline commit: `e3953c3180f5061a7557e1bc1542edcbecf2a341`
- Production build: passed
- Playwright: 244/244 passed

## Controlled Beta Backup And Recovery

Status: **BETWEEN-EVENTS RECOVERY VERIFIED; ACTIVE-EVENT PROTECTION AND OWNERSHIP REMAIN OPEN**

The operational recovery contract is documented in `BACKUP_RECOVERY.md`. Supabase durable tables remain recovery authority; `tournament_state_snapshots` and browser localStorage remain cached compatibility/recovery inputs and may never replace durable player, round, pairing, scorecard, score, Review, official, or finalization rows. Recovery preserves stable UUIDs, self/marker identities, immutable official audit history, and Tournament/Qualifying authority.

The 2026-08-28 isolated recovery drill restored encrypted logical backup `20260828T030142Z-between-events` from production project `gfpkhptrnddvwzorhgkm` into recovery project `frskkyrtgponplmhgrgn`. Database integrity, application reads, authentication, controlled writes, Tournament and Qualifying workspaces, reciprocal scorer/subject identities, and synthetic onboarding passed. The measured restore and application-validation window was well within the four-hour between-events RTO, so between-events recovery is verified.

The drill also established that application-owned objects attached to Supabase-managed schemas require a reviewed `cross-schema-application-objects.sql` sidecar. The sidecar validates and recreates `create_coach_profile_for_auth_user` on `auth.users`, preserves the restored `public.create_coach_profile_for_auth_user()` function, and restricts function execution to `postgres` and `service_role`. It never restores the Auth schema or Supabase-managed triggers wholesale.

The production project is on the Supabase Free plan with no user-restorable PITR. Controlled beta still requires named recovery owners, off-device recovery-key escrow, a rehearsed recurring logical-backup cadence, and evidence that active scoring can meet its 15-minute RPO and two-hour RTO. The passed between-events drill does not satisfy those active-tournament requirements.

## Controlled Beta Release And Rollback

Status: **MULTI-ROUND RELEASE EXECUTED AND VERIFIED; NAMED OWNERSHIP REMAINS OPEN**

The production release and rollback contract is documented in `RELEASE_ROLLBACK.md`. Every release records the candidate and previous known-good commits, linked Supabase project and migration ledger, recovery point, build and Playwright results, deployment outcome, smoke verification, and go/no-go decision. Normal releases use backward-compatible forward migrations followed by application deployment; applied migrations are never edited or casually rolled back.

Tournament-day freeze rules protect active scoring. Application rollback redeploys the exact compatible known-good commit, while database defects use a reviewed corrective forward migration or the recovery process in `BACKUP_RECOVERY.md`. The Vercel host, rollback mechanism, pre-migration recovery point, controlled migration sequence, application deployment, read-only acceptance, disposable write canary, cleanup, and observation baseline were verified for the multi-round release. Named primary/backup release roles remain an operational prerequisite.

## Controlled Beta Monitoring And Incident Response

Status: **FOUNDATION IMPLEMENTED; COLLECTION, ALERTING, AND DRILL REQUIRED**

The monitoring and incident-response contract is documented in `MONITORING_INCIDENT_RESPONSE.md`. It defines application, API, Supabase, authentication, score-save, live-scoring, and release-health signals; P1–P4 severity and response targets; tournament-day triage; rollback/recovery boundaries; communication; dashboards; privacy/redaction; and incident closure.

The application now uses native Next.js server/client instrumentation, a narrow same-origin client-error endpoint, a shared sensitive-data redaction boundary, structured release-aware server output, production environment validation, and an uncached `/api/health` endpoint. Monitoring is explicitly disabled when its environment flags are absent. No vendor SDK, service-role credential, database write, or schema change is involved.

The foundation does not itself retain logs, deliver alerts, or measure all handled API outcomes/latency. The multi-round rollout established a manual production monitoring baseline through `/api/health`, Vercel runtime logs, read-only Supabase health/integrity queries, and an exact-identity write canary. Centralized retention/alert delivery, named responders, and the pre-beta incident drill remain open.

Production environment validation distinguishes actual production from preview, CI, development, test, and the managed Playwright server. Actual production requires public HTTPS application and hosted Supabase origins, rejects loopback/reserved/credential-bearing URLs, requires aligned monitoring flags and release identity when monitoring is active, and emits operator-safe errors containing variable names and rules but never configured values. `/api/health` reflects this same readiness contract without claiming Supabase connectivity.

Developer/QA seed tooling is not a standard coach capability. Complete Tournament, incomplete/resume Tournament, and registry-based Qualifying seed entry points are hidden and denied in deployed environments by default. Local development and the managed Playwright server retain access. A deployed operator requires explicit `QA_SEED_TOOLS_ENABLED=true` configuration plus an authenticated coach UUID in the server-only `QA_SEED_OPERATOR_IDS` allowlist. The dashboard queries a private no-store authorization endpoint and every seed handler/service boundary rechecks authorization before creating data. This adds no role table, service-role credential, schema, migration, or change to ordinary Tournament or Qualifying creation.

## Controlled Beta Continuous Integration

Status: **IMPLEMENTED AND HOSTED VERIFICATION COMPLETE**

GitHub Actions runs the locked dependency install, production build, and complete Chromium Playwright suite on every pull request and every push to `main`. CI uses the supported Node 20 line, npm caching, least-privilege repository contents access, a bounded job timeout, and failure-only Playwright artifact retention.

The browser bundle requires the client-safe `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values at build time, including when Playwright intercepts Supabase requests. Hosted CI reads those values only from GitHub Actions secrets and fails before installation when they are absent. It must never receive a service-role key. A current-schema test/staging Supabase project is preferred; CI does not perform privileged database writes or deployment.

CI keeps two URL roles separate: Playwright uses `http://127.0.0.1:3100` to reach its managed production server, while `NEXT_PUBLIC_APP_URL` uses a reserved `.example` origin to verify externally shareable QR links. Production supplies its real public deployment origin; application code never hardcodes that domain.

Hosted CI has the required client-safe configuration and has repeatedly verified configuration preflight, production builds, and the committed Playwright suite. The current committed inventory is 389 tests across 55 tracked specifications, including the tracked Qualifying data-foundation specification and focused multi-round Phase 1-3 coverage. Mobile Review synchronization waits for either valid web-first entry state—automatically rendered Review or an enabled Review action—so slower hosted hydration does not race an instantaneous locator snapshot. The 18-hole rapid-save persistence regression waits for each hole's controls to become editable and uses a test-scoped execution budget because it intentionally verifies serialized atomic writes under injected latency; global timeouts and application behavior remain unchanged.

CI is a required verification signal for release approval, but it does not replace the real-Supabase deployment checks, production smoke tests, recovery evidence, or operational drills defined by the controlled-beta runbooks.

## Controlled Beta Coach Onboarding

The Coach Dashboard provides a concise, non-blocking first-event guide for new or incomplete accounts. Dismissal and explicit resumption are durable coach-account preferences stored in Supabase Auth user metadata; browser storage is not the authority. Experienced coaches are not interrupted by default. The first-tournament share checklist projects the certified `TournamentReadiness` result for player sync, pairings, scorecards, and safe-to-share state, so the UI does not duplicate readiness calculations. The guide links to existing workflows without changing Tournament or Qualifying behavior.

## Controlled Beta Support And Limitations

`BETA_SUPPORT.md` defines controlled-beta support ownership, urgency, response targets, tournament-day escalation, issue details, communication, and incident handoff while deferring incident authority to `MONITORING_INCIDENT_RESPONSE.md`. `CONTROLLED_BETA_LIMITATIONS.md` is the authoritative beta limitations list, and `BETA_ISSUE_TEMPLATE.md` is the privacy-safe intake format. The Coach Help & Support page provides concise workflow and troubleshooting links without mutations. `NEXT_PUBLIC_BETA_SUPPORT_CONTACT` may expose a monitored email or HTTPS intake URL; when absent or invalid, coaches are directed to their designated beta support owner.

## Controlled Beta Temporary Production Deployment

Status: **MULTI-ROUND RELEASE DEPLOYED AND VERIFIED; REMAINING OPERATIONAL READINESS WORK OPEN**

The existing Vercel project `ez-golf-scoring/fairwaylive` hosts the controlled-beta production URL `https://fairwaylive-gold.vercel.app`. Current release `343d3e74c6ff85fb73676437d5b105cd83ebc1a4` is deployed as `dpl_HAjK3511dYCdbgUa62Jko846Nqvo` with the real public origin, hosted Supabase client configuration, explicit release identity, and production QA seed tools disabled. Historical release `9cfa8fd19fb68b1dcd6082210ab139a603a61125` remains the rollback-compatible previous application release; applied database migrations are not normally reversed for an application rollback.

Public HTTPS, authentication, dashboard loading, existing Tournament inventory, QR/share origins, signed-out scorecard access, finalized read-only presentation, `/api/health`, and QA-tool denial remain verified. The controlled rollout additionally proved a reviewed exact-UUID cleanup path through a disposable production canary, then restored all business counts and identity hashes. Supabase Site URL and redirect allowlist remain configured for the Vercel origin. Automated centralized monitoring remains disabled until collector retention and alert routing are configured and drilled.

## Durable Roster Foundation

Status: **FOUNDATION AND ROSTER UI IMPLEMENTED**

The durable roster and season identity foundation is available in the connected Supabase runtime. `roster_players` is the permanent coach-owned player identity, `seasons` defines the season boundary, and `season_roster_memberships` stores season-specific status and class year.

Tournament and Qualifying event records remain immutable historical snapshots. Their nullable `roster_player_id` links may associate an event identity with a permanent roster player without replacing the existing event-scoring IDs. Legacy rows remain valid with null links, and no name-based historical backfill is performed.

Owner-scoped RLS, cross-owner event-link validation, archive-first lifecycle transitions, and restricted foreign-key deletion preserve player and event history. Real Supabase verification covered same-owner creation and linking, cross-owner isolation, archived-player readability, restricted linked-player deletion, and unchanged certified tournament snapshots.

Coach-facing Men’s and Women’s roster management, the season-aware Players Directory, and permanent-identity Player Performance Profiles are implemented. Event participants remain immutable historical snapshots linked to durable roster identities where available. Dynamic Statistics and analytics are implemented through their repository, service, query API, and UI layers.

## Current Architecture Snapshot

The app is a Next.js App Router application with client-heavy tournament workflows.

Current major routes:

- `/`: homepage with saved/shared tournament entry points.
- `/dashboard`: tournament creation and tournament list.
- `/tournament/[id]`: tournament operations, teams, players, pairings, live scoring, QR, import/export, and review-oriented workflows.
- `/scorecard/[playerId]`: mobile scorecard and QR scoring resolver.
- `/live`: public/live leaderboard surface.

Current persistence layers:

- localStorage stores the complete tournament envelope and remains the most complete source for desktop-created tournament UI state.
- Supabase stores shared tournament rows, tournament player rows, and score entries.
- Services coordinate app workflows.
- Repositories isolate Supabase calls.

## Source Of Truth Direction

Supabase should become the durable source of truth for shared tournament state. localStorage should remain as:

- offline fallback,
- draft cache,
- local recovery mechanism,
- compatibility layer for existing tournaments,
- resilience path when Supabase is unavailable.

Do not remove localStorage fallback. Instead, migrate carefully by making Supabase able to reconstruct the same Tournament Aggregate that localStorage already stores.

## Tournament Aggregate

The Tournament Aggregate is the canonical domain object the app should be able to reconstruct from either localStorage or Supabase.

It includes:

- tournament metadata: id, name, course, date, location, rounds, status, settings,
- teams,
- players,
- rounds,
- pairings,
- scorecard generation state,
- scorecard rows,
- hole scores,
- score sources,
- marker assignments,
- review status,
- import/export state where needed by the UI,
- local tournament id to shared Supabase UUID mapping.

The aggregate should protect these invariants:

- A tournament with generated scorecards must not hydrate as an empty unstarted tournament.
- Pairings and scorecard rows must agree on player identity.
- Mobile scoring links must resolve to stable player ids.
- Marker-entered scores drive live scoring.
- Self-entered scores remain available for review and discrepancy checks.
- Missing remote fields should degrade gracefully without overwriting populated localStorage.

## Mobile Scoring Architecture

Mobile scoring is QR-first and must stay resilient.

The QR link carries:

- scoring player id,
- tournament id,
- pairing number.

The mobile resolver should support two valid cases:

- local tournament id with localStorage envelope available,
- shared Supabase tournament UUID with remote tournament player rows available.

Protected behavior:

- Do not break existing QR links.
- Do not remove localStorage score saves.
- Do not remove Supabase score saves.
- Do not change marker rotation rules.
- Do not change score review behavior unless explicitly requested.

Known architectural risk:

- A phone with no localStorage can only resolve a shared QR link if Supabase has enough tournament player and pairing data to reconstruct the scorecard.

## Live Scoring Architecture

Live scoring is marker-driven. Leaderboards should use marker-entered scores for competition display because those scores represent the independent scoring workflow.

Self-entered scores are still important:

- player progress,
- end-of-round comparison,
- discrepancy detection,
- review hub context,
- future player stat tracking.

Live scoring must support:

- per-hole progressive saves,
- partially complete rounds,
- marker-only leaderboard updates,
- Supabase score polling,
- localStorage fallback and recovery.

## Review Hub Architecture

The Review Hub should become the coach and tournament director surface for score validation.

Responsibilities:

- show self vs. marker score differences,
- identify unresolved discrepancies,
- support coach decisions and overrides,
- preserve audit context,
- avoid changing leaderboard scores until review rules allow it,
- expose group/player status without requiring coaches to open every scorecard.

Review Hub should be built on top of the Tournament Aggregate rather than duplicating score resolution logic in route components.

## Implemented Capability: Custom Statistics And Player Season Tracking

Status: **DYNAMIC STATISTICS, ANALYTICS, AND PERFORMANCE UI IMPLEMENTED**

The Dynamic Statistics backend foundation is runtime-available in the connected Supabase project. It provides owner-scoped, versioned statistic definitions and packages, immutable event assignments and hole values, and the approved built-in definition catalog. Real Supabase verification covered RLS, cross-owner rejection, archive/restore, immutable definition and package revisions, pinned event assignments, original/official value preservation, and restricted historical deletion.

The follow-up migration `20260805000000_fix_dynamic_statistics_catalog_trigger.sql` corrected table-specific archival protection so definitions and packages can be archived without weakening immutable identity rules. Coach configuration and the Phase 3 mobile scorecard integration are now available. `20260806000000_add_mobile_dynamic_statistics_access.sql` added narrow share-token-authorized package/value access, and `20260806010000_enforce_mobile_dynamic_statistics_player_read.sql` ensures public reads are restricted to an authorized player and round.

Real Supabase verification covered Tournament and Qualifying package resolution, immutable package-version pinning, required-stat validation, checkbox, yes/no, bounded-number, and option-list inputs, append-only persistence, reload/reopen behavior, signed-out share-token and player authorization, and offline retry after reconnect. Events without an assigned package retain the certified Fairway, GIR, and Putts workflow.

Dynamic Statistics now participates in the authenticated Review Hub through the pinned package version. The read model preserves package order and applicability, distinguishes Match, Different, Missing, and Required Missing states, and supports accepting player or marker values plus append-only official corrections. Original player and marker rows remain unchanged; later official corrections supersede earlier official values without deleting history. Finalized events remain readable and disable Review controls. The analytics engine, authenticated query API, Player Performance Profiles, Team Performance Dashboard, and sortable Team Statistics table are implemented consumers of the same durable observation authority.

Coaches can select which statistics appear on mobile scorecards, organize them into event stat packages, and create configuration-driven custom statistics. Implemented and supported catalog fields include:

- Fairway,
- Green in Regulation,
- Putts,
- Shots from 100 yards and in with selectable 1–10 values,
- Up-and-down opportunity,
- Up-and-down success or failure,
- Sand save,
- Penalty strokes,
- coach-defined custom statistics.

Stat definitions must not require a new database column for every field. A durable definition needs:

- stable definition ID,
- coach/program ownership,
- name and description,
- input type,
- allowed options or numeric range,
- display order,
- active/inactive state,
- applicability rules,
- season and package assignment.

Implemented input types include checkbox, yes/no, bounded number, and selectable options. Rating and optional text remain possible later extensions rather than current behavior.

Event stat packages select and order definitions for Tournament, Qualifying, Practice, or another future scored event. The selected package controls mobile scorecard inputs while preserving the certified Fairway, GIR, and Putts behavior during migration.

### Durable Player And Season Identity

Statistics for rostered players attach to a durable rostered-player ID, never a player name, temporary event label, or presentation-only tournament identity. Player development history must survive roster edits, event completion, event finalization, season transitions, and changes to stat definitions.

Durable analytics currently support:

- season totals and averages,
- percentages and per-round averages,
- event and round history,
- Tournament versus Qualifying splits,
- recent rolling trends,
- custom-stat summaries,
- career and multi-season history.

### Hole-Level Statistical Authority

The source of truth is durable player/event/round/hole data, not a precomputed season average. Each value must preserve enough context to recalculate analytics:

- durable rostered-player ID,
- event ID and event type,
- course,
- round and hole,
- par,
- stat definition ID,
- entered value,
- entered-by/scoring identity and source,
- official status where applicable,
- definition metadata or immutable definition version needed to interpret the historical value.

Disabling, removing, renaming, reordering, or moving a definition between packages must not erase or reinterpret historical values.

### Review, Official Values, And Analytics

Custom statistics may participate in self/marker Review when the definition and scoring policy require comparison. Original self-entered and marker-entered values remain auditable. An official resolution may be projected into analytics without rewriting the original values, following the certified official-score projection pattern.

Season summaries are derived read models over durable hole-level values. Examples include average putts per round, up-and-down percentage, average shots from 100 yards and in, Fairway and GIR percentages, checkbox success percentages, numeric averages, event-type splits, and rolling recent-round trends. Precomputed summaries may be used as caches later, but never as the sole authority.

## Architecture Rules

- Make small milestones only.
- Do not perform a big rewrite.
- Keep service/repository boundaries around Supabase access.
- Keep localStorage utilities centralized.
- Keep route components from becoming the permanent domain model owner.
- Add domain helpers only when they reduce duplicated scoring or hydration logic.
- Never change scoring rules as incidental cleanup.
- Never silently overwrite populated localStorage with empty remote state.
- Prefer reconstructing the Tournament Aggregate from shared state before changing UI conditions.

## Stabilization Priorities

1. Document and preserve current behavior.
2. Add remote aggregate hydration for shared tournaments.
3. Protect QR generation behind confirmed shared scorecard readiness.
4. Move repeated tournament/score resolution logic into small domain helpers.
5. Add focused tests around phone-without-localStorage workflows.
6. Expand Supabase schema only when the aggregate requires data that cannot be derived safely.

## Non-Goals For Stabilization

- No rewrite to server-only architecture.
- No removal of localStorage.
- No broad component refactor.
- No recruiting module.
- No scoring rule redesign.
- No visual redesign unless needed to expose correct state.
