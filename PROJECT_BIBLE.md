# Clubhouse HQ Project Bible

Last updated: 2026-07-27

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

## Future Stat Tracking

Stats should be enabled by default per tournament, with the option to disable later if needed.

Each hole score should be able to carry:

- fairway hit,
- green in regulation,
- putts from 1 to 6,
- optional future stat fields.

Stats must be tied to the hole score entry, not stored as detached player-level notes. That keeps scoring, review, and development analytics aligned.

Initial stat architecture should preserve:

- hole number,
- round number,
- player id,
- entered-by player id,
- score,
- fairway hit,
- green in regulation,
- putt count,
- source and review status.

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
