# Clubhouse HQ Changelog

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
