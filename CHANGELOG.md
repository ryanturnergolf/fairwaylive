# Clubhouse HQ Changelog

## 2026-07-31

### Changed

- Completed Phase 9B Tournament Director presentation polish across workspace hierarchy, readiness, teams and players, pairings, scorecard generation, QR/share, team scoring codes, live scoring, Review Queue, finalization, and finalized read-only views.
- Completed Phase 9C Mobile Scoring presentation polish across scorecard layout, hole navigation, touch targets, safe-area handling, status messaging, Review, submission, and responsive behavior.
- Completed Phase 10A end-to-end Tournament UX audit and final polish, including distinct loading and empty states, responsive dashboard navigation, mobile tournament cards and actions, and an accessible viewport-bounded creation dialog.
- Added the controlled-beta backup and recovery runbook covering authoritative data scope, plan-dependent backup options, active-event and between-event RPO/RTO targets, targeted recovery scenarios, full restore, snapshot/cache reconciliation, tournament-day response, and a required pre-beta drill.
- Added the controlled-beta release and rollback runbook covering ownership, prerequisites, build/Playwright and migration gates, deployment order, production smoke tests, tournament-day freezes, emergency hotfixes, application rollback, database forward fixes, communications, and rehearsal.
- Added the controlled-beta production monitoring and incident-response runbook covering application/API/Supabase/auth/score/live/release health, P1–P4 alerting, tournament-day response, rollback/recovery boundaries, dashboards, privacy-safe logs, communications, postmortems, and rehearsal.

### Verification

- Production build passed and Playwright passed 244/244.
- Production migrations remain current.
- Confirmed the UX work changed presentation and focused tests only; scoring, Review, official resolution, finalization, analytics, persistence, synchronization, repositories, services, APIs, migrations, Supabase data, and database architecture remain unchanged.
- Application UX baseline commit: `e3953c3180f5061a7557e1bc1542edcbecf2a341`.
- Backup documentation is complete; Supabase plan capability confirmation, named recovery owners, and a successful isolated recovery drill remain required before beta.
- Release documentation is complete; production hosting/rollback capability confirmation, named release owners, approved canary data, and a successful release/rollback drill remain required before beta.
- Monitoring documentation is complete; centralized tooling, alert routing, named responders, safe canary checks, redaction validation, and a successful incident drill remain required before beta.

## 2026-07-28

### Added

- Deployed the Dynamic Statistics backend foundation with owner-scoped, versioned statistic definitions, reusable versioned packages, immutable event assignments, and hole-level original/official values.
- Seeded Fairway Hit, Green in Regulation, Putts, Penalty Strokes, Shots from 100 Yards and In, Up-and-Down Opportunity, Up-and-Down Success, and Sand Save definitions.
- Deployed Dynamic Statistics mobile access for assigned Tournament and Qualifying packages, including ordered required/optional checkbox, yes/no, bounded-number, and option-list inputs on the certified scorecard.
- Added append-only signed-out statistic loading and saving with package-version pinning, player/round authorization, reload persistence, and offline retry behavior.
- Integrated assigned Dynamic Statistics packages into the authenticated Review Hub for Tournament and Qualifying events, preserving package order and applicability.
- Added Match, Different, Missing, and Required Missing comparison states plus player-value, marker-value, corrected official-value, and later official-correction actions.

### Fixed

- Deployed `20260805000000_fix_dynamic_statistics_catalog_trigger.sql` to isolate definition-only trigger fields from package updates, restoring definition and package archival without weakening semantic identity protection.
- Deployed `20260806010000_enforce_mobile_dynamic_statistics_player_read.sql` so share-token package reads also require an authorized tournament player and round.

### Verification

- Verified real Supabase owner access, cross-owner isolation, definition/package archive and restore, immutable revision history, pinned package assignments, preserved original and official hole values, and restricted historical deletion.
- Verified complete real Tournament and Qualifying rounds with package rendering, required validation, all supported input types, append-only writes, reload/reopen persistence, signed-out authorization, final-hole completion, and offline reconnect.
- Verified legacy events without packages continue using Fairway, GIR, and Putts, with existing score tables and score-saving behavior unchanged.
- Verified original player and marker values remain immutable while official values append and later corrections supersede without deleting history.
- Verified finalized Dynamic Statistics Review is read-only and package-free and legacy Review behavior remains unchanged.
- Production build passed and Playwright passed 202/202. Analytics and player profiles remain unimplemented.

