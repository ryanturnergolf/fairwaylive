# Performance Review

Use this prompt when reviewing Clubhouse HQ performance.

## Goal

Detect unnecessary renders, duplicate state, unnecessary effects, and low-risk optimization opportunities.

## Checklist

- Inspect components involved in the reported workflow.
- Look for derived state that can be computed safely.
- Look for effects that run too often or mutate state during render.
- Look for duplicate localStorage reads or writes.
- Look for expensive work inside render.
- Look for unstable dependencies that cause repeated effects.
- Check whether optimization would change behavior.

## Constraints

- Recommend optimizations before implementing them unless the user asked for fixes.
- Do not change scoring, saving, loading, or review behavior for performance alone.
- Avoid premature abstractions.
- Keep any proposed changes small and measurable.

## Final Report

Report:

- Performance risks found.
- Evidence for each risk.
- Recommended optimizations.
- Expected impact.
- Whether each recommendation is safe to implement now.
