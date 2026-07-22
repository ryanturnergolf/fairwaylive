# Clubhouse HQ Bugs And Risks

Last updated: 2026-07-21

## Open Bugs

### Team Tournament Codes are not yet provisioned by tournament UI

Status: planned follow-up, not a defect in this foundation milestone.

The storage, generation, lookup, homepage entry, and signed-out player-selection flow now exist, but no Tournament Director provisioning/printing controls are connected yet. Code management remains a separately scoped follow-up; QR and player code entry both use the same mobile scorecard implementation.

### Multiple anonymous GoTrueClient warnings

Status: open.

The signed-out share-token scorecard creates multiple anonymous GoTrueClient instances using the default Supabase storage key. These clients do not compete for `clubhouse-hq-coach-auth`, but the warnings and redundant clients remain to be resolved.

## Resolved

### Reciprocal mobile scorecards resumed on different holes

Status: resolved and verified with a fresh real incomplete tournament on 2026-07-20.

Resume selection inspected only the current player's self-score array before statistics hydration, while a snapshot/no-stable-read branch could force Hole 1. The selector now waits for both current-page score directions and current-player statistics, chooses the earliest hole with required work, ignores par-3 fairways, and cannot overwrite later manual navigation. Hydration remains read-only.

### Review submitted the assigned marker's round instead of the current player's round

Status: resolved and verified with a fresh real incomplete tournament on 2026-07-20.

Review reused reciprocal score-entry identities from the scoring form, causing the open scorecard to display and submit the other player's round. Review now resolves the current player's self card, the current player's card entered by the assigned marker, and the current player's self-owned statistics as separate authoritative identities. Submission updates only the current player's stable rows and review state; the other player remains unsubmitted until completing their own Review.

### Full seed tournaments were slow for end-of-round regression testing

Status: resolved and verified on 2026-07-20.

The existing seed workflow required replaying a full round before Review, submission, post-round, and signed-out leaderboard checks could begin. Altering that fixture would have risked established setup and scoring coverage.

A separate incomplete seed now creates two reciprocal players with authoritative stable self and marker rows plus self-owned statistics through Hole 17. Hole 18 remains genuinely absent from hole-entry persistence and zeroed in score cards, so normal mobile scoring completes the round without synthetic submission or review state. The original seed remains unchanged.

### Review reversed statistics ownership and erased snapshot marker compatibility

Status: resolved and verified against `Real Test 2` on 2026-07-20.

Review used the marked player's identity for both score comparison and statistics even though mobile statistic inputs belong to the current player. Editable controls also did not reload existing self-owned hole statistics, and a missing reciprocal marker row caused Review synchronization to replace valid snapshot marker scores with blanks.

Review now receives independent score-comparison and statistics identities, editable controls hydrate current-player self statistics only, and marker scores resolve from a stable reciprocal row before snapshot compatibility. Snapshot reads remain non-mutating, stable rows override fallback values, and par-3 fairways remain not applicable.

### Submitted rounds lacked a player-facing scorecard and statistics view

Status: resolved and verified on 2026-07-19.

The mobile flow ended at a minimal confirmation, leaving players without a secure way to review their submitted 18-hole card, available statistics, or navigate to the real tournament leaderboard.

The submitted state now shows player, round, final score, and score to par, with actions for a read-only scorecard/statistics view and the share-token leaderboard. The view reads existing authoritative score and statistic rows, separates Front 9 and Back 9, preserves missing opted-out statistics without manufacturing data, survives refresh, and performs no score or statistic writes.

### Signed-out players had no authoritative tournament leaderboard

Status: resolved and verified against the real `Real Test` tournament on 2026-07-19.

The authenticated tournament workspace contained the real leaderboard, while `/live` was static demo content and no signed-out destination preserved share-token authorization. Sending mobile players to either location would expose the wrong data or the broader Tournament Director workspace.

The dedicated `/leaderboard` route now validates the existing share token, loads the token-authorized tournament, roster, submitted marker scores, and compatibility snapshot, and reuses the established team and individual calculations. It is read-only, remains available for finalized tournaments, rejects invalid or expired links, exposes no director controls, and performs no database writes.

### Review submission ignored statistics completeness

Status: resolved and verified on 2026-07-19.

Review synchronized authoritative hole statistics but did not present them or include their completeness in submission eligibility. Players could therefore submit without reviewing missing fairways, greens in regulation, or putts.

Review now displays every hole and the round summaries, requires fairways only on par 4/5 holes plus GIR and putts on every hole, and lists exact missing fields. Incomplete statistics block submission unless the player selects the explicit submission-time opt-out; missing scores and score mismatches remain blocking, and no synthetic statistics or duplicate rows are written.