## 2026-07-27

### Certification

- Completed controlled live-pilot certification for the Tournament Engine and reciprocal Qualifying using real Supabase session `dd6a0929-a035-4f10-9185-54324f82a5f2` and backing tournament `11ddab64-36fa-4522-b9b5-cb07372bd214`.
- Verified universal player entry, ordinary Tournament and Qualifying isolation, signed-out scoring, reciprocal scores, player-owned statistics, Review, intentional discrepancy blocking, Director resolution, audit preservation, readiness, finalization, history, and read-only enforcement.
- Finalized Tournament and Qualifying authority at the matching timestamp `2026-07-27T02:41:33.69Z`.
- Verified final competition rankings: Avery Brooks and Cam Riley T1 at 35 (-1), Noah Wilson and Sam Carter T3 at 36 (E), and Drew Patel and Jordan Lee T5 at 37 (+1).
- Confirmed the production build and Playwright 169/169 baseline, with `main` synchronized to `origin/main`.

### Added

- Added one universal homepage scoring-code entry that securely dispatches ordinary Tournament and Qualifying codes into their existing bounded authorization exchanges and certified scorecard route.
- Added the registry-based QA Seed Test Qualifier for repeatable real-data certification with six reciprocal players, completed Holes 1–8, and Hole 9 ready for play.
- Deployed the durable roster foundation with permanent coach-owned players, minimal seasons, season memberships, and nullable Tournament/Qualifying identity links.

### Verification

- Verified real Supabase RLS and integrity for owner creation, lifecycle updates, archival readability, cross-owner isolation, same-owner event links, restricted historical deletion, and legacy null links.
- Confirmed the roster migration performs no player backfill or name-based mapping and leaves certified tournament snapshots unchanged.
- Reconfirmed the production build and Playwright 174/174 after deployment. Roster-management UI and custom statistics remain unimplemented.

### Fixed

- Projected official hole resolutions into individual and team standings after refresh without mutating original audit rows or cached snapshots.
- Corrected tied leaderboard positions to standard competition ranking.
- Made identity-specific durable score rows authoritative over more-complete snapshot presentation arrays during mobile hydration.
- Changed Qualifying shared-code throttling so successful exchanges do not consume brute-force failure allowances while failed IP and normalized-code limits remain enforced.

## 2026-07-25

- Added Qualifying Q8 designated group scoring behind an explicit policy boundary, with validated group/round assignments, role-isolated access, group score entry, player-owned statistics, and self-verification on the existing scorecard route.
- Added designated-aware Qualifying readiness and finalization without reciprocal compatibility rows; official hole resolutions converge player assertions against scorer-authored audit rows.

## 2026-07-24

### Added

