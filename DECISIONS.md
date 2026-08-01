# Clubhouse HQ Decisions

Last updated: 2026-07-31

## Active Decisions

### Supabase durable rows are recovery authority

Database recovery operates on a consistent authoritative graph: Tournament and Qualifying identity, players, rounds, pairings, durable scorecards, score and hole entries, Review state, official audit values, finalization, roster links, and Dynamic Statistics history. `tournament_state_snapshots` and browser localStorage may assist reconstruction and verification but may never overwrite or replace populated durable authority. Targeted recovery preserves original UUIDs and entered-by identities; it never maps players by name or manufactures compatibility rows.

Managed backups and PITR are plan-dependent capabilities, not architectural assumptions. Before controlled beta, the selected backup mechanism must be verified against the documented RPO/RTO and exercised in an isolated recovery drill.

### Production releases separate application rollback from database correction

Every release pins an application commit to a verified remote migration ledger. Production migrations must be backward compatible with the previously deployed application during rollout. Application rollback redeploys the exact known-good compatible commit; it does not remove applied migrations. A defective deployed migration is corrected with a new reviewed forward migration, or with the `BACKUP_RECOVERY.md` process when authority cannot otherwise be restored. No routine release occurs during the tournament-day freeze defined in `RELEASE_ROLLBACK.md`.

### Monitoring protects authority without collecting credentials

Controlled-beta monitoring covers application, API, Supabase, authentication, score persistence, live scoring, and release health. It records release identity, operation/status/latency, redacted errors, and only the minimum access-controlled event identities needed for response. Raw scoring codes, share/access tokens, authorization headers, passwords, keys, and complete score payloads are prohibited from telemetry. Monitoring never becomes scoring or leaderboard authority; incident verification returns to durable rows and uses `RELEASE_ROLLBACK.md` or `BACKUP_RECOVERY.md` at their explicit boundaries.

### Monitoring starts vendor-neutral and disabled by default

The controlled-beta foundation uses stable Next.js instrumentation hooks and a same-origin client reporting endpoint rather than adding an unconfigured vendor SDK. All events cross one allowlisted, redacted model before structured server output; request bodies, headers, stacks, score payloads, and private player context are not accepted. Production operators must explicitly enable server and browser capture and configure their hosting/log collector for retention and alerts. `/api/health` reports process/configuration readiness only and never probes or exposes privileged database state.

### Actual production configuration is stricter than test deployment configuration

The validator derives an explicit deployment context. Actual production requires public HTTPS application and hosted Supabase origins and rejects loopback, reserved test/example hosts, embedded credentials, query strings, and fragments. CI and preview may use their approved test origins; managed Playwright is explicitly identified as test context even though Next.js runs its production server. Monitoring flags must align in actual production, and enabled monitoring requires release identity. Failures identify variables and violated rules but never echo values.

### Continuous integration uses client-safe Supabase configuration only

Pull requests and pushes to `main` must pass a locked dependency install, production build, and complete Playwright suite under the supported Node 20 line. The browser client requires a Supabase project URL and anonymous key even when Playwright intercepts network behavior, so CI obtains only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from GitHub Actions secrets and fails early when either is absent. A current-schema test/staging project is preferred. Service-role credentials, privileged database writes, deployment, and migration execution are prohibited. Failure artifacts are retained only for diagnosis. Hosted CI complements rather than replaces the release, real-Supabase, smoke-test, backup, monitoring, and drill gates.

### Public QR origins are distinct from browser test origins

`NEXT_PUBLIC_APP_URL` is the externally shareable origin used by centralized QR URL generation. It must not be inferred from or equated with Playwright's local managed-server origin. Hosted CI uses a reserved `.example` public origin while the browser still executes against `127.0.0.1`; production supplies the actual deployment origin through environment configuration. The deterministic CI public origin is not a secret.

### Hosted UI synchronization waits for observable completion state

Playwright synchronization must use web-first assertions against completed user-visible states instead of polling instantaneous locator snapshots or adding sleeps. Mobile Review certification accepts its two real entry states after authoritative hydration: Review may render automatically, or the Review action may become enabled and be activated. Focused bounds may cover that specific asynchronous contract; global timeouts, retries, skipped tests, and weakened assertions are not substitutes for synchronization.

Long-running persistence regressions may use a test-scoped execution budget when their intentional workload exceeds the global UI-test budget under hosted resource timing. The test must still wait on observable application state, retain injected latency and persistence assertions, and must not alter application code or use arbitrary sleeps.

### Tournament UX polish remains presentation-only