### Review retained stale counterpart Self scores after concurrent scoring

Status: resolved and verified against the real manually created tournament on 2026-07-19.

The marked player's self card was loaded only during initial scorecard hydration. When reciprocal scoring pages opened before either player finished, later stable self rows were saved correctly but Review continued displaying the initially empty comparison until refresh.

Entering Review now drains pending saves, reloads authoritative `score_entries` and `score_hole_entries`, applies stable-row then snapshot-compatibility precedence, and renders only after rebuilding totals, completeness, and mismatches. Failed synchronization stays in scoring view with a retry action.

### Homepage catalog could duplicate or contaminate Supabase tournaments

Status: resolved for the shared catalog and homepage proof consumer on 2026-07-19.

Independent merge paths could treat a mapped local ID and its Supabase UUID as separate tournaments, and localStorage metadata merged after remote data could replace authoritative status or finalization fields. Historical entries such as `popcorn` could also be presented without explicit source provenance.

The shared tournament catalog now uses the Supabase UUID as canonical identity when available, reconciles existing local-to-shared mappings, preserves unmapped entries as explicitly local-only, and limits snapshots and cache data to safe enrichment. The homepage consumes this model; remaining dashboard consumers are intentionally deferred to later milestones.

### Finalized tournament refresh attempted routine persistence

Status: resolved and verified against real Supabase on 2026-07-19.

Two tournament-page persistence effect runs could begin before finalized authority finished hydrating. Both attempted `reconcileTournamentPlayers`, received HTTP 500 from finalized-tournament write protection, and stopped before routine snapshot synchronization.

Finalized metadata now blocks the page persistence lifecycle, clears pending snapshot timers, and obsoletes queued work. The persistence service also rechecks the latest finalized envelope before remote mutations. The authoritative finalization mutation remains unchanged, finalized writes remain protected, and pre-finalization reconciliation and snapshot synchronization continue normally.

### Review treated missing marked-player self rows as a clean match

Status: resolved and verified against real Supabase on 2026-07-18.

Review & Submit previously read the marked player's Self column only from a stable self-entered `score_entries` row. Legacy tournaments with a complete authoritative snapshot card but no migrated self row therefore rendered blanks, calculated a zero total, omitted mismatches, and could leave verification enabled.

Review now prefers stable self-entered rows and uses the Tournament Aggregate scorecard only as a compatibility fallback. Submission requires complete 18-hole self and marker cards, missing values never count as matches, separate totals are displayed, and verification continues through the existing idempotent repository/service flow.

### Signed-out mobile scorecards discarded existing snapshot scores

Status: resolved and verified against real Supabase on 2026-07-18.

Desktop live scoring read completed legacy scorecards from the Tournament Aggregate snapshot, but the signed-out resolver rebuilt synchronized player rows with zeroed scores and then found no `score_entries` rows. The shared resolver now carries snapshot values onto stable Supabase player identities, mobile hydrates player and marker inputs before editing, and subsequent saves retain the existing tournament/round/player/entered-by upsert key.

Stale mobile localStorage cannot replace the share-token tournament, hydration failures render an explicit error instead of blank authoritative-looking inputs, and Penalty Strokes is no longer exposed or required by mobile scoring.

### QR modal displayed as a blank green screen

Status: resolved and verified on desktop and phone-sized LAN contexts on 2026-07-18.

The fixed QR overlay was rendered inside a tournament-page containing block, so a scrolled Live Scoring page could position the modal panel above the viewport while leaving only the green backdrop visible. The QR modal now renders through a document-body portal, remains viewport-bound and independently scrollable, exposes a copyable player URL, and retains explicit loading and invalid-token errors.

### Coach auth navigation and seeded tournament controls

Status: resolved and verified against real Supabase on 2026-07-18.

The homepage now reflects the durable Supabase coach session, Login/Get Started and Tournaments use real internal routes, coach-auth validates `next` destinations, and dashboard sign-out clears the authenticated session. Seed Test Tournament now creates one authenticated, owned Supabase tournament with its seeded snapshot, blocks duplicate clicks, reports failures, and redirects to the UUID tournament page.

Focused coverage verifies dashboard-homepage-dashboard persistence, refresh access, tournament navigation, one seed mutation, redirect behavior, and the failure state.

### Tournament scoring certification blockers

Status: resolved and certified against real Supabase on 2026-07-16.