- Added Q7 Qualifying finalization orchestration through the certified Tournament Engine service, followed by locked and idempotent Qualifying metadata convergence.
- Added permanent read-only Qualifying history with finalized coach/date, daily and combined results, round summaries, statistics, and final rankings.
- Added Q6 read-only Qualifying daily, combined, segment, statistics, progress, discrepancy, and readiness projections over authoritative Tournament Engine rows.
- Added coach operations/results controls with competition ranking, incomplete-player handling, and direct routing to the existing Tournament Director workspace.
- Added Q5 session-wide Qualifying access codes, isolated player selection, bounded share-token exchange, and routing into the certified mobile scorecard.
- Added coach code management and a signed-out Qualifying Login flow with an explicit designated-scorer milestone block.
- Added Q4 transactional Qualifying activation, composing durable Tournament Engine pairing and scorecard generation under an advisory lock.
- Added idempotent coach activation with readiness validation and no scoring, review, snapshot, access-token, or QR writes.
- Added Q3B transactional Qualifying provisioning that composes idempotent tournament creation, reusable player synchronization, and durable round provisioning behind an advisory lock.
- Added a coach provisioning action that converts a validated draft into a real Tournament Engine tournament and reuses the existing tournament on concurrent calls or retries.
- Added Q3A owner-scoped relational Qualifying participants, groups, and group membership with transactional draft persistence and deterministic ordering.
- Added an idempotent backfill for Q2 JSON drafts and relational-first reads with JSON retained only as a temporary no-relational-row fallback.
- Added the authenticated six-step Qualifying coach creation wizard for roster selection, multi-day course setup, deterministic hole mapping, group assignment, scoring-mode configuration, review, and draft reload.
- Added atomic owner-scoped Qualifying draft persistence that writes only `qualifying_sessions` and `qualifying_days`, leaving Tournament Engine objects untouched.
- Added the Qualifying Q1 data foundation with RLS-protected sessions, days, designated-scorer assignments, and relational tournament-round mappings.
- Added deterministic read-only schedule planning for 9-, 18-, 27-, and 36-hole qualifying days without connecting Qualifying to tournament creation or scoring behavior.

### Fixed

- Converged Tournament Director discrepancy decisions across mobile Review, dashboard verification, Review Queue, submission eligibility, and finalization readiness through one shared official-score resolver.
- Preserved original self and marker hole rows for audit while applying Accept Player Score, Accept Marker Score, or Coach Override as the authoritative comparison value.
- Made finished-round review status player-specific and corrected submission confirmation to name the current player.
- Made Save Hole await current-player statistics persistence alongside the self score and reciprocal marker score before navigation or success.
- Kept failed required-statistics saves on the current hole with a retryable error while preserving stable upsert identities and the existing score-only offline fallback.

### Verification

- Verified real concurrent Q3B provisioning returned one tournament UUID, produced deterministic 9/18/27/36-hole round mappings, synchronized unique player/round rows, and created no pairings, scores, reviews, snapshots, share tokens, or scorer assignments.
- Verified a failed real provisioning transaction retained Draft status and produced no partial tournament, round, or player rows; authenticated UI provisioning and reload also passed without console/network errors.
- Applied the Q3A migration to Supabase; verified the existing men's draft retained 6 players/2 groups and the women's draft retained 5 players/2 groups, with unique membership and unchanged schedules/modes.
- Verified a new relational draft writes participants/groups/members atomically while tournament, round, player, score, snapshot, and share-token counts remain unchanged.
- Applied the Q2 draft migration to Supabase and verified real Men’s/Reciprocal and Women’s/Designated-Scorer drafts, exact reload, 9/18/27/36-hole persistence, and zero tournament, round, scorecard, snapshot, player, score, or share-token changes.
- Production build passed and Playwright passed 116/116 for the Qualifying coach creation workflow.
- Applied the additive Qualifying migration to the connected Supabase project, confirmed no pending migrations, and passed the production build and Playwright 111/111.
- Real Supabase flows verified all three discrepancy decisions, current-player submission, zero unresolved queue entries, converged Director totals, preserved audit rows, unique stable keys, and finalization eligibility.
- Production build passed and Playwright passed 107/107 for official discrepancy convergence.
- Real Supabase verification confirmed an immediate post-save refresh retained the Hole 18 self score, reciprocal marker score, Fairway, GIR, and Putts with no duplicate stable keys.
- Production build passed and Playwright passed 106/106.

## 2026-07-23

### Fixed

- Added database-backed sliding-window limits to public Team Tournament Login resolution by hashed client IP and normalized code.
- Made concurrent limit checks atomic with PostgreSQL advisory locks, removed anonymous access to the unrestricted resolver, and kept invalid and throttled responses indistinguishable.
- Bounded Team Tournament Login token issuance to one reusable active `mobile_scoring` token per tournament/team.
- Serialized simultaneous valid-code exchanges at the database boundary and replaced only expired or revoked Team Login tokens.
- Kept Team Login token material in a private, non-API schema while preserving existing scorecard URLs, QR tokens, team isolation, and code-regeneration behavior.

