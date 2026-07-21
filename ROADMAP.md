# Clubhouse HQ Roadmap

A lightweight tournament management and live scoring platform for golf coaches and tournament directors.

## Architecture Stabilization Roadmap

Last updated: 2026-07-20

This roadmap favors small milestones. Do not start a large rewrite. Protect QR/mobile scoring, marker-only live scoring, and localStorage fallback during every step.

### Minimum Viable Stable Tournament

Status: **COMPLETE**

The current architecture supports the complete coach workflow from tournament creation through finalized, read-only historical access.

1. MVST 1 — roster, pairing, scorecard, and QR integrity (`479cf1ccb2af74fe32ad12a6e63ee9f0b2b9bead`).
2. MVST 2 — deterministic save ordering and hydration (`72669985ae0828deebc927be3b68675e0df77aa1`).
3. MVST 3 — reliable QR and signed-out Mobile Scoring (`8a69ae4a2200fa1e484c2ed30ef61cfd174ee62b`).
4. MVST 4 — scoring, Review Hub, and readiness lifecycle (`b6f3ec76f6cfc3e728871bb6add5e16ed840f830`).
5. Team-only persistence correction supporting MVST 5 (`a2200bf15a151df55a6f72d9c383ea6a2c1c5870`).
6. MVST 5 — canonical Teams and Finalization authority (`4ea6aa79ce67d8c2f9958221ca8f8007577617c6`).
7. Dashboard readiness convergence (`650cc7a3ccea792ce4f727cf577d41d77b2938d7`).

The MVST regression baseline covers tournament creation, teams, players, cross-tab refresh, pairings, scorecards, QR links, signed-out reciprocal scoring, review, readiness, finalization, Supabase reload, and read-only historical access.

### Completed Milestone: Incomplete End-Of-Round Seed

Status: **COMPLETE**

- Added a second authenticated seed action while preserving the original full seed behavior.
- Created a deterministic two-player reciprocal fixture with stable self scores, marker scores, and self-owned statistics through Hole 17.
- Kept Hole 18 incomplete, marker statistics null, and par-3 fairways not applicable so normal QR/mobile scoring supplies the remaining data.
- Verified ready QR sharing, both signed-out player routes opening on Hole 18, distinct repeated tournaments, and duplicate-free stable keys.
- Final automated regression: production build passed and Playwright passed 82/82.

Recommended next milestone: resume dashboard separation only as a separately scoped change.

### Completed Milestone: Reciprocal Mobile Ownership And Hydration

Status: **COMPLETE**

- Separated marked-player score comparison from current-player statistics ownership in Review.
- Restored current-player self statistics into editable mobile controls while excluding marker-row statistics and preserving par-3 applicability.
- Retained dashboard snapshot marker scores when no stable reciprocal row exists, with stable rows remaining authoritative and no compatibility writes.
- Verified both Real Test 2 directions without database mutations or duplicate rows.
- Final automated regression: production build passed and Playwright passed 79/79.

Recommended next milestone: commit this scoring correction independently, then resume separately scoped product work.

### Completed Milestone: Post-Submission Scorecard And Statistics

Status: **COMPLETE**

- Replaced the simple submitted state with player, round, final score, score-to-par, and actions for the submitted scorecard and secure leaderboard.
- Added phone-friendly Front 9 and Back 9 scorecards with per-hole par, score, fairway, GIR, and putts plus nine-hole and round summaries.
- Preserved incomplete opted-out statistics as missing values, marked par-3 fairways N/A, and restored the selected post-round view after refresh.
- Carried the exact share token and round into the dedicated leaderboard while retaining finalized read-only behavior and zero score/statistic writes.
- Final automated regression: production build passed and Playwright passed 76/76.

Recommended next milestone: resume the separately scoped Coach and Tournament Director dashboard separation work.

### Completed Milestone: Share-Token Tournament Leaderboard

Status: **COMPLETE**

