# Clubhouse HQ Production Monitoring And Incident Response Runbook

Last updated: 2026-07-31

## Purpose And Current Boundary

This runbook defines the monitoring, alerting, incident response, tournament-day triage, communication, and rehearsal required before Clubhouse HQ opens a controlled beta. It is vendor-neutral and does not claim that centralized telemetry, synthetic checks, paging, or a production health endpoint currently exists.

The application currently exposes browser/server console diagnostics and user-visible errors, while Supabase and the application hosting provider may expose their own operational views. Before beta, operators must select and configure monitoring that can collect the signals in this document, associate them with a deployed release, and notify the assigned responders.

Monitoring must never record raw scoring codes, share tokens, access tokens, passwords, Supabase keys, authorization headers, database credentials, or complete player-sensitive payloads.

## Monitoring Roles

Assign a named primary and backup for each role before beta. One person may fill multiple roles in a small beta, but every incident must have one Incident Commander.

| Role | Responsibility |
| --- | --- |
| Monitoring Owner | Maintains dashboards, alerts, synthetic checks, retention, and alert routing. |
| Incident Commander | Declares severity, coordinates response, owns the timeline, and approves service resumption. |
| Application Responder | Investigates hosting, browser, API, release, and application failures. |
| Database Responder | Investigates Supabase health, query failures, RLS/auth interactions, migrations, and recovery. |
| Tournament Operations Lead | Coordinates coaches, scoring contingencies, event pause/resume, and authoritative verification. |
| Security Lead | Owns credential, authorization, isolation, abuse, and suspected data-exposure incidents. |
| Communications Lead | Sends operator, coach, and player-safe updates on the required cadence. |

The Incident Commander may invoke `BACKUP_RECOVERY.md`. The Rollback Authority defined in `RELEASE_ROLLBACK.md` remains the only role that authorizes application rollback during an incident.

## Severity Model

### P1 — Critical

Active or imminent data corruption/loss, cross-owner or cross-player exposure, incorrect official results/finalization, widespread live-tournament scoring failure, security compromise, or production-wide outage.

- Acknowledge: **5 minutes**
- Incident Commander assigned: **5 minutes**
- First mitigation decision: **15 minutes**
- Update cadence: **every 15 minutes**
- Escalation: immediate Release Owner, Database Responder, Security Lead when relevant, and affected Tournament Operations Lead

### P2 — High

Major workflow unavailable or degraded for multiple users, elevated score-save/API failures, authentication outage with player scoring still partially available, live leaderboard materially stale, or one active event unable to proceed safely.

- Acknowledge: **15 minutes**
- Incident Commander assigned: **15 minutes**
- First mitigation decision: **30 minutes**
- Update cadence: **every 30 minutes**
- Escalation: Monitoring Owner to application/database responder and Tournament Operations Lead

### P3 — Medium

Limited workflow degradation, browser-specific issue with a safe workaround, isolated coach/account issue, non-authoritative presentation error, or recurring warning without data loss.

- Acknowledge: **4 business hours**, or **30 minutes during an active affected tournament**
- Update cadence: at material change and daily until resolved
- Escalation: owning responder; Incident Commander optional unless scope grows

### P4 — Low

Minor UX issue, documentation/support request, low-impact noise, or improvement that does not threaten tournament operation or data authority.

- Acknowledge: **2 business days**
- Update cadence: normal backlog communication
- Escalation: product/operations owner

Severity is based on current impact and credible worst case, not the number of reports. A single wrong-player score exposure or incorrect official finalization is P1.

## Monitoring Strategy

### Application health

Monitor:

- public route availability and HTTPS success,
- server-side 5xx rate and latency,
- client-side unhandled exceptions and failed route rendering,
- running release/commit identifier,
- deployment start, completion, rollback, and post-release error-rate changes,
- availability of the homepage, coach authentication, dashboard, scorecard, leaderboard, and finalized read-only views.