### Verification

- Real two-team Supabase verification confirmed zero token-row growth across 25 repeated resolutions and two simultaneous resolutions, separate team scopes, deterministic expired-token replacement, unchanged QR tokens, and unchanged scoring, player/pairing, and snapshot state.

## 2026-07-21

### Fixed

- Made tournament creation server-idempotent with a client-generated logical-action key and an owner-scoped database uniqueness constraint.
- Removed latest-owner tournament resolution: successful inserts return the row resolved by the exact creation key, while concurrent retries return that same UUID.
- Preserved creation keys across dashboard remounts, auth refreshes, and failed requests for complete seeds, incomplete seeds, and manual creation.

### Added

- Added authenticated Tournament Director Team Scoring Codes management beside Live Scoring readiness tools, including team-scoped loading, copy fallback, explicit-confirmation regeneration, missing-code generation, and a black-and-white print sheet.
- Added server-authorized single-team code generation and regeneration through the existing tournament mutation boundary; rotations invalidate only the selected code while preserving existing scorecard share tokens and tournament data.
- Added a prominent signed-out `Player Tournament Login` homepage entry and a mobile-first `/player-tournament-login` code-entry and team-scoped player-selection flow.
- Reused the existing Team Tournament Login lookup and QR scorecard-path builder so selected players open the existing scorecard with scoped round, pairing, and share-token context.
- Added uppercase normalization, space/hyphen removal, keyboard submit, duplicate-submit protection, focused retry states, Change Code isolation, and small-screen accessibility coverage.
- Added the Team Tournament Login foundation: deterministic six-character team codes, authenticated code persistence, a signed-out code lookup boundary, team-scoped player results, and current-pairing context.
- Added a secure code exchange that issues a fresh existing-purpose `mobile_scoring` share token and resolves player selection through the same `buildMobileScorecardPath` helper used by QR scoring.
- Added focused coverage for deterministic code rules, collision handling, invalid codes, team isolation, and identical QR/Team Code scorecard destinations.

### Scope

- No homepage/player-selection UI or Tournament Director code-management UI was added.
- QR, mobile scoring, persistence, Review, submission, leaderboard, finalization, and dashboard behavior remain unchanged.

### Verification

- Tournament creation certification produced 25 unique tournament rows from 25 consecutive incomplete-seed actions; concurrent same-key requests and a later retry returned one UUID, while a different key returned a different UUID.

## 2026-07-20

### Added

- Added a separate `Seed Tournament (Incomplete)` action for fast end-of-round verification without changing the existing `Seed Test Tournament` workflow.
- Added a deterministic two-player reciprocal tournament fixture with synchronized players, one pairing, generated scorecards, and stable self/marker score and hole-entry rows through Hole 17.
- Left Hole 18 incomplete for both self and reciprocal marker cards, kept self-owned statistics complete through Hole 17, left marker statistics null, and preserved null par-3 fairways.
- Added focused regressions for distinct repeated creation, deterministic identities, duplicate-free stable keys, Hole 18 incompleteness, and production-path tournament/player/snapshot/score mutations.

### Fixed

- Unified mobile resume-hole selection across reciprocal scorecards so the earliest missing self score, marked-player score, GIR, putts, or applicable fairway determines the opening hole after authoritative hydration.
- Removed the snapshot/no-stable-read Hole 1 reset and protected manual Previous/Next navigation from later hydration updates without introducing hydration writes.
- Corrected end-of-round Review ownership so each signed-out scorecard compares the current player's self-entered card with that same player's card entered by the assigned marker.
- Limited verification submission and review-status updates to the current player's round while preserving current-player statistics, stable-row precedence, snapshot compatibility fallback, and the other player's independent submission state.
- Separated Review score-comparison identity from statistics identity so marked-player Self/Marker verification remains intact while `My Round Statistics` always displays the current player's self-owned fairway, GIR, and putt data.
- Hydrated current-player self `score_hole_entries` back into editable mobile controls without reading marker statistics or writing compatibility rows.
- Preserved authoritative marker-score precedence as stable reciprocal `score_entries`, then snapshot compatibility, then unavailable, preventing Review synchronization from erasing valid dashboard snapshot values.