- Added a dedicated signed-out `/leaderboard` route that resolves the existing share token to the authoritative tournament UUID.
- Loaded roster, submitted marker scores, round configuration, finalization state, and snapshot compatibility data through share-token-authorized reads.
- Reused the authenticated workspace's team and individual leaderboard calculations without exposing its controls or using `/live` demo content.
- Verified invalid-token rejection, finalized viewing, refresh persistence, responsive standings, and zero database mutations.
- Verified the real `Real Test` leaderboard on port 3000; final automated regression passed 74/74.

The post-submission confirmation and read-only scorecard/statistics view now use this secure leaderboard destination.

### Completed Milestone: End-Of-Round Statistics Review

Status: **COMPLETE**

- Added per-hole Fairway Hit, GIR, Putts, applicability, and completion review with round summaries.
- Required fairways on par 4/5 holes only and GIR/Putts on all holes.
- Listed exact missing holes and fields and added the approved submission-time statistics opt-out.
- Preserved score completeness and mismatch blocking, authoritative statistics rows, and duplicate-safe submission.
- Final automated regression: production build passed and Playwright passed 72/72.

The post-submission traditional scorecard and statistics summary are now complete.

### Completed Milestone: Authoritative Review Synchronization

Status: **COMPLETE**

- Made Review entry drain pending saves and reload authoritative score and hole-statistic rows before rendering.
- Rebuilt Self/Marker totals, completeness, and mismatches from current stable rows with snapshot compatibility fallback only.
- Added share-token-aware signed-out statistics reads plus visible loading and retry states.
- Loaded fairway, GIR, and putt completeness into the comparison model without changing submission rules or exposing the deferred statistics-review UI.
- Verified the real manually created `Real Test` race without refresh; final automated regression passed 69/69.

The statistics review, opt-out, and post-submission scorecard/statistics actions are complete.

### Completed Milestone: Shared Provenance-Aware Tournament Catalog

Status: **COMPLETE**

- Added one typed catalog read model for Supabase, snapshot-backed, cached, and local-only tournaments.
- Reconciled existing local-to-shared mappings so mapped local IDs and Supabase UUIDs produce one canonical entry.
- Preserved Supabase status and finalization authority while retaining localStorage as cache/offline/local-only fallback without automatic pruning.
- Migrated the homepage as the proof consumer without changing routes, navigation, dashboard responsibilities, or tournament workflows.
- Added ten focused catalog regressions; final automated regression passed 67/67.

Recommended next milestone: migrate one low-risk dashboard service/read helper to the shared catalog without changing route ownership or visible layouts.

### Completed Milestone: Read-Only Finalized Persistence Lifecycle

Status: **COMPLETE**

- Prevented routine player reconciliation and snapshot synchronization after authoritative finalized hydration.
- Cancelled pending snapshot timers and made queued persistence recheck the latest finalized envelope before remote mutation.
- Preserved one authoritative final snapshot write and normal pre-finalization reconciliation/snapshot persistence.
- Verified the real finalized tournament refresh sends zero tournament mutation requests and zero HTTP 500 responses while desktop and signed-out mobile remain read-only.
- Final automated regression: production build passed and Playwright passed 57/57.

### Completed Milestone: Snapshot-Compatible Mobile Review

Status: **COMPLETE**

- Resolved the marked player's Review Self card from stable self-entered score rows first and the Tournament Aggregate snapshot only when the stable row is absent.
- Required complete 18-hole self and marker cards before submission, retained hole-level mismatch blocking, and displayed separate Self and Marker totals.
- Preserved the existing idempotent verification service/repository flow without generating duplicate or synthetic score rows.
- Verified the real Evan Brooks review of Mason Hayes at `72` / `72`, including submission and refresh persistence.
- Final automated regression: production build passed and Playwright passed 57/57.

### Completed Milestone: Snapshot-Hydrated Mobile Scoring

Status: **COMPLETE**

- Mapped legacy Tournament Aggregate scorecards onto synchronized Supabase player identities without changing stable score-entry upsert keys.
- Hydrated signed-out player and marker values across hole navigation and refresh, while preventing stale localStorage tournaments from overriding the share-token UUID.
- Added visible score-loading and failure states.
- Removed Penalty Strokes from mobile entry and validation while retaining the compatibility field as `null`.
- Verified Evan Brooks Hole 1 as `3` and marker Mason Hayes as `5` in the real Supabase tournament.
- Final automated regression: production build passed and Playwright passed 54/54.