The current application does not provide a dedicated health endpoint. Until one is deliberately implemented, synthetic monitoring should exercise safe existing read-only routes and must not treat a static homepage response as proof that Supabase-backed workflows are healthy.

### API health

Track request count, status, and latency by route family without logging request secrets or bodies:

- `/api/score-mutations`,
- `/api/mobile-dynamic-statistics`,
- `/api/share-tokens/resolve`,
- `/api/player-scoring-code/resolve`,
- `/api/team-tournament-login/resolve`,
- Tournament and Qualifying mutation/access/result routes,
- authenticated analytics reads.

Separate expected 4xx responses from failures. Invalid-code and expired-token responses are expected at low volume; spikes may indicate abuse or a broken client. Any 5xx from score persistence, official resolution, readiness, or finalization requires immediate classification.

### Database health

Use available Supabase operational views and approved query telemetry to monitor:

- project availability and incident status,
- database connections and saturation,
- query error and timeout rate,
- slow queries affecting active scoring/read models,
- storage growth and backup status,
- authentication/database connectivity,
- RLS or authorization rejection anomalies,
- migration-ledger changes outside an approved release,
- rate-limit ledger growth and token inventory growth where safely observable by operators.

Do not expose table inventories, policies, or private-schema records through public endpoints for monitoring.

### Authentication health

Monitor aggregate, redacted outcomes for:

- coach sign-in/sign-up success and failure,
- session refresh failures,
- unexpected sign-outs,
- 401/403 rates on authenticated APIs,
- redirect failures,
- Supabase Auth availability,
- repeated failures isolated to one browser versus all coaches.

Never log emails with passwords, session tokens, authorization headers, or persisted auth storage contents.

### Score submission health

Score saving is a protected workflow. Monitor:

- `/api/score-mutations` success, 4xx, 5xx, and latency,
- score, hole-statistic, Dynamic Statistics, Review, and official-resolution mutation failures,
- client save errors and offline/reconnect outcomes,
- duplicate-key/uniqueness errors,
- adjacent-hole or identity mismatch reports,
- time from Save Hole action to acknowledged completion,
- retry volume without logging score payloads,
- finalization-write rejection as expected read-only behavior versus unexpected pre-finalization rejection.

Monitoring must not infer score correctness solely from HTTP 2xx. Tournament-day verification uses durable row identities and the existing readiness/Review projections when an incident is suspected.

### Live scoring health

Monitor:

- successful authoritative leaderboard refreshes,
- age of the newest score update shown to operators,
- polling/read failures,
- individual/team total calculation exceptions,
- official-score projection failures,
- tie-ranking presentation anomalies,
- Review Queue and readiness convergence delays,
- Tournament and Qualifying finalization status mismatch.

The application currently has no centralized live-scoring freshness metric. A future telemetry implementation must measure read success and update age without persisting duplicate standings or changing leaderboard authority.

### Release health

For every release, compare the observation window with the preceding stable window:

- 5xx and client exception rate,
- p50/p95 API latency where available,
- authentication failure rate,
- score-save failure rate,
- synthetic-check success,
- Supabase errors,
- support reports,
- deployed commit and migration ledger.

Use the release record and rollback criteria in `RELEASE_ROLLBACK.md`. Monitoring does not authorize a release or rollback by itself.

## Minimum Alert Matrix

Thresholds below are initial beta defaults. The Monitoring Owner must tune them using observed traffic while preserving the severity intent.