### Verification

- Production build passed and Playwright passed 86/86.
- Verified a fresh real incomplete tournament on both signed-out scorecards: Alex Morgan and Jordan Lee opened and refreshed on Hole 18, Hole 17 remained fully hydrated, and opening/navigation/refresh issued no scoring writes.
- Production build passed and Playwright passed 83/83.
- Verified both directions with a fresh real incomplete tournament: Alex submitted only Alex's round, Jordan remained unsubmitted, then Jordan independently reviewed and submitted Jordan's round.
- Production build passed and Playwright passed 82/82.
- Verified a real authenticated incomplete seed through QR readiness and both signed-out LAN scorecards; Alex Morgan and Jordan Lee opened directly on Hole 18 with Hole 17 hydrated.
- Production build passed and Playwright passed 79/79.
- Verified both Real Test 2 signed-out routes: Ryan's editable statistics and Review ownership were correct, Satch's submitted scorecard retained Satch-owned statistics, snapshot marker values remained visible, and hydration issued no writes.
- Confirmed Real Test 2 remained at 3 score rows and 54 hole-statistic rows with zero duplicate stable keys and no synthetic reciprocal marker row.

## 2026-07-19

### Added

- Replaced the simple submitted-round confirmation with player, round, final score, score-to-par, and direct actions to view the submitted scorecard or the share-token leaderboard.
- Added a refresh-stable, read-only post-submission view with compact Front 9 and Back 9 scorecards, par and scoring totals, per-hole fairway/GIR/putt values, and round statistics summaries.
- Preserved incomplete opted-out statistics as missing values with a clear Statistics Incomplete notice, while keeping par-3 fairways marked N/A and carrying the exact share token and round into leaderboard navigation.
- Added a dedicated `/leaderboard` route for signed-out, share-token-authorized access to real tournament team and individual standings.
- Reused the authenticated workspace's individual/team leaderboard calculations while loading authoritative marker-entered scores, roster identity, round setup, and snapshot compatibility data through the existing share-token read path.
- Added secure invalid-link handling, finalized-tournament viewing, responsive read-only standings, refresh coverage, and assertions that the public leaderboard issues no database mutations.
- Added an end-of-round Statistics Review table with per-hole fairway, green-in-regulation, putt, and completion values plus compact round summaries.
- Added exact missing-hole/statistic guidance and the explicit “Continue and finalize round without recording statistics” submission-time opt-out.
- Required complete par-4/par-5 fairways, all-hole greens in regulation, and all-hole putts unless the opt-out is selected; par-3 fairways remain excluded.
- Added a shared provenance-aware tournament catalog that reconciles mapped local IDs with Supabase UUIDs, preserves unmapped local-only entries, and returns deterministic deduplicated results.
- Made Supabase tournament identity, status, and finalization metadata authoritative while allowing snapshots and local cache data to enrich missing presentation fields.
- Migrated the homepage Saved Tournaments read path as the first low-risk catalog consumer and added focused identity, precedence, provenance, and ordering regressions.

### Fixed

- Made Review & Submit an authoritative synchronization point that drains pending saves, reloads current score and hole-statistic rows, and rebuilds Self/Marker comparisons before rendering Review.
- Added visible synchronization and retry states so failed reads cannot expose stale comparison data.
- Extended signed-out statistics reads to carry the validated share-token hash and added regressions for counterpart cards completed after initial hydration, totals, mismatches, statistics completeness, and refresh.
- Stopped routine tournament-page persistence after authoritative finalized hydration, including queued player reconciliation and snapshot synchronization work.
- Preserved the single version-guarded finalization mutation and normal pre-finalization roster/snapshot synchronization while keeping finalized refreshes read-only.
- Added regressions for one final snapshot write, zero routine mutations after finalized refresh, post-finalization HTTP error prevention, and continued pre-finalization synchronization.

### Verification

