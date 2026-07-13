# Clubhouse HQ Decisions

Last updated: 2026-07-07

## Active Decisions

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