### Completed Milestone: Viewport-Safe QR Mobile Entry

Status: **COMPLETE**

- Moved the QR scoring modal to a document-body portal so the tournament page scroll position cannot hide the panel behind its green overlay.
- Added viewport height constraints, independent modal scrolling, accessible dialog semantics, and a visible selectable player URL.
- Verified signed-out desktop and phone-sized LAN scorecards, Hole 1 controls, refresh access, and invalid/expired-token errors.
- Final automated regression: production build passed and Playwright passed 53/53.

### Completed Milestone: Authenticated Seeded Tournament Entry Flow

Status: **COMPLETE**

- Restored coach login, validated internal redirects, persistent homepage/dashboard auth state, and Coach Sign Out.
- Connected homepage and dashboard tournament navigation to the tournament dashboard.
- Made Seed Test Tournament an authenticated, duplicate-safe Supabase creation and snapshot workflow with loading/error feedback and UUID redirect.
- Verified Saved Tournaments, refresh access, 20 synchronized players, 5 pairings, 20 scorecards, full readiness, QR sharing, and clean signed-out mobile scoring.
- Final automated regression: production build passed and Playwright passed 52/52.

### Completed Certification: Real Supabase Tournament Workflow

Status: **COMPLETE**

- Certified rapid adjacent-hole scoring without score-position shifts.
- Certified matching Review Hub submission and mismatch blocking.
- Certified authoritative player identity hydration for individual and team leaderboards.
- Certified feasible counting-score normalization for three-player teams without changing four-player or larger-team behavior.
- Certified readiness and snapshot convergence into finalization eligibility.
- Certified the authenticated, version-guarded Supabase finalization mutation, duplicate-finalize rejection, and durable desktop/mobile read-only state.
- Final automated regression: production build passed and Playwright passed 47/47.

### Completed Milestone: Secure QR And Share-Token Verification

Status: complete.

- Isolated temporary Supabase clients from `clubhouse-hq-coach-auth`.
- Bounded QR/share-token loading so "Preparing" resolves.
- Verified real Supabase tournament creation, player synchronization, and share-token reads.
- Verified the mobile scorecard from a clean signed-out browser context.

### Post-MVST Follow-up: Resolve remaining anonymous GoTrueClient warnings.

- Consolidate anonymous share-token clients so the default Supabase storage-key warnings no longer occur.

### Milestone 1: Shared Tournament Read Model

Goal: make a phone with no localStorage understand whether a shared tournament has already started.

- Add a service-level shared Tournament Aggregate loader.
- Hydrate teams, players, pairings, scorecard rows, round setup, and scorecard generation state from Supabase rows where possible.
- Keep localStorage as the first local recovery source.
- Do not change scoring rules.
- Add focused tests for shared dashboard/detail hydration with empty localStorage.

### Milestone 2: Shared QR Readiness

Goal: prevent QR links from appearing ready before shared scorecard data can resolve.

- Track whether `syncTournamentPlayers` has succeeded for the shared tournament UUID.
- Keep existing browser/local scorecard links.
- Keep existing QR URL format unless a deliberate migration is approved.
- Add a visible pending/failed shared sync state for tournament directors.
- Add a phone QR test where tournament row exists but player rows are missing.

### Milestone 3: Tournament Aggregate Helpers

Goal: reduce duplicated hydration and identity logic without a rewrite.

- Introduce small domain helpers for player identity, pairing hydration, scorecard row derivation, and aggregate completeness checks.
- Move logic only when covered by the existing behavior.
- Avoid broad component restructuring.

### Milestone 4: Review Hub Foundation

Goal: centralize review data without changing scoring behavior.

- Create a read model for self vs. marker comparison.
- Preserve marker-entered scores as live leaderboard source.
- Add review status fields only after schema need is explicit.
- Keep mobile score entry behavior unchanged.

### Milestone 5: Hole Stats Schema Planning