| Alert condition | Severity | Primary owner | Response target | Escalation path |
| --- | --- | --- | --- | --- |
| Cross-owner/player data exposure or suspected credential/token leak | P1 | Security Lead | 5 min | Incident Commander → Release Owner → Database Responder → affected coaches |
| Confirmed score loss, corruption, duplicate authoritative identity, or wrong-player write | P1 | Database Responder | 5 min | Incident Commander → Tournament Operations → backup/recovery decision |
| Incorrect official projection, readiness, or finalization affecting published results | P1 | Application Responder | 5 min | Incident Commander → Database Responder → Release/Rollback Authority |
| Production unavailable during active tournament | P1 | Monitoring Owner | 5 min | Incident Commander → hosting/Supabase status → Communications Lead |
| Score-mutation 5xx for 2 consecutive requests or >2% over 5 minutes during active play | P2; P1 if field-wide | Application Responder | 15 min | Incident Commander → Database Responder → Tournament Operations |
| Score-save p95 exceeds 5 seconds for 5 minutes during active play | P2 | Application Responder | 15 min | Database Responder if query/API latency agrees |
| Supabase production outage/degraded incident | P2; P1 if writes unsafe | Database Responder | 15 min | Incident Commander → Tournament Operations → Supabase support/status |
| Coach authentication failures exceed 20% over 10 minutes | P2 | Application Responder | 15 min | Database Responder/Auth status → Communications Lead |
| Universal code, Team Login, or QR/share resolution 5xx exceeds 2% over 5 minutes | P2 | Application Responder | 15 min | Security Lead if abuse suspected; Tournament Operations for alternate access |
| Live leaderboard has no successful refresh for 2 polling intervals during active play | P2 | Application Responder | 15 min | Database Responder → Tournament Operations |
| Tournament/Qualifying finalization state differs after expected convergence | P1 | Database Responder | 5 min | Incident Commander → stop mutations → recovery/rollback assessment |
| Elevated 401/403 without release or auth incident | P3 | Application Responder | 4 business hours / 30 min active | Security Lead if isolation concern |
| Browser-specific scoring failure with another supported browser workaround | P3 | Application Responder | 30 min active | Tournament Operations communicates workaround |
| Release error rate materially exceeds prior baseline | P2 | Monitoring Owner | 15 min | Rollback Authority under release runbook |
| Backup/recovery point misses required cadence | P1 before/during event | Database Responder | 5 min | Release Owner → do not start/continue event without disposition |
| Monitoring pipeline or paging unavailable during active event | P2 | Monitoring Owner | 15 min | Incident Commander establishes manual monitoring cadence |

An alert should group repeated symptoms into one incident and must not page separately for every player retry.

## Incident Declaration

Any responder may request an incident. The Incident Commander declares it when one of these is true:

- a P1/P2 alert fires and is credible,
- a coach reports lost/wrong/cross-player data,
- an active event cannot continue safely,
- production health cannot be determined,
- a release produces unexplained protected-workflow failures,
- Supabase or hosting reports a relevant outage,
- incident scope is increasing faster than normal support can contain it.

Open one incident record with:

- incident ID and severity,
- UTC start/detection times,
- Incident Commander and responders,
- affected environment, release commit, and migration ledger,
- Tournament/Qualifying UUIDs and player/round/hole identities where relevant,
- symptoms, alerts, and reporter,
- last known correct time,
- current mutation/finalization guidance,
- next update time.

Do not place secrets, raw codes/tokens, passwords, or authorization headers in the incident record.

## Investigation Workflow

1. **Protect authority.** Ask affected users to stop the relevant mutation, Review, access rotation, or finalization action. Do not tell them to recreate events or rows.
2. **Confirm scope.** One user, browser, team, tournament, all events, one API, Supabase, hosting, or release-wide.
3. **Confirm release state.** Record deployed commit, deployment time, environment variables by identity, and migration ledger.
4. **Correlate time.** Compare user timestamps, alerts, API status, Supabase status, browser console, network failures, and recent releases.
5. **Classify authority.** Determine whether the issue is presentation/cache, network/synchronization, authorization, durable data, Review/official projection, or finalization.
6. **Preserve evidence.** Capture redacted logs, screenshots, trace/request timing, row counts and stable identities, snapshot version/hash, and current damaged state when recovery may be needed.
7. **Choose mitigation.** Workaround, event pause, application rollback, database forward fix, backup recovery, provider escalation, or monitor.
8. **Verify mitigation.** Use authoritative reloads and the appropriate checklist below.
9. **Communicate.** Update on the severity cadence even when there is no material change.

