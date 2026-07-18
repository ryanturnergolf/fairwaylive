# Clubhouse HQ Changelog

## 2026-07-18

### Fixed

- Restored homepage Login and Get Started navigation to the coach sign-in flow and validated internal `next` redirects before navigation.
- Preserved the Supabase coach session across dashboard, homepage, tournament navigation, and refresh while exposing an authenticated homepage state and Coach Sign Out.
- Connected homepage and dashboard Tournaments navigation to the tournament dashboard instead of inert fragment links.
- Reworked Seed Test Tournament to require coach authentication, create exactly one owned Supabase tournament, persist its seeded snapshot, prevent duplicate clicks, show loading/error feedback, and redirect to the new tournament UUID.
- Added focused Playwright coverage for persistent authentication, homepage tournament navigation, single seeded creation, successful redirect, refresh access, and visible seed failures.

### Verification

- Production build passed and Playwright passed 52/52.
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