Phases 9B, 9C, and 10A refine layout, hierarchy, responsive behavior, accessibility semantics, loading and empty states, dialogs, touch targets, and focused UX regression coverage. They do not change scoring, Review, official resolution, finalization, analytics, persistence, synchronization, repositories, services, APIs, migrations, Supabase data, or database architecture. The certified Tournament Engine remains behaviorally authoritative beneath the polished presentation.

- Q8 Designated Group Scorer is a Qualifying-only strategy. Scorer-authored scores retain `(golfer, designated scorer)` identity, personal statistics retain `(golfer, golfer)` identity, and ordinary Tournament and reciprocal paths do not branch on designated behavior.
- Qualifying finalization dispatches readiness by scoring policy: reciprocal delegates unchanged to the Q7 gate, while designated sessions require assignment-matched scorer rows and each golfer's self verification.

### One universal entry resolves every supported player scoring code

The homepage exposes one player scoring-code workflow. Its server boundary normalizes the code, resolves exactly one supported event type, and delegates to the existing event-specific secure exchange. Ordinary Tournament and Qualifying retain their isolation, rate limiting, bounded share tokens, and certified `/scorecard/[playerId]` destination. Direct legacy entry routes may remain compatible, but new coded event types must integrate at this boundary instead of adding another homepage flow.

### Successful shared-code exchanges are not brute-force failures

Qualifying access rate limits count invalid, expired, revoked, inactive-session, and malformed resolutions. A successful valid shared-code exchange does not consume the IP or normalized-code failed-attempt allowance. Database advisory locks, generic public errors, hashed rate keys, session isolation, and bounded reusable share tokens remain mandatory.

### Durable identity-specific score rows outrank snapshot presentation

For each tournament, round, player, and entered-by identity, the existence of a stable Supabase score row is evaluated separately from its completeness. If the row exists, its stored values—including explicit zero or incomplete holes—are authoritative. Snapshot presentation data is a non-mutating compatibility fallback only when the corresponding stable row is absent.

### Official scores are immutable leaderboard projections

An official resolution is projected onto read-only scorecard and leaderboard models before totals, team counts, and ranks are calculated. Projection does not rewrite original self or marker inputs and does not persist resolved values into cached snapshots. Review continues to expose the original comparison and official outcome for audit.

### Leaderboards use competition ranking

Players or teams sharing the same ranking score receive the first ordinal position for that score and a `T` prefix. Later ranks skip the occupied positions: `1, T2, T2, 4`. Non-tied positions have no prefix, and statistics do not break score ties unless a separately approved competition rule is introduced.

### Custom statistics use definitions and packages, not schema columns

Future statistics are configuration-driven. A stable coach/program-owned definition describes its name, input type, allowed values, applicability, order, lifecycle state, and package membership. Tournament, Qualifying, Practice, and future scored events select a stat package that controls mobile inputs. Adding a statistic must not require adding a dedicated column to the scoring table.

Built-in Fairway, GIR, and Putts behavior remains protected until the dynamic package path is separately implemented and certified. Definition removal means deactivation for future entry, not deletion of historical meaning.

### Player development history uses durable rostered-player identity

Season and multi-event statistics attach to a durable rostered-player ID rather than player names, event labels, qualifying participant IDs, or round-specific tournament player IDs. Event scoring identities must map explicitly to that durable player. Roster edits, finalized events, season transitions, and stat-definition changes must not sever historical ownership.

### Hole-level values are analytics authority

Custom statistical values are stored at player, event, round, hole, and definition granularity with event type, course, par, entered-by/source identity, and official status where applicable. Season totals, averages, percentages, event splits, and trends are derived projections. Precomputed summaries may become performance caches, but they cannot replace the durable hole-level source.

### Custom-stat history preserves original and official meaning

Historical values retain enough immutable definition metadata or definition-version identity to remain understandable after rename, reorder, deactivation, package removal, or rule changes. When Review applies, original self and marker values remain auditable and an official value is projected into analytics without overwriting either source, matching the certified official-score resolution pattern.

### Qualifying finalization follows Tournament Engine authority

Q7 calls a Qualifying-readiness adapter inside the certified Tournament Finalization Service before recording any Qualifying finalization metadata. The adapter preserves the existing snapshot/tournament compare-and-swap mutation and finalization record, but accepts Q6's multi-round readiness instead of the ordinary single-workspace readiness projection. An owner-scoped advisory-locked RPC then independently verifies the finalized tournament and Q6 readiness before atomically recording only `qualifying_sessions.status`, `finalized_at`, and `finalized_by`. If Tournament finalization fails, Qualifying remains Active; if metadata convergence is interrupted after Tournament success, an idempotent retry completes it without re-finalizing or creating historical result rows.

### Qualifying results are read-only Tournament Engine projections