Never clear browser storage, rotate codes, regenerate scorecards, overwrite snapshots, edit finalized rows, or run ad hoc database changes merely to test a theory.

## Mitigation And Recovery Verification

Use the smallest safe existing capability:

- browser-specific problem: preserve evidence and move the affected user to a verified supported device/browser without clearing the original device,
- transient network problem: retain current page/cache, stop rapid retries, reconnect, and verify authoritative persistence before continuing,
- bad application release: follow application rollback in `RELEASE_ROLLBACK.md`,
- defective deployed migration: use the forward-fix policy,
- deleted/corrupt durable data: follow `BACKUP_RECOVERY.md`,
- Review disagreement: use the normal Director official-resolution workflow,
- finalized event: retain read-only enforcement; do not bypass triggers,
- provider outage: pause unsafe workflows and follow provider status/support while maintaining manual communications.

Before resuming play, verify as applicable:

- correct Tournament/Qualifying and player identities,
- self and marker rows remain isolated,
- saved hole and statistic values persist after authoritative refresh,
- no duplicate score/hole rows,
- universal code and QR/share participant isolation,
- leaderboard totals and competition rankings,
- original/official audit history,
- Review, submission, discrepancy, and readiness counts,
- Tournament/Qualifying finalization synchronization,
- finalized read-only enforcement,
- no continuing 5xx, console, auth, database, or monitoring errors.

## Communication Plan

### Internal operator update

Include incident ID, severity, affected workflow/events, current release, mutation guidance, mitigation owner, next decision, and next update time.

### Coach update

State what players/coaches should do now, what remains safe, whether scoring is paused, whether paper/manual contingency is required, and when the next update will arrive. Do not speculate about data loss before verification.

### Player update

Use short operational instructions only: remain on the page, stop retrying, keep the scorecard open, switch to an approved alternate access method/device, or record scores on the tournament's manual contingency sheet. Never expose internal architecture or security details.

### Resolution update

State service status, verified data impact, any values requiring coach confirmation, whether play may resume, and the support contact. If data loss occurred, state the confirmed recovery point and affected interval.

## Tournament-Day Incident Guide

### Score save failures

1. Tell the player to keep the scorecard open and stop repeated Save attempts.
2. Record player, marker, tournament, round, hole, UTC time, device/browser, visible error, and network status.
3. Check whether the failure affects score, statistics, or both and whether another group is affected.
4. Inspect redacted `/api/score-mutations` and Dynamic Statistics outcomes plus Supabase health.
5. Reconnect once and verify the authoritative row before further entry. Do not infer persistence from local UI alone.
6. If unresolved, use the event's paper/manual contingency and pause Review/finalization for that player.
7. Escalate duplicate/wrong-player/lost authoritative rows as P1; repeated 5xx as P2/P1 by scope.

### QR/share or scoring-code failures

1. Determine whether QR, universal code, Team Login, Qualifying code, or all public resolution paths fail.
2. Verify event status, participant isolation, token/code state, and API status without recording the raw credential.
3. Use an already-approved alternate existing access path only when it resolves the same certified scorecard authority.
4. Do not create compatibility rows, expose participant inventory, or repeatedly rotate codes.
5. Escalate cross-event leakage as P1 and field-wide access loss as P2/P1.

### Coach authentication failures

1. Determine whether player share-token scoring remains functional.
2. Check Supabase Auth status, 401/403 rate, redirect origin, session refresh, and recent environment/release changes.
3. Preserve the failing browser session; do not request passwords or tokens.
4. Pause Director resolution, code management, and finalization until an authenticated owner can verify authority.
5. Field-wide authentication loss is P2; any cross-owner access is P1.

