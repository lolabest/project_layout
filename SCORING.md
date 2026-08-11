# Scoring Policy v1.0.0

## Formula

1. Start at **100**.  
2. Consider only **Open** issues.  
3. Deduplicate by `ruleId::selector` (cross-viewport safe).  
4. Base costs: Critical **15**, Warning **5**, Info **1**.  
5. Multiply by confidence (clamped 0.3–1.0).  
6. Cap per rule+element at **20**; per rule total at **40**.  
7. Clamp final score to **0–100**.

Labels: 90–100 Excellent · 75–89 Good · 50–74 Needs attention · 0–49 Poor.

## Example

Issues found:

- missing alt on `img` (Critical, confidence 1.0) — appears on Mobile + Tablet  
- placeholder link `a.cta` (Info, confidence 1.0)

Deduped deductions:

- missing-alt::img → 15  
- broken-link::a.cta → 1  

Final score: `100 - 15 - 1 = 84` → **Good**

Breakdown lines are stored on the score object for explainability.

## Coverage

Coverage is separate from the health score:

`executed` rules raise coverage; `skipped`/`failed` rules and stabilization timeouts lower it.

If coverage < 70%, UI warns that the health score may be incomplete.

## Disclaimer

The Layout Health Score is **not** a formal accessibility compliance score or universal website quality certification.
