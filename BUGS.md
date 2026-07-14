# Clubhouse HQ Bugs And Risks

Last updated: 2026-07-13

## Open Bugs

### Duplicate React keys on tournament print-scorecard rows

Status: open.

The tournament live-scoring view emits duplicate React key errors for player print-scorecard rows.

### Multiple anonymous GoTrueClient warnings

Status: open.

The signed-out share-token scorecard creates multiple anonymous GoTrueClient instances using the default Supabase storage key. These clients do not compete for `clubhouse-hq-coach-auth`, but the warnings and redundant clients remain to be resolved.

## Resolved

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