Goal: prepare future default-on stat tracking per tournament.

- Model fairway hit, green in regulation, and putts 1-6 as fields tied to each hole score.
- Decide whether stats live in `score_entries.hole_scores` JSON or a separate normalized table.
- Do not expose stat UI until score stability is protected.

### Stabilization Guardrails

- No big rewrite.
- No localStorage removal.
- No scoring rule changes.
- No QR resolver breakage.
- No marker-only leaderboard regression.
- No silent overwrite of populated localStorage with empty shared state.

## Current Stable Foundation

### Core Features (✓ Implemented)
- **Tournament Creation & Management**: Set up tournaments with teams, players, rounds, and pairings
- **Scorecard Generation**: Auto-generate scorecards from pairing data
- **Mobile Score Entry**: QR code-based mobile scorecard for real-time score submission
- **Rotating Marker Assignments**: Built-in group scoring workflow prevents direct reciprocal marking
- **Live Leaderboard**: Real-time tournament standings based on marker-verified scores
- **Score Persistence**: localStorage-based tournament state with versioned schema
- **Type Safety**: Full TypeScript support for data models and storage

### Scoring Architecture
- **Dual Score Tracking**: Each player's round preserves both self-entered and marker-entered scores
- **Score Source Tracking**: `enteredBy: "self" | "marker"` field distinguishes score origin
- **Marker-Driven Leaderboard**: Live leaderboard displays only `enteredBy: "marker"` scores
- **Self Scores for Verification**: Self-entered scores stored for end-of-round discrepancy checking

### Mobile Scorecard
- **Group-Based Entry**: One scorecard per player per group covers the full round
- **Self + Marker Dual Input**: Player enters their own score, then marker score for next player
- **Progressive Save**: Scores saved per-hole, not all-or-nothing
- **Rotating Group Assignments**: Player N marks Player N+1 (cyclically)

---

## Near-Term Build Priorities

### 1. End-of-Round Submission & Verification
**Goal**: Formalize the submission handoff and prevent score disputes

**Required Changes**:
- [ ] Add "Submit Round" button that displays before final submission
- [ ] Show side-by-side comparison of self vs. marker scores
- [ ] Highlight discrepancies (delta > threshold, e.g., 2+ strokes)
- [ ] **Block submission** if discrepancy exists (coach must resolve)
- [ ] Add "Resolve Discrepancy" workflow:
  - Coach views both scores and player comments
  - Coach selects which score is correct
  - Coach adds note (e.g., "rules correction", "verified by witnesses")
  - Score locked after resolution
- [ ] Mark scorecard as "submitted" vs. "verified by coach"

**Storage Impact**: Extend Score type with `resolvedBy`, `resolution`, `resolution_timestamp`

**UI Impact**: No changes to mobile scorecard UI or tournament page live view

---

### 2. Manual Code Entry as Alternative to QR
**Goal**: Support offline and backup entry methods

**Required Changes**:
- [ ] Display **group codes** alongside QR codes on tournament director page (e.g., "GROUP-1A")
- [ ] Add manual code input form to mobile scorecard entry flow
- [ ] Validate group code format and map to correct group
- [ ] Support both QR scan AND typed code in same interface

**Storage Impact**: None; existing URL structure can accommodate code parameter

**UI Impact**: Add input field to mobile scorecard header; no other changes

---

### 3. Coach Dashboard & Group Score Review
**Goal**: Give coaches real-time visibility into ongoing groups

**Required Changes**:
- [ ] New page: `/dashboard/[tournamentId]/live-scores`
- [ ] Live group cards showing:
  - Group number and tee time
  - Current hole for each player
  - Self vs. marker score comparison (red if discrepancy)
  - "Needs Review" badge if discrepancy exists
- [ ] Tap group card → see full scorecard and resolution UI
- [ ] One-click override: Coach can enter score directly if group gets stuck

**Storage Impact**: None; read-only from existing tournament.scores

**UI Impact**: Add new coach dashboard page; no changes to tournament or scorecard pages

---