- Production build passed and Playwright passed 76/76.
- Verified the post-submission confirmation and scorecard/statistics subview on a safe submitted round, including all 18 scores, nine-hole and overall totals, missing-statistics presentation, exact leaderboard context, refresh restoration, finalized read-only behavior, and zero duplicate or synthetic writes.
- Verified the signed-out `Real Test` leaderboard on port 3000 with the existing mobile share token: authoritative team and individual standings loaded, refresh succeeded, Tournament Director controls remained absent, and no write requests occurred.
- Verified complete and incomplete statistics, exact missing-field warnings, par-3 fairway exclusion, summary totals, opt-out gating, mismatch protection, refresh hydration, and duplicate-row prevention.
- Verified the real `Real Test` race condition: an initially unavailable counterpart Self card synchronized to total `72` without refresh, retained marker total `75`, and exposed the three authoritative mismatches.
- Verified ten focused catalog cases covering Supabase-only, snapshot-backed, local-only, mapped identity, stale status/finalization precedence, cache enrichment, stale `popcorn` isolation, and deterministic ordering.
- Verified the real finalized tournament refresh sends zero `POST /api/tournament-mutations` requests and produces zero HTTP 500 responses while desktop and signed-out mobile remain read-only.

## 2026-07-18

### Fixed

- Hydrated the Review & Submit marked-player Self column from stable `score_entries` first, with Tournament Aggregate snapshot scores used only as a compatibility fallback.
- Required complete 18-hole self and marker cards before verification, displayed separate totals, and preserved mismatch blocking and idempotent repository/service submission.
- Hydrated signed-out mobile player and marker scores from the authoritative Supabase tournament snapshot when stable `score_entries` rows do not exist yet, while preserving synchronized player IDs for subsequent upserts.
- Prevented stale mobile localStorage tournaments from overriding the tournament UUID resolved by a valid scoring share token.
- Added explicit mobile score-loading and failure states so a failed read cannot appear as a legitimate blank scorecard.
- Removed Penalty Strokes from mobile score entry and now persist `penalty_strokes: null` without deleting the compatibility field.
- Added regressions for snapshot score hydration, hole navigation, refresh persistence, stable-key updates without duplicates, stale localStorage isolation, and Penalty Strokes removal.
- Kept the QR/mobile scoring modal inside the browser viewport by rendering it through a document-body portal with independent scrolling and accessible dialog semantics.
- Made the generated player scoring URL visible, selectable, and copyable while preserving secure share-token validation.
- Added regressions for modal viewport geometry, signed-out Hole 1 controls, refresh persistence, and visible invalid-token errors instead of blank screens.
- Restored homepage Login and Get Started navigation to the coach sign-in flow and validated internal `next` redirects before navigation.
- Preserved the Supabase coach session across dashboard, homepage, tournament navigation, and refresh while exposing an authenticated homepage state and Coach Sign Out.
- Connected homepage and dashboard Tournaments navigation to the tournament dashboard instead of inert fragment links.
- Reworked Seed Test Tournament to require coach authentication, create exactly one owned Supabase tournament, persist its seeded snapshot, prevent duplicate clicks, show loading/error feedback, and redirect to the new tournament UUID.
- Added focused Playwright coverage for persistent authentication, homepage tournament navigation, single seeded creation, successful redirect, refresh access, and visible seed failures.

### Verification

- Production build passed and Playwright passed 57/57.
- Verified Evan Brooks reviewing Mason Hayes against real Supabase: Self Total `72`, Marker Total `72`, all 18 holes matched, verification persisted after refresh, and no duplicate score rows were created.
- Verified the real signed-out Evan Brooks scorecard hydrates Hole 1 as Evan `3` and marker Mason Hayes `5`, with both values preserved after refresh.
- Verified the real QR flow on desktop and an iPhone-sized LAN browser: the modal remained usable, signed-out scoring loaded Evan Brooks at Hole 1, valid score inputs enabled Save Hole, refresh preserved access, and invalid tokens displayed an error.
- Verified real Supabase tournament creation through the normal coach login, Saved Tournaments visibility, 20 synchronized players, 5 pairing groups, 20 scorecards, full readiness, QR sharing, and signed-out mobile scoring.

