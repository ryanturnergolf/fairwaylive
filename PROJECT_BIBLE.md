# Clubhouse HQ Project Bible

Last updated: 2026-07-31

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

- Latest commit: `e3953c3180f5061a7557e1bc1542edcbecf2a341`
- Production build: passed
- Playwright: 244/244 passed

## Controlled Beta Backup And Recovery

Status: **RUNBOOK COMPLETE; CAPABILITY CONFIRMATION AND DRILL REQUIRED**

The operational recovery contract is documented in `BACKUP_RECOVERY.md`. Supabase durable tables remain recovery authority; `tournament_state_snapshots` and browser localStorage remain cached compatibility/recovery inputs and may never replace durable player, round, pairing, scorecard, score, Review, official, or finalization rows. Recovery preserves stable UUIDs, self/marker identities, immutable official audit history, and Tournament/Qualifying authority.

Controlled beta requires confirmed backup capability for the connected Supabase plan, named recovery owners, evidence that the active-tournament RPO/RTO targets can be met, and a successful isolated recovery drill. The documentation does not claim PITR is enabled or that a drill has already passed.

## Controlled Beta Release And Rollback

Status: **RUNBOOK COMPLETE; HOSTING CONFIRMATION AND DRILL REQUIRED**

The production release and rollback contract is documented in `RELEASE_ROLLBACK.md`. Every release records the candidate and previous known-good commits, linked Supabase project and migration ledger, recovery point, build and Playwright results, deployment outcome, smoke verification, and go/no-go decision. Normal releases use backward-compatible forward migrations followed by application deployment; applied migrations are never edited or casually rolled back.

Tournament-day freeze rules protect active scoring. Application rollback redeploys the exact compatible known-good commit, while database defects use a reviewed corrective forward migration or the recovery process in `BACKUP_RECOVERY.md`. Controlled beta remains gated on confirming the production host and rollback mechanism, naming release owners, selecting canary data, and passing the release/rollback drill.

## Durable Roster Foundation

Status: **DATA FOUNDATION DEPLOYED**

The durable roster and season identity foundation is available in the connected Supabase runtime. `roster_players` is the permanent coach-owned player identity, `seasons` defines the season boundary, and `season_roster_memberships` stores season-specific status and class year.

Tournament and Qualifying event records remain immutable historical snapshots. Their nullable `roster_player_id` links may associate an event identity with a permanent roster player without replacing the existing event-scoring IDs. Legacy rows remain valid with null links, and no name-based historical backfill is performed.

Owner-scoped RLS, cross-owner event-link validation, archive-first lifecycle transitions, and restricted foreign-key deletion preserve player and event history. Real Supabase verification covered same-owner creation and linking, cross-owner isolation, archived-player readability, restricted linked-player deletion, and unchanged certified tournament snapshots.

Roster-management UI is not implemented. Custom statistics and player analytics remain future work.

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

## Approved Future Capability: Custom Statistics And Player Season Tracking

Status: **PHASE 4 REVIEW INTEGRATION VERIFIED**

The Dynamic Statistics backend foundation is runtime-available in the connected Supabase project. It provides owner-scoped, versioned statistic definitions and packages, immutable event assignments and hole values, and the approved built-in definition catalog. Real Supabase verification covered RLS, cross-owner rejection, archive/restore, immutable definition and package revisions, pinned event assignments, original/official value preservation, and restricted historical deletion.

The follow-up migration `20260805000000_fix_dynamic_statistics_catalog_trigger.sql` corrected table-specific archival protection so definitions and packages can be archived without weakening immutable identity rules. Coach configuration and the Phase 3 mobile scorecard integration are now available. `20260806000000_add_mobile_dynamic_statistics_access.sql` added narrow share-token-authorized package/value access, and `20260806010000_enforce_mobile_dynamic_statistics_player_read.sql` ensures public reads are restricted to an authorized player and round.

Real Supabase verification covered Tournament and Qualifying package resolution, immutable package-version pinning, required-stat validation, checkbox, yes/no, bounded-number, and option-list inputs, append-only persistence, reload/reopen behavior, signed-out share-token and player authorization, and offline retry after reconnect. Events without an assigned package retain the certified Fairway, GIR, and Putts workflow.

Dynamic Statistics now participates in the authenticated Review Hub through the pinned package version. The read model preserves package order and applicability, distinguishes Match, Different, Missing, and Required Missing states, and supports accepting player or marker values plus append-only official corrections. Original player and marker rows remain unchanged; later official corrections supersede earlier official values without deleting history. Finalized events remain readable and disable Review controls. Analytics and player-profile presentation remain unimplemented.

Coaches will be able to select which statistics appear on mobile scorecards, organize them into event stat packages, and create configuration-driven custom statistics. Initial and anticipated fields include:

- Fairway,
- Green in Regulation,
- Putts,
- Shots from 100 yards and in with a selectable 1–6+ value,
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

Anticipated input types are checkbox, yes/no, bounded number, selectable options, rating, and optional text in a later phase.

Event stat packages select and order definitions for Tournament, Qualifying, Practice, or another future scored event. The selected package controls mobile scorecard inputs while preserving the certified Fairway, GIR, and Putts behavior during migration.

### Durable Player And Season Identity

Statistics for rostered players attach to a durable rostered-player ID, never a player name, temporary event label, or presentation-only tournament identity. Player development history must survive roster edits, event completion, event finalization, season transitions, and changes to stat definitions.

Durable season tracking should support:

- season totals and averages,
- percentages and per-round averages,
- event and round history,
- Tournament versus Qualifying splits,
- recent rolling trends,
- custom-stat summaries,
- career and multi-season history in a later phase.

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