### 4. Beta Tournament Requirements: Team Leaderboard & Individual Players
**Goal**: Launch beta tournaments with proper team scoring and support for individual competitors

**Required Changes - Team Leaderboard:**
- [ ] Tournament page displays team leaderboard as primary view (not individual leaderboard)
- [ ] Teams ranked best to worst by team score (live)
- [ ] Players within each team ranked best to worst (live)
- [ ] Top 4 player scores count toward team total (configurable per tournament)
- [ ] Visual divider line between 4th (counting) and 5th (not counting) player
- [ ] Label counting players as "COUNTING" and non-counting as "NOT COUNTING"
- [ ] Dynamic status updates: as scores change, players swap positions across divider if needed
- [ ] Team score recalculates automatically as marker scores update

**Required Changes - Individual Players:**
- [ ] Tournament setup: support "Individual" player designation
- [ ] Individual players do not count toward any team score
- [ ] Individual players appear on separate "Individual Leaderboard"
- [ ] Individual players display "(IND)" next to name on all leaderboard views
- [ ] Individual players support full feature set: pairings, QR codes, markers, scoring, verification, stats
- [ ] Tournament director can mix team and individual players in same tournament

**Storage Impact**: Extend Player type with `isIndividual: boolean` flag

**UI Impact**: 
- Tournament page: two leaderboard tabs (Team / Individual) with separate sorting
- Dashboard: display team leaderboard by default
- Scorecard: no changes required (markers work with any player type)

**Testing Scope**: Test with 3-5 player teams, 4-player teams, and mixed tournaments

---

## Scoring Workflow

### Mobile Scorecard Flow (Self + Marker Mode)
```
Player Opens QR
  ↓
App identifies Player + Group
  ↓
Player enters Hole 1 self score → Save (enteredBy: "self")
  ↓
Marker's input appears
  ↓
Marker (next player) enters Player's score → Save (enteredBy: "marker")
  ↓
Auto-advance to Hole 2, repeat
  ↓
Player completes all 18 holes
  ↓
Review screen: Side-by-side self vs. marker scores
  ↓
Disrepancy check: If any hole delta > 2, BLOCK submission
  ↓
Submit Round button
  ↓
Coach/TD reviews discrepancies and resolves
```

### Live Leaderboard Filter
```
tournament.scores = [
  { playerId: "Tom", roundId: "round-1", holeScores: [...], enteredBy: "self" },
  { playerId: "Tom", roundId: "round-1", holeScores: [...], enteredBy: "marker" },
  ...
]

Live Leaderboard = Filter to enteredBy: "marker" only
Self scores = Reserved for verification & discrepancy checking
```

### Marker Assignment Rules
- **Standard Group (4 players)**: Player 1→2, Player 2→3, Player 3→4, Player 4→1
- **3-Player Group**: Player 1→2, Player 2→3, Player 3→1
- **2-Player Group**: Player 1→2, Player 2→1 (direct swap acceptable for pairs)
- **1-Player Group**: Player marks themselves (unusual but supported)
- **No reciprocal marking** in groups > 2 (prevents Bob marking Sarah and Sarah marking Bob directly)

---

## Tournament Engine: Leaderboard Display & Player Rules

### Team Leaderboard (Primary Format)

**Sorting & Display:**
- Team leaderboard is the primary leaderboard view for team tournaments
- Teams ranked best to worst by team score (live, continuously updated)
- Players within each team ranked best to worst by individual score (live)

**Scoring Rule:**
- Top 4 player scores count toward team total by default
- Configurable per tournament if coaches need different formats (e.g., top 5, all scores)
- Visual divider (bold/solid line) clearly separates counting vs. non-counting players

**Visual Display:**
- Keep team player display simple: name and score only
- Players sorted best to worst; divider alone indicates counting-score cutoff
- No large labels like "COUNTING" or "NOT COUNTING" required

**Dynamic Counting Status:**
- Status updates automatically as live scores change during round
- If a player above the line scores worse than a player below, positions swap and divider moves

**Example:**
```
STATE UNIVERSITY        312

Alice Johnson      78
Bob Chen           79
Carol Smith        80
David Lee          81
═══════════════════════════ ← Visual Divider
Emma Davis         82
Fiona Green        85
```