### Supabase outage or degradation

1. Declare P2 or P1 based on write safety and active-event scope.
2. Confirm provider status and project-specific symptoms.
3. Ask users to keep pages open and stop repeated mutations.
4. Use existing offline/cache behavior only as currently supported; do not promise that cached state is durable authority.
5. Move to the tournament's paper/manual contingency if persistence cannot be verified.
6. Do not finalize, resolve discrepancies, rotate access, or perform recovery writes during uncertain authority.
7. After restoration, verify durable rows, snapshots, Review/readiness, and access before resuming.

### Degraded performance

1. Compare application route, API, database, and network latency.
2. Determine whether the delay affects reads, writes, one browser, or all users.
3. Stop rapid retries and nonessential operations such as repeated regeneration/export.
4. Prioritize score-save integrity over leaderboard freshness.
5. Escalate score-save p95 above the alert threshold as P2 during active play.

### Browser-specific issue

1. Record browser, version, operating system, device, orientation, viewport, and network.
2. Preserve console/network evidence and the original browser storage.
3. Verify whether the same authorized scorecard works in a supported alternate browser/device.
4. Communicate the temporary workaround without clearing the original data.
5. Escalate if the issue affects identity, persistence, or a significant share of the field.

### Coach-reported issue

1. Acknowledge and obtain event UUID/name, player, round/hole, UTC time, action, expected/actual result, screenshot, browser/device, and whether retry occurred.
2. Never request passwords, raw codes, share links, or tokens in a ticket.
3. Check monitoring before asking the coach to reproduce.
4. Assign severity from impact, not tone or number of reports.
5. Close the loop with the coach after authoritative verification.

## Monitoring Dashboard Specification

The monitoring vendor is not selected. The required operational views are:

### 1. Executive beta health

- public availability,
- active incidents by severity,
- deployed commit and deployment time,
- remote migration ledger/version,
- Supabase and hosting provider status,
- current active-event window and freeze state,
- latest backup/recovery-point age,
- synthetic smoke status.

### 2. API and application health

- requests, 4xx, 5xx, and p50/p95 latency by route family,
- client/server exception count and top redacted error signatures,
- score-mutation and Dynamic Statistics save outcomes,
- player-code/share-token resolution outcomes,
- authentication outcomes,
- release comparison and error-rate change.

### 3. Tournament operations health

- last successful authoritative score read/write timestamp per active event where safely available,
- save failures and retry counts,
- leaderboard refresh age,
- Review/readiness convergence warnings,
- unresolved discrepancy count from existing authoritative reads,
- Tournament/Qualifying finalization mismatch alerts,
- no raw score payloads, credentials, codes, or tokens.

### 4. Supabase health

- project status,
- connection and query saturation,
- query errors/timeouts and slow-query indicators,
- auth status and aggregate failures,
- database/storage growth,
- backup age/status,
- approved versus observed migration ledger.

### 5. Security and abuse

- aggregate invalid/throttled public code attempts,
- unusual 401/403 spikes,
- cross-owner authorization failures,
- token/code inventory growth anomalies,
- suspected credential or sensitive-data logging events.

### Log fields

Where telemetry is later implemented, prefer:

- UTC timestamp,
- environment,
- release commit/deployment ID,
- route/operation and status,
- duration,
- generated request/correlation ID,
- redacted error class/signature,
- tournament/round/player IDs only when operationally required and access-controlled,
- client browser/device category,
- offline/retry indicator.

Apply least-privilege dashboard access and define retention before collection. Player names, emails, score payloads, raw codes/tokens, and authorization headers should be omitted or redacted.

## Incident Closure And Postmortem

An incident closes only when:

- mitigation is stable,
- authoritative data impact is known,
- required recovery/rollback validation passes,
- affected coaches receive a resolution update,
- alerts and manual checks show no recurrence during the observation window,
- follow-up owners and due dates are recorded.