Q6 stores no standings, totals, progress, or statistics summaries. It maps existing `tournament_rounds` to Qualifying days and segments, applies the shared official-score resolver to submitted self rows, reads player-owned statistics, and derives competition-ranked daily/combined results plus readiness on demand. Incomplete players remain unranked, withdrawal/disqualification remain non-numeric states, and detailed review/resolution stays in the Tournament Director workspace.

### Qualifying access exchanges into certified mobile scoring

Q5 stores one hash-only, deterministic qualifying code per Active session. Public resolution is database-authoritative, session-isolated, rate-limited by hashed IP and normalized-code keys, and never exposes relational tables. Player selection exchanges into the existing `mobile_scoring` share-token system with one bounded reusable token per session, player, and active round; the destination remains the certified `/scorecard/[playerId]` route.

### Qualifying activation composes durable Tournament Engine artifacts

Q4 uses a per-session advisory lock and one database transaction. The pairing service applies the relational Qualifying groups to the existing `tournament_players` pairing identity fields; the scorecard service creates one durable `tournament_scorecards` artifact per tournament, round, and player. Activation validates readiness counts before moving Provisioned through Activating to Active. Retries return the existing activation and failures roll back all artifacts and status changes.

### Qualifying provisioning composes Tournament Engine services transactionally

Q3B acquires a per-session PostgreSQL advisory lock and composes the certified idempotent tournament-creation function with reusable tournament-player synchronization and tournament-round provisioning functions inside one database transaction. The deterministic creation key is `qualifying:<session UUID>`. A session moves from Draft through Provisioning to Provisioned atomically; failures roll back to Draft, while concurrent calls and retries return the same tournament. Qualifying never inserts engine objects from its TypeScript coordinator and does not create pairings, scorecards, access tokens, scores, statistics, reviews, or snapshots.

### Qualifying participants and groups are relational authority

Q3A stores selected players as immutable per-draft identity/name snapshots and represents groups plus ordered membership relationally. A participant is unique per session and may have exactly one membership; the atomic draft RPC rejects wrong-roster players, duplicates, missing membership, and empty groups before commit. Q2 JSON remains untouched as a temporary fallback only when no relational participant/group rows exist. This milestone does not create or modify Tournament Engine objects.

### Qualifying coach creation persists drafts without Tournament Engine objects

Q2 draft creation is an authenticated atomic database operation over `qualifying_sessions` and `qualifying_days`. Selected roster players and manual groups are configuration JSON on the owned session; scheduled days remain relational. A draft has a null `tournament_id` until a later explicit activation milestone. Creation must not insert tournaments, tournament rounds, pairings, scorecards, scores, snapshots, share tokens, or scorer assignments. Reciprocal and Designated Group Scorer choices are stored only as configuration in Q2.

### Qualifying reuses Tournament Engine rounds

Qualifying is an additive orchestration domain over the certified Tournament Engine. A qualifying session references one existing tournament, qualifying days describe the schedule, and relational tournament-round records identify the qualifying day and segment. A separate qualifying-round-segments table and a second scoring engine are prohibited. The Q1 repository and services are read-only; existing tournament, scoring, Review, leaderboard, QR, Team Login, and finalization paths do not consume this foundation yet.

### Official discrepancy resolution is a shared read-time projection

Accept Player Score, Accept Marker Score, and Coach Override persist an official `score_hole_entries` decision while retaining the original self and marker values for audit. A shared resolver selects the latest valid official entry for a player/hole and projects that value onto both sides of score comparison. Mobile Review, Tournament Director verification, Review Queue, submission eligibility, and finalization readiness must consume this rule instead of independently suppressing mismatches or rewriting historical rows.

### Save Hole completion includes entered statistics

For share-token mobile scoring, Save Hole is not successful until the current player's self score, entered Fairway/GIR/Putts, and reciprocal marker score have completed their existing persistence operations. Navigation remains locked during that observable save. A required statistics failure leaves the scorer on the same hole and reuses the stable tournament, round, player, entered-by, and hole upsert identity on retry. Score-only local offline fallback remains available when no statistics were entered.

### Team Tournament Login rate limits are database-authoritative

Public code resolution uses a private sliding-window attempt ledger keyed by hashed client IP and normalized code. Transaction advisory locks make the decision consistent across concurrent requests and multiple application instances. The public response intentionally does not reveal whether a code was invalid or a limit was exhausted, and the unrestricted resolver is not executable by anonymous clients.

### Team Tournament Login reuses one active token per tournament and team

Team-code exchange stores its reusable raw bearer token only in a private non-API schema linked to the existing hashed `tournament_share_tokens` row. The `(tournament_id, team_id)` identity and a transaction advisory lock serialize concurrent resolution. Active tokens survive browser refresh, multiple players/devices, and code regeneration so already-open scorecards remain valid. Expired or revoked tokens are replaced once and the superseded row is revoked. QR-issued tokens have no Team Login exchange record and remain untouched.

