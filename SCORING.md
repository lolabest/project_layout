# Scoring Policy

**Source of truth:** `src/domain/scoring/scorePolicy.ts` (`SCORING_POLICY_VERSION = 1.0.0`).

`src/engine/scoring.ts` is a thin adapter that maps policy output to UI `HealthScoreResult` shapes. Do not maintain a second deduction model.

## Formula

1. Start at **100**.
2. Consider only **open** issues (ignored/resolved/stale/unable-to-verify excluded).
3. Deduplicate by `ruleId::selector` (cross-viewport safe; keep highest severity, then confidence).
4. Base costs: Critical **15**, Warning **5**, Info **1**.
5. Weight by confidence (clamped 0.3–1.0): `weighted = base × confidence`.
6. Cap per rule+element: **20**.
7. Cap per rule total: **40**.
8. Clamp final score to **0–100**.

Labels: 90–100 Excellent · 75–89 Good · 50–74 Needs attention · 0–49 Poor.

## Example

Issues (after grouping):

| Rule | Selector | Severity | Confidence |
|---|---|---|---|
| horizontal-overflow | html | critical | 0.95 |
| missing-alt | img.hero | warning | 0.9 |
| missing-alt | img.hero (tablet) | warning | 0.9 → deduped |

Deductions:

- overflow: `15 × 0.95 = 14.25` → capped 14.25
- missing-alt: `5 × 0.9 = 4.5`

Final: `100 - 14.25 - 4.5 = 81.25` → **Good**.

Score breakdown lines are stored on reports (`scoreBreakdown`).

## Coverage

Separate from health score (`src/domain/coverage.ts`). If coverage &lt; 70%, UI warns that the score may not represent the complete layout.

## Disclaimer

Layout Health Score is **not** accessibility certification or a universal website quality score.
