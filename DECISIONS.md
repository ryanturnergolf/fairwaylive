# Clubhouse HQ Decisions

Last updated: 2026-07-19

## Active Decisions

### Tournament catalogs use canonical shared identity and explicit provenance

When a Supabase UUID is known, it is the catalog entry's canonical identity and any mapped local ID is an alias. Supabase row metadata, status, and finalization state remain authoritative; a valid snapshot may enrich the entry, and localStorage may fill missing presentation fields without overriding authority. Unmapped local tournaments remain visible as local-only entries and are not automatically pruned.

### Finalized tournament hydration is read-only

Once Supabase tournament status, finalized snapshot settings, or the finalization record establishes finalized authority, routine page persistence must stop before player reconciliation or snapshot synchronization. Queued work must recheck the latest finalized envelope before remote mutation. Only the authenticated, version-guarded finalization operation may write the final snapshot; endpoint write protection remains strict.

### Review comparison requires two complete authoritative cards

The marked player's stable self-entered `score_entries` row takes precedence in Review & Submit. When that row does not exist, the Tournament Aggregate snapshot may supply a compatibility baseline without creating a second permanent source of truth or synthetic score rows. Verification requires all 18 self and marker values to exist and match; missing comparison data always blocks submission.

### Secure mobile scoring hydrates from Supabase snapshot state before local cache

A valid mobile scoring share token determines the tournament UUID. Existing score-entry rows remain the current mutation/read authority, while Tournament Aggregate snapshot scorecards provide the compatibility baseline when synchronized `score_entries` have not been created yet. Snapshot cards are mapped to stable synchronized player identities by stable ID or unique player/team identity, and later saves use the same tournament, round, player, and entered-by upsert key. localStorage may assist recovery but cannot override the share-token tournament.

### Penalty Strokes is not a mobile-entered statistic

Mobile scoring exposes fairway hit, green in regulation, and putts only. The historical `penalty_strokes` field remains available for schema compatibility, but mobile UI and completion rules do not request it and mobile mutations write `null`.

### Viewport overlays render outside transformed page subtrees

QR/mobile scoring dialogs must render at the document body so fixed positioning is relative to the viewport, not a transformed or positioned tournament-page ancestor. Long modal content must scroll inside a viewport-bounded overlay, and share links must remain visible and selectable without weakening token validation.

### Coach authentication state comes from the Supabase singleton

Homepage and dashboard authentication UI must read and subscribe to the durable Supabase browser-client session. localStorage may contain Supabase's persisted session representation, but application code must not treat a separate local flag as authentication authority.

### Post-authentication redirects must remain internal

Coach sign-in accepts only paths beginning with a single `/`; protocol-relative and external destinations fall back to `/dashboard`. Login, Get Started, Homepage, and Tournaments navigation use Next.js links to explicit application routes.

### Seeded tournaments use the authenticated production mutation path

Seed Test Tournament is a guarded one-click operation. It requires a verified coach session, creates the owned tournament through the authenticated mutation endpoint and RLS, persists the seeded Tournament Aggregate snapshot, exposes pending and failure states, and redirects only after the shared data is saved.

### Certified scoring mutations preserve authoritative identity and ordering

Each Save Hole transaction captures one immutable target hole and completes pending score persistence before navigation. Review submission uses the same marked-player self and marker comparison rendered by the Review Hub. Shared leaderboard hydration maps local scorecard rows to authoritative tournament player identities while retaining marker-entered scores as the competition source.

### Team counting scores must be feasible

The configured counting-score value remains unchanged when every team has enough players. When a team roster is smaller, the effective count is limited to the smallest available team so a valid team leaderboard cannot be impossible to produce.

### Finalization is an authenticated authoritative mutation

Eligibility remains strict and continues polling while an otherwise completed tournament waits for snapshot convergence. Finalization writes the finalized snapshot and tournament status through the authenticated server mutation path with aggregate-version guards. A repeated or stale finalization request is rejected rather than treated as a successful no-op.

### Minimum Viable Stable Tournament uses the current persistence architecture

The completed MVST baseline stabilizes the existing architecture without introducing a revision system or replacement persistence model.

### Tournament collections require canonical integrity

An active player may appear only once in the roster and exactly once in validated pairings. Scorecards and QR access may be generated only from valid pairings and synchronized tournament players. Team changes must update dependent state and invalidate stale pairings.

### Tournament saves and hydration are ordered and authority-aware

Page-level saves are serialized and obsolete asynchronous completions are ignored. Authenticated tournaments prefer current remote state, local reads use the canonical version-2 envelope parser, and synchronization stops when local persistence rejects a save.

### Persisted scoring and review data determine readiness

Scoring completion, Review Hub verification, and finalization readiness are calculated from persisted data. Targeted dashboard refreshes may accelerate convergence after mutations but must never infer readiness optimistically.

### Finalized tournament state is authoritative and read-only

Canonical finalized status from Supabase governs the dashboard, tournament page, and signed-out scorecards. Finalized tournaments expose historical data but no mutation-capable controls; UI prevention occurs before a request is created, with server authority retained as defense in depth.

### Temporary clients never manage coach authentication

Temporary share-token and access-token Supabase clients must not persist, refresh, detect, or otherwise manage the coach authentication session. They must be isolated from the durable authenticated browser client.

### Only the authenticated singleton uses clubhouse-hq-coach-auth

The singleton authenticated Supabase browser client is the only client allowed to use `clubhouse-hq-coach-auth`. Temporary clients must use non-persistent authentication settings and must never share that storage key.

### Clubhouse HQ is not recruiting software

The current product is a golf coach operations platform. Recruiting may become a later module, but current architecture and roadmap work should optimize tournament operations, live scoring, review, and coach workflows first.

### Tournament engine is the foundation

Tournament setup, teams, players, pairings, scorecards, QR/mobile scoring, live scoring, and review are the core engine. Future modules should integrate with that engine instead of bypassing it.

### Supabase is the future source of truth

Supabase should become the durable shared source of truth for tournaments and scores. This must happen incrementally, with focused schema/service changes and tests around shared-device workflows.

### localStorage remains supported

localStorage is not temporary throwaway state. It is the local cache/offline fallback and recovery path. Do not remove it or overwrite populated localStorage with empty shared state.

### Tournament Aggregate is the target domain model

Both localStorage and Supabase should be able to hydrate a Tournament Aggregate containing metadata, teams, players, rounds, pairings, scorecard generation state, scorecard rows, scores, marker assignments, review status, and local-to-shared id mapping.

### Live scoring uses marker-entered scores

Marker-entered scores are the competition display source. Self-entered scores remain available for progress, review, discrepancy detection, and future stats.

### Future hole stats attach to hole scores

Fairway hit, green in regulation, and putts 1-6 should be stored with each hole score entry. Stats should be default-on per tournament when implemented.