P1 and P2 incidents require a blameless postmortem. Complete it within five business days and include:

- summary and customer impact,
- UTC timeline,
- detection source and detection gap,
- technical and operational root causes,
- why existing controls did or did not work,
- data/audit integrity findings,
- mitigation and recovery decisions,
- communication review,
- corrective actions with owners/dates,
- required tests, monitoring, documentation, or drill changes.

Do not close an incident merely because the visible error disappeared.

## Pre-Beta Monitoring Checklist

- [ ] Monitoring vendor/tools and production projects are selected and access-controlled.
- [ ] Monitoring Owner, Incident Commander backups, responders, Security Lead, Tournament Operations, and Communications contacts are named.
- [ ] Production release commit/deployment identifier is visible in operator telemetry or provider metadata.
- [ ] Application/server exceptions and API status/latency are centrally observable.
- [ ] Supabase health, auth health, query errors, and backup age are observable.
- [ ] Score-mutation and public access-path failures can trigger alerts without payload leakage.
- [ ] P1/P2 alert routes and paging/contact methods are tested.
- [ ] Synthetic read checks cover public, authenticated, scorecard, leaderboard, and finalized read-only workflows using safe canary data.
- [ ] Alert thresholds and active-event schedule/freeze handling are configured.
- [ ] Dashboard access and log retention are approved.
- [ ] Secret/token/code redaction is verified with sample events.
- [ ] Tournament-day paper/manual contingency is prepared.
- [ ] `BACKUP_RECOVERY.md` ownership and drill requirements are satisfied or explicitly gated.
- [ ] `RELEASE_ROLLBACK.md` ownership and drill requirements are satisfied or explicitly gated.
- [ ] One P1 and one P2 tabletop exercise has been completed.
- [ ] One synthetic alert-to-acknowledgement test meets the target.
- [ ] One release regression/rollback scenario has been rehearsed.
- [ ] Coach support intake captures required evidence without secrets.
- [ ] Beta operators know who can declare, rollback, recover, communicate, and resume play.

## Required Pre-Beta Incident Drill

Before inviting beta coaches, run a tabletop plus an observable technical drill in a disposable environment:

1. Assign roles and declare a simulated active-tournament P2 score-save incident.
2. Trigger a safe synthetic failure or use a controlled mock; do not corrupt production data.
3. Confirm alert delivery, acknowledgement time, incident declaration, and release correlation.
4. Exercise coach/player communication and manual scoring contingency.
5. Verify investigation distinguishes browser/cache, application/API, Supabase, and durable-data authority.
6. Escalate the simulation to a P1 wrong-player or destructive-data scenario without creating real exposure.
7. Invoke the decision boundaries for application rollback and backup recovery.
8. Run authoritative recovery verification and declare service resumption.
9. Measure detection, acknowledgement, mitigation decision, communication, and closure times.
10. Complete a short postmortem and revise alerts/runbooks.

The drill passes only when monitoring detects the safe synthetic symptom, responders meet acknowledgement targets, communications contain no secrets, authority is preserved, and the team can identify when to use rollback versus recovery.

## Unresolved Pre-Beta Assumptions

- The centralized monitoring/error-reporting vendor and production projects.
- The hosting provider's logs, uptime, release metadata, and alert integrations.
- Available Supabase plan metrics, log retention, database observability, and support response.
- Whether a dedicated staging/preview environment exists for synthetic failures and drills.
- How active tournament schedules reach alerting/freeze configuration.
- Named primary/backup responders and out-of-hours contact methods.
- Approved telemetry retention, privacy, and access policy.
- The safe canary coach/events used by synthetic monitoring.
- Whether application changes are required later to expose correlation IDs, release identity, structured errors, or live-scoring freshness.

These assumptions must be resolved and the checklist/drill must pass before opening controlled beta.