### Individual Players

**Tournament Setup:**
- Players can be marked as "Individual" during tournament import
- Individual players do not belong to any team
- Individual players appear on separate "Individual Leaderboard"

**Leaderboard Display:**
- Individual players sorted by score (live) on individual leaderboard
- Individual players appear with **(IND)** designation next to their name
- Individual players do not count toward any team score

**Full Feature Support:**
Individual players retain complete access to all scoring features:
- [ ] Group pairings and rotations
- [ ] QR codes and manual group codes
- [ ] Marker assignments and verification
- [ ] Live scoring and self + marker entry
- [ ] Score verification and discrepancy resolution
- [ ] End-of-round reporting and stats
- [ ] Historical performance tracking

**Use Cases:**
- Coaches competing in tournament (often individual)
- Invited guest players
- Alumni or representative players
- Individuals in otherwise team format

---

## Tournament Director Dashboard & Coach Alerts

### Tournament Director Dashboard

**Purpose:** Real-time tournament health monitoring with quick access to group status, score tracking, and discrepancy resolution.

**Core Displays:**
- **Tournament Health Summary**: Total players/groups, recent score entry rate, unfinished/unsubmitted rounds, unresolved discrepancies
- **Group Status Tracking**: Current hole for each group, players with stalled score entry (>15min with no entry), entry status per player
- **Discrepancy Management**: Flagged discrepancies with quick-access resolution UI, penalty/withdrawal/DQ history, coach override log
- **System Health**: Last leaderboard update timestamp, data sync status, storage health

**Future Enhancements:**
- Pace-of-play warnings (groups behind pace)
- Weather alerts and course condition updates
- Real-time group location tracking

**UI Implementation:**
- Tournament page gains new "Dashboard" tab (alongside "Live Leaderboard" tab)
- Dashboard displays status cards for each group
- Tap group card → full scorecard view + one-click resolution UI

### Coach Alerts

**Purpose:** Deliver contextual, team-specific alerts to coaches for pressing issues that require immediate attention.

**Alert Strategy:**
- **Scope:** Team-specific; coaches only see alerts affecting their players
- **Priority:** High (unresolved discrepancy, withdrawal, stalled entry) > Medium (unsubmitted round) > Low (recent entry)
- **Delivery:** In-app notifications during tournament; push notifications planned for future
- **Dismissible:** Coaches can dismiss low-priority alerts; critical alerts persist

**Alert Types & Examples:**

| Trigger | Message | Priority |
|---------|---------|----------|
| No score entry in 20+ min | "Sarah Chen — no score entry for 22min" | HIGH |
| Unresolved discrepancy > 2 strokes | "Alice Johnson — 3-stroke discrepancy on Hole 7 (self: 4, marker: 1)" | HIGH |
| Round complete, unsubmitted | "Tom's scorecard complete but not submitted" | MEDIUM |
| Penalty/Withdrawal/DQ | "Bob marked as withdrawn (injury)" | HIGH |
| Coach override logged | "Coach entered score for Emma on Hole 5 (mobile unavailable)" | MEDIUM |
| Group pace behind schedule | "Group 3 is 1.5 holes behind pace (Hole 10, target Hole 11.5)" | MEDIUM |

**Alert Suppression:**
- Coaches can mute low-priority alerts for specific players during round
- Critical alerts (discrepancy, withdrawal, DQ) cannot be suppressed
- Alerts auto-resume after round completes

---

### Current Scope
- Create and edit tournament structure (teams, players, pairings, rounds)
- Generate scorecards and QR codes
- View live leaderboard
- Tournament director dashboard for group monitoring

### Near-Term Scope
- Coach alerts for team player issues
- Discrepancy resolution UI
- Manual score entry override (for groups stuck/unable to use mobile)
- Quick stats (strokes gained/lost vs. par, avg by hole, etc.)
- Pace-of-play tracking and warnings