Rapid Save Hole actions no longer shift adjacent-hole values; Review submission validates the same marked-player comparison shown in the UI; live scoring merges submitted rows by authoritative player identity; team counting-score configuration remains feasible for small rosters; completed snapshots continue converging into finalization eligibility; and finalization now persists through the authenticated, version-guarded Supabase mutation path.

The complete workflow was verified through finalization and read-only refresh behavior in desktop and clean signed-out mobile contexts. Focused regressions are included in `mobile-scorecard-persistence.spec.ts`, `roster-pairing-integrity.spec.ts`, and `tournament-finalization-workflow.spec.ts`.

### Roster, pairing, and scorecard duplication

Status: resolved in commit `479cf1ccb2af74fe32ad12a6e63ee9f0b2b9bead`.

Active rosters are unique, pairings require every active player exactly once, and scorecards render only from validated pairings. This also resolved the duplicate React player-row keys caused by duplicated tournament data.

### Stale tournament saves and hydration overwrites

Status: resolved in commit `72669985ae0828deebc927be3b68675e0df77aa1`.

Page-level saves are serialized, obsolete completions are ignored, authenticated hydration prefers remote state, and version-2 local envelopes are parsed consistently across tabs.

### Unreliable QR and signed-out Mobile Scoring loading

Status: resolved in commit `8a69ae4a2200fa1e484c2ed30ef61cfd174ee62b`.

QR readiness requires synchronized validated data, share tokens are validated before rendering, and signed-out scorecards use authoritative tournament, player, pairing, score, and marker identities.

### Scoring, Review Hub, and readiness inconsistency

Status: resolved in commit `b6f3ec76f6cfc3e728871bb6add5e16ed840f830`.

Scorer and marker changes persist through navigation and refresh, submissions are idempotent, and review and completion calculations use persisted scores only.

### Team-only tournament saves rejected with an empty player roster

Status: resolved in commit `a2200bf15a151df55a6f72d9c383ea6a2c1c5870`.

Destructive-save protection is collection-specific, allowing teams to be created before players while retaining protection against genuine collection erasure.

### Conflicting finalized status and mutation controls

Status: resolved in commit `4ea6aa79ce67d8c2f9958221ca8f8007577617c6`.

Finalized state is authoritative across dashboard, tournament, and mobile views; coach mutation controls are removed and historical scorecards remain read-only.

### Dashboard readiness convergence delay

Status: resolved in commit `650cc7a3ccea792ce4f727cf577d41d77b2938d7`.

Targeted refreshes promptly converge dashboard readiness against persisted submission and review data without weakening finalization rules.

### QR modal stuck on Preparing

Status: resolved in commit `38853c5590067f9dd21646e2b753c9aa4c889bbd`.

Share-token resolution now uses the shared-scorecard lookup timeout, preventing the QR modal from remaining on "Preparing" indefinitely.

### Share-token loading hang

Status: resolved in commit `38853c5590067f9dd21646e2b753c9aa4c889bbd`.

Slow or failed share-token resolution now exits through the bounded lookup path instead of leaving the signed-out scorecard loading indefinitely.

### GoTrueClient competition for clubhouse-hq-coach-auth

Status: resolved in commit `38853c5590067f9dd21646e2b753c9aa4c889bbd`.

Temporary share-token and access-token clients no longer persist sessions or use the coach authentication storage key.

## Active Architecture Risks

### Shared dashboard tournaments can look unstarted on phone

Status: diagnosed, not fixed in this milestone.

Cause: shared dashboard loading currently reads Supabase `tournaments` rows but does not hydrate the full Tournament Aggregate. A phone without desktop localStorage is missing teams, players, pairings, scorecard rows, scorecard generation state, current round setup, and local/shared UUID mapping.

Impact: tournaments that were already started on desktop can appear as if they still need scorecards generated.

Minimal direction: add shared aggregate hydration from Supabase tournament and tournament player rows before changing UI conditions.

### QR resolver depends on shared tournament player rows

Status: diagnosed, not fixed in this milestone.

Cause: shared QR links use the Supabase tournament UUID. A phone without localStorage can resolve the scorecard only when Supabase has enough `tournament_players` data for the requested tournament and round.

Impact: if the shared tournament row exists but player/pairing rows are missing or not synced, the phone remains on the resolving state until the timeout/error path.

Minimal direction: only mark QR as shared-ready after player sync succeeds, and expose a clear failed/pending shared sync state.

## Protected Workflows

- QR/mobile scorecard resolution.
- Marker-only live leaderboard scoring.
- localStorage fallback and recovery.
- Supabase score saves.
- End-of-round review and discrepancy detection.
