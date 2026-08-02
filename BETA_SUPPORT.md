# Clubhouse HQ Controlled Beta Support Guide

Last updated: 2026-08-01

## Purpose And Authority

This guide defines support intake and communication for the small, invitation-only controlled beta. `MONITORING_INCIDENT_RESPONSE.md` remains authoritative for severity, incident command, investigation, mitigation, and closure. `BACKUP_RECOVERY.md` and `RELEASE_ROLLBACK.md` remain authoritative for restores and releases.

## Support Ownership

Before inviting a coach, assign a named primary and backup Beta Support Owner. The owner receives reports, confirms required details, classifies urgency, opens or links an incident, maintains coach communication, and hands technical investigation to the appropriate application, database, security, release, or tournament-operations responder. Support must never request passwords, auth tokens, scoring codes, share tokens, Supabase keys, or database credentials.

## Urgent And Non-Urgent Issues

Urgent support includes active-play score-save failure, wrong-player or cross-event data, suspected lost or corrupt authoritative scores, field-wide access/authentication failure, incorrect official results/finalization, or an outage blocking an active event. Treat credible data exposure, corruption, or incorrect official state as P1; acknowledge within 5 minutes. Treat major active-event workflow degradation as P2; acknowledge within 15 minutes.

Non-urgent support includes isolated issues with a safe workaround, browser-specific problems, presentation defects, documentation questions, and feature requests. P3 receives a response within 4 business hours, or within 30 minutes when it affects active play. P4 follows the normal beta backlog cadence. Severity may be raised whenever impact or credible risk increases.

## Tournament-Day Escalation

1. Record the UTC/local timestamp and whether live play is active.
2. Capture the event ID, affected player/hole, device/browser, symptoms, and last successful action.
3. Ask the coach to stop repeated mutations, code rotation, regeneration, Review, or finalization when authority is uncertain.
4. Preserve the open browser and screenshots without credentials.
5. Declare or link the P1/P2 incident under `MONITORING_INCIDENT_RESPONSE.md`.
6. Notify the Tournament Operations Lead and assigned technical responder.
7. Use only documented product workflows, rollback, or recovery procedures.

## Required Issue Details

Use `BETA_ISSUE_TEMPLATE.md`. A usable report includes Tournament or Qualifying ID, coach/program, date and timestamp with timezone, player and hole when applicable, browser/device, screenshots, exact steps taken, current versus expected result, live-play status, urgency, and safe contact method.

## Communication Cadence

- P1: acknowledge within 5 minutes; update every 15 minutes.
- P2: acknowledge within 15 minutes; update every 30 minutes.
- P3: respond within 4 business hours, or 30 minutes during active play; update at material change and daily while open.
- P4: acknowledge through the normal beta backlog cadence.

Communications state impact, workaround or stop-work guidance, next update time, and incident identifier. Never speculate about data safety before authoritative verification.

## Incident Handoff

Support hands off one complete record containing severity, timeline, affected IDs, current event state, reproduction steps, screenshots, browser/device, console/network symptoms when safely available, actions already attempted, communication history, and named owner. The receiving Incident Commander explicitly accepts ownership. Support remains responsible for coach-facing updates until closure and links the final incident/postmortem outcome back to the report.

## Contact Configuration

Production may set the client-safe `NEXT_PUBLIC_BETA_SUPPORT_CONTACT` to a monitored support email address or HTTPS support URL. It is public configuration, not a secret, and is embedded at build time. If unset or invalid, the Help page instructs coaches to contact their designated beta support owner. Do not hardcode a personal email or phone number.