### Tournament creation is idempotent at the database boundary

Every complete seed, incomplete seed, and manual creation action acquires a client-generated key that survives remounts and auth refreshes until the full workflow succeeds. The authenticated API inserts with that key and relies on the unique `(owner_id, creation_key)` constraint for concurrency safety. A uniqueness conflict is resolved by the exact owner/key pair; latest-owner queries and client locks are never correctness boundaries.

### Team code rotation is an authenticated single-assignment mutation

Tournament staff load code assignments only through the authenticated tournament mutation boundary and table RLS. Generation and regeneration operate on one tournament/team assignment, retry database uniqueness collisions, and never alter pairings, scores, snapshots, or share tokens. Rotation invalidates the previous login code immediately, while already-open scorecards retain their independently scoped share token.

### Player Tournament Login retains team resolution only in page memory

The public code-entry page calls only the narrow Team Tournament Login endpoint and renders only its team-scoped response. Changing codes clears the prior resolution before another lookup. Raw codes, share tokens, internal player IDs, pairing IDs, and tournament UUIDs are never displayed or logged; selection validates team membership and navigates through the existing QR scorecard-path builder without introducing another scorecard implementation.

### Team Tournament Login exchanges codes for existing mobile-scoring authorization

Team Tournament Codes are six-character uppercase credentials generated deterministically from tournament/team identity with confusing characters excluded and database uniqueness enforced. Codes live in a dedicated RLS-protected relation rather than snapshots. A narrowly scoped signed-out lookup returns only that team's players and current pairing identifiers, issues a fresh expiring `mobile_scoring` share token, and uses the existing QR scorecard-path builder. Team Code access does not introduce player accounts or a second scorecard implementation.

### Mobile resume position is derived from complete current-page work

Initial mobile hole selection occurs after hydrating the current player's self card, the marked-player card entered by the current player, and current-player statistics. A hole remains incomplete when either score, GIR, putts, or a par-4/5 fairway is missing; par-3 fairways are not applicable. The selector performs no writes, stable rows retain precedence over snapshot compatibility, and later hydration may not overwrite manual Previous/Next navigation.

### Incomplete tournament seeds use normal authoritative persistence

The incomplete end-of-round fixture is a separate authenticated seed action and does not alter the existing seed. It creates a new owned tournament, reconciles stable tournament players, saves the aggregate snapshot, and upserts stable reciprocal `score_entries` and `score_hole_entries` through Hole 17 using production repository/service paths. Hole 18 remains missing, marker statistics remain null, par-3 fairways remain null, and the fixture does not manufacture review, submission, finalization, or schema state.

### Review score ownership and statistics ownership are independent

The player whose scorecard route is open owns Review and submission. Review compares that player's self-entered `score_entries` row with that same player's row entered by the assigned marker, while round statistics resolve from the current player's self-owned `score_hole_entries`. Stable score rows take precedence over non-mutating snapshot compatibility fallback, and submitting one player must not alter the assigned marker's independent submission state.

### Post-submission review stays within the share-token scoring context

The submitted mobile route owns its read-only confirmation and scorecard/statistics subview so player, tournament, round, and share-token identity remain unchanged across refresh. Submitted stable self-score rows and existing hole-statistic rows are authoritative, snapshot data remains compatibility fallback only, and genuinely missing statistics remain visibly missing. Leaderboard navigation carries the exact validated share token and round to the dedicated read-only leaderboard route.

### Signed-out leaderboards use a dedicated share-token boundary

Mobile players access real tournament standings only through `/leaderboard` with a validated existing share token. The token-resolved Supabase UUID determines tournament identity; stable marker-entered score rows remain authoritative and the snapshot is compatibility fallback only. The route reuses the same individual and team calculation functions as the authenticated workspace, exposes no Tournament Director controls, never uses `/live` demo data, and performs reads only.

### Entering Review is an authoritative synchronization boundary

Review & Submit must drain the current save queue and reload score and hole-statistic rows before displaying comparison state. Stable `score_entries` take precedence, snapshots remain compatibility-only and never create rows, and unavailable or failed reads must not render stale Review data.

### Statistics completeness gates round submission

Review requires Fairway Hit on par 4/5 holes, Green in Regulation on every hole, and Putts on every hole. Par-3 fairways are not applicable. Incomplete statistics block submission unless the player explicitly selects “Continue and finalize round without recording statistics”; that opt-out cannot bypass missing or mismatched scores and never creates synthetic statistic values. Because the current submission model has no appropriate durable opt-out field, the decision remains submission-time UI state for this milestone rather than introducing a migration.

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
