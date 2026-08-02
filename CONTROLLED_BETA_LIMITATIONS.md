# Clubhouse HQ Controlled Beta Known Limitations

Last updated: 2026-08-01

This is the authoritative limitations list for the invitation-only controlled beta. It consolidates existing project and operational documentation; it does not expand production-readiness claims.

## Browsers And Devices

- Automated release coverage is Chromium-only. Desktop and 390×844 mobile layouts are exercised, but Safari, Firefox, and the full device/browser matrix are not certified by CI.
- Browser-specific issues may require use of the currently verified Chromium path while support investigates.
- Push notifications are not available; coaches monitor the Tournament workspace during play.

## Monitoring

- The application emits vendor-neutral, redacted server/client error events and exposes `/api/health` for process/configuration readiness.
- No monitoring vendor is selected. The foundation does not itself retain logs, deliver alerts, measure every handled API outcome/latency, or prove Supabase/scoring connectivity.
- Beta requires operator-configured collection, alert routing, named responders, safe canaries, and a completed incident drill.

## Backup And Recovery

- Supabase durable tables are authority. Snapshots, browser cache, screenshots, and printed material are recovery aids only.
- Managed backup/PITR availability depends on the connected Supabase plan and is not assumed. Named recovery owners, confirmed recovery capability, and the isolated recovery drill remain open gates.
- Browser local cache cannot satisfy the documented RPO or replace a database backup.

## Offline And Cache Expectations

- Existing mobile score and Dynamic Statistics flows can retain supported local work and retry after reconnect, but connectivity loss is not a guarantee of durable server persistence.
- Keep the page open, avoid repeated saves, reconnect once, and verify authoritative state. Do not clear browser data during an active incident unless directed.
- `tournament_state_snapshots` and localStorage are compatibility/offline caches; reconciliation must never overwrite durable Tournament Engine authority.

## Developer And QA Tools

- Seed tools are not available to beta coaches and are hidden/denied in deployed environments by default.
- Deployed access requires explicit enablement and an allowlisted authenticated operator. QA data is disposable and must not be used for recovery.

## Product Boundaries

- The beta uses the certified Tournament and Qualifying workflows. Deferred work includes push notifications, broad export integrations, photo verification, handicap integration, and broader rules automation described in `ROADMAP.md`.
- Support must not promise unsupported alternate scoring, restoration, or administrative workflows.

## Availability And Support

- Beta access is invitation-only and limited to scheduled, supported events with a named coach and support owner.
- There is no unrestricted uptime or 24×7 support commitment. Active-event response targets are those in `BETA_SUPPORT.md` and `MONITORING_INCIDENT_RESPONSE.md`.
- Releases are frozen around tournament windows as defined by `RELEASE_ROLLBACK.md`; emergency changes require the documented incident/hotfix process.
