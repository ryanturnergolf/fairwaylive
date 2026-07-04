# Database Review

Use this prompt when reviewing Clubhouse HQ database, Supabase, repository, or service changes.

## Goal

Review schema, repositories, and services for correctness, simplicity, and safe persistence behavior.

## Checklist

- Review relevant migrations and table constraints.
- Review repository methods for correct Supabase usage.
- Review service methods for expected orchestration and error handling.
- Confirm unique constraints match upsert conflict targets.
- Confirm localStorage compatibility remains intact when required.
- Detect opportunities to simplify queries and indexes.
- Identify missing indexes only when they support known access patterns.
- Check that secrets and environment variables are not committed.

## Constraints

- Do not change schema without explicit approval.
- Do not change score loading or review behavior unless requested.
- Do not expose secrets.
- Do not run privileged database operations without permission.

## Final Report

Report:

- Schema findings.
- Repository findings.
- Service findings.
- Query or index recommendations.
- Risks and required approvals.
