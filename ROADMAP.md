# Clubhouse HQ Roadmap

A lightweight tournament management and live scoring platform for golf coaches and tournament directors.

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

## Tournament Director / Coach Tools

### Current Scope
- Create and edit tournament structure (teams, players, pairings, rounds)
- Generate scorecards and QR codes
- View live leaderboard

### Near-Term Scope
- Live group monitoring dashboard
- Discrepancy resolution UI
- Manual score entry override (for groups stuck/unable to use mobile)
- Quick stats (strokes gained/lost vs. par, avg by hole, etc.)

### Future Scope
- Team vs. team comparisons
- Historical tournament trends
- Export scorecards (PDF, Excel, Scorecard.com integration)
- Photo verification of scores
- Draft lineups based on analytics

---

## Future Analytics & Stats

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
- **No Backend Required**: All state in-app; export to file for backup

### Build & Deploy
- Next.js 16+ (App Router)
- TypeScript strict mode
- TailwindCSS for styling
- QR code generation via qrcode library
- Deployed as static site or serverless function

---

**Last Updated**: 2026-06-28  
**Maintainer**: Clubhouse HQ Team