### Future Scope
- Team vs. team comparisons
- Historical tournament trends
- Export scorecards (PDF, Excel, Scorecard.com integration)
- Photo verification of scores
- Draft lineups based on analytics
- **Schedule Optimizer** (AI-powered team scheduling: practice windows, tee times, availability conflict flagging)

---

## Schedule Optimizer — Coach Time-Saving Workflow

**Strategic Importance**: High-value future differentiator that solves one of golf coaching's most time-consuming problems: scheduling around player availability.

**Coach Problem**:
Managing 15+ players with different class schedules, work commitments, and personal obligations is logistically complex. Coaches typically spend 2–4 hours per week manually finding practice times, resolving conflicts, and often default to "one-size-fits-all" schedules that exclude committed players. This reduces participation and team cohesion.

### Capabilities

**Schedule Input & Data Collection**
- Players enter class schedule (recurring weekly blocks)
- Players enter work schedule (shifts, job locations, estimated commute)
- Coaches upload institutional calendars, class rosters (PDF), or team commitment calendars
- AI extracts availability windows from uploaded documents (reduces manual entry)
- Custom availability notes (known conflicts, travel dates, exemptions)
- Integration with calendar systems (future: Google Calendar, Outlook sync)

**Practice Time Optimization**
- **Full-Team Windows**: Algorithm identifies slots when all (or N%) of players are available; recommends best recurring time
- **Small-Group Practice Scheduling**: Suggests ideal times for skill-work groups (e.g., short-game specialists, distance throwers) without conflicts
- **Coverage Analysis**: Shows which practices achieve 90%+ attendance vs. partial participation
- **Coach Deployment**: Optimizes coaching time across multiple simultaneous groups

**Tournament & Qualifying Scheduling**
- **Tee Time Recommendations**: Suggests qualifying/tournament tee times compatible with player availability
- **Conflict Detection**: Red flags players unavailable for scheduled tournament dates
- **Backup Player Suggestions**: Auto-recommends alternates if starters have conflicts
- **Hole Completion Estimates**: Given course difficulty and available time, predicts hole completion (helps decide 9-hole vs. 18-hole format)

**Conflict Resolution & Alerts**
- **Unavailability Patterns**:
  - Red flag: Player unavailable 3+ consecutive weeks (early warning for retention/engagement issues)
  - Yellow flag: Player conflicts with 2+ key practices (discuss alternatives or exemptions)
  - Green flag: Committed players highlighted for team recognition
- **What-If Scenarios**: Coaches test "What if we move practice to Friday 3pm?" or "Drop Player X from Tuesday qualifiers?" to see impact
- **Player Communication**: Auto-generates calendar invites, sends notifications for schedule changes, enables "request exemption" workflow

