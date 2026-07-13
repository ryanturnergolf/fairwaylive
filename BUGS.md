# Clubhouse HQ Bugs And Risks

Last updated: 2026-07-07

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