## 2026-07-16

### Real Supabase Tournament Workflow Certified

- Prevented rapid Save Hole actions from shifting adjacent-hole scores by pinning each transaction to one hole, draining pending autosaves, and blocking duplicate navigation while persistence completes.
- Aligned Review Hub submission validation with the marked-player self scores and marker scores rendered by the review table.
- Hydrated the live leaderboard with authoritative Supabase player identities, preserving marker-score selection without cross-player score merges.
- Limited configured team counting scores to the smallest available team roster while preserving the configured count for teams with enough players.
- Kept finalization eligibility polling active until the completed snapshot converges, then finalized through an authenticated, version-guarded Supabase mutation.
- Added focused Playwright coverage for rapid adjacent-hole saves, Review submission, leaderboard hydration, feasible team standings, finalization convergence, authoritative finalization, duplicate-finalize rejection, and read-only enforcement.

### Certification

- Certified the complete real Supabase workflow through tournament creation, roster setup, pairings, QR generation, clean signed-out mobile scoring, refresh restoration, Review Hub submission, individual and team leaderboard convergence, Tournament Ready, finalization, and desktop/mobile read-only enforcement.
- Verified the authoritative finalized tournament and snapshot remain finalized after refresh and in clean browser contexts.
- Final regression baseline: production build passed and Playwright passed 47/47.

### Minimum Viable Stable Tournament Complete

- Completed MVST 1: roster, team, pairing, scorecard, `tournament_players`, and QR-readiness integrity (`479cf1ccb2af74fe32ad12a6e63ee9f0b2b9bead`).
- Completed MVST 2: deterministic tournament save ordering, hydration precedence, version-2 storage parsing, cross-tab synchronization, and round changes (`72669985ae0828deebc927be3b68675e0df77aa1`).
- Completed MVST 3: reliable QR generation, share-token validation, and signed-out Mobile Scoring loading and identity selection (`8a69ae4a2200fa1e484c2ed30ef61cfd174ee62b`).
- Completed MVST 4: reliable scorer and marker autosave, hole navigation, score restoration, Review Hub verification, and readiness calculation (`b6f3ec76f6cfc3e728871bb6add5e16ed840f830`).
- Preserved valid team-only tournament saves and stopped synchronization after rejected local persistence (`a2200bf15a151df55a6f72d9c383ea6a2c1c5870`).
- Completed MVST 5: canonical team behavior, finalized tournament authority, and post-finalization read-only enforcement (`4ea6aa79ce67d8c2f9958221ca8f8007577617c6`).
- Eliminated the prolonged dashboard scoring/review readiness delay with targeted convergence against persisted state (`650cc7a3ccea792ce4f727cf577d41d77b2938d7`).

### Verification

- Marked the Minimum Viable Stable Tournament milestone complete across creation, teams, players, pairings, scorecards, QR sharing, signed-out scoring, review, readiness, and finalization.
- Verified finalized state remains authoritative after refresh and in clean browser contexts, with historical mobile scores visible read-only.

## 2026-07-13

### Fixed

- Completed secure temporary Supabase client isolation so share-token and access-token clients no longer persist or manage the coach authentication session.
- Bounded share-token resolution with the shared-scorecard lookup timeout so the QR modal cannot remain stuck on "Preparing" indefinitely.

### Verification

- Verified real Supabase tournament creation, ownership, player synchronization, share-token creation, and shared tournament/player/score reads.
- Verified the share-token mobile scorecard in a clean signed-out browser context without coach authentication.
- Completed in commit `38853c5590067f9dd21646e2b753c9aa4c889bbd`.

## 2026-07-07

### Documentation

- Added Project Bible covering vision, product boundaries, source-of-truth direction, Tournament Aggregate, mobile scoring, live scoring, Review Hub, and future stat tracking.
- Added decision log for architecture rules and product scope.
- Added bug/risk log for shared tournament hydration and QR resolver risks.
- Added architecture stabilization roadmap to the roadmap.

### Behavior

- No app behavior changed.
- No code refactor performed.
- No commit created.