**Reporting**
- **Weekly Coach Report**: Team availability summary, recommended practice times, conflict resolution suggestions
- **Player Roster View**: Color-coded availability matrix (who's free when)
- **Tournament Planning Dashboard**: Upcoming events, conflicts, and recommended tee times

### Why This Matters

- **Time Savings**: Reduces scheduling from 2–4 hours/week to 15 minutes; coaches reclaim time for coaching
- **Equity**: All committed players get fair practice/tournament opportunities; no one left behind due to scheduling
- **Early Intervention**: Flags players with chronic conflicts for one-on-one conversations
- **Team Cohesion**: Full-team practices when possible strengthen culture; small-group work develops skills
- **Competitive Edge**: Data-driven scheduling removes guesswork; coaches focus on execution, not logistics
- **Retention**: Players appreciate transparency and fair scheduling; reduces frustration from last-minute conflicts

### Timeline
Post-launch feature. Requires core tournament module to be stable and widely adopted. Best implemented after competitive intelligence module.

---

### Player Performance Tracking
- **Strokes Gained/Lost**: By hole, by round, by course
- **Consistency**: Standard deviation of scores, variance by course type
- **Par Performance**: Birdies, pars, bogeys, double+ frequency
- **Trend Analysis**: Performance over season, by weather/condition, by opponent
- **Course Fit**: Which courses suit player's game (short par 3 specialist, etc.)

### Team Intelligence
- **Lineup Optimization**: Recommend pairings based on historical chemistry
- **Course Strength**: Which teams excel at different courses
- **Bench vs. Starter Performance**: Develop rotation insights
- **Team Trends**: Momentum, form, confidence over season

### Tournament-Level Insights
- **Competitive Benchmarks**: How teams compare across seasons
- **Leaderboard Patterns**: Identify tight races vs. blowouts
- **Scoring Environment**: Round-to-round difficulty, course conditions impact
- **Round Comparison**: Front 9 vs. Back 9, scoring spreads

### Player Development
- **Skill Gaps**: Identify weak holes or conditions
- **Practice Focus**: Data-driven recommendations
- **Long-term Arc**: Improvement trajectory, potential ceiling estimation
- **Peer Comparison**: How player ranks within team and conference

---

## Recruiting / Coach Operating System Ideas

### Why Coaches Need This
Golf coaches track hundreds of data points across:
- Team roster (current + prospective)
- Tournament performance (historical)
- Practice metrics (if available)
- Recruiting interest + communications
- Player grades, academics, fit

### Future Integration Points
- **Player Profiles**: Add academic standing, recruiting profile, contact methods
- **Communication Log**: Email/text history tied to player for recruiting purposes
- **Prospect Tracking**: Non-roster players' tournament results (e.g., juniors competing)
- **Team Recruiting Calendar**: Key dates, tournaments, showcases
- **Comparative Scouting**: Import competitor team rosters and track their scores
- **Alumni Network**: Track where alums are, how they developed

### Long-Term Vision
Clubhouse HQ becomes the **coach's OS** for:
- Tournament management (current)
- Player analytics and development (planned)
- Recruiting pipeline (future)
- Team communication hub (future)

---

## Parking Lot

### Decisions Deferred
- **Scoring Modes**: Only "Self + Marker" supported initially; "Coach Entry", "Spectator Entry", "One-Player Solo" deferred
- **Final Submission Lockdown**: Rules (e.g., 10min window to review, auto-lock) deferred; manual coach approval only for now
- **Export Formats**: PDF, Excel, Scorecard.com sync deferred; focus on app-first UX first
- **Mobile Notifications**: Push alerts to coaches during rounds deferred; coaches monitor dashboard manually
- **Photo Verification**: Score photo evidence deferred; trust marker system initially
- **Rules Enforcement**: Penalty stroke handling, DQ logic deferred
- **Handicap Integration**: GHIN, handicap calculations deferred; raw scores only for now

### Questions for Coaches
- How fast do coaches need to resolve discrepancies? (real-time vs. end-of-day?)
- Should self scores be visible to leaderboard until marker scores are in?
- What's the acceptable threshold for discrepancy before auto-blocking? (1 stroke, 2 strokes, 3+?)
- Should coaches see draft scores (holes in progress) or only completed scores?
- Do you need practice round vs. tournament round distinction?

---

## Technical Notes

### Storage Architecture
- **Versioned Envelope**: `{ version: 2, tournament: {...}, uiState: {...} }` in localStorage
- **Supabase Direction**: Supabase is the future durable source of truth for shared tournament state and scores.
- **localStorage Direction**: localStorage remains a cache, offline fallback, and recovery path.
- **Tournament Aggregate Direction**: both localStorage and Supabase should hydrate the same aggregate shape before UI state decisions are made.
- **Score Structure**: 
  ```typescript
  Score = {
    playerId: string,
    roundId: string,
    holeScores: number[],
    total: number,
    status: "pending" | "live" | "complete",
    enteredBy: "self" | "marker",
    resolvedBy?: string,        // future: coach ID
    resolution?: "accepted" | "overridden",  // future
    resolutionNote?: string,    // future
  }
  ```
- **Backend Status**: Supabase is now part of the shared scoring architecture. Avoid treating the app as local-only.

### Build & Deploy
- Next.js 16+ (App Router)
- TypeScript strict mode
- TailwindCSS for styling
- QR code generation via qrcode library
- Deployed as static site or serverless function

---

**Last Updated**: 2026-06-28  
**Maintainer**: Clubhouse HQ Team
