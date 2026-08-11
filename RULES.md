# Layout Rules

Rule engine version is exported as `RULE_ENGINE_VERSION`. Accessibility rules are **heuristics**, not WCAG certification.

| Rule ID | Purpose | Applicability | Failure criteria | Exclusions | Severity | Confidence | Evidence | Limits |
|---|---|---|---|---|---|---|---|---|
| horizontal-overflow | Page/element wider than viewport | DOM measurable | scrollWidth/rect exceeds vp | intentional scroll containers | critical | ~0.95 | overflow px, styles | max issues/rule |
| outside-viewport | Content outside viewport | DOM | rect outside with meaningful size | off-canvas / decorative | warning | ~0.85 | rect | max elements |
| overlapping | Unintended overlap | DOM | intersection above threshold | modals, tooltips, menus, parent-child, badges | warning→critical for interactive | ~0.7–0.9 | intersection area | spatial buckets + candidate cap |
| text-clipping | Text cut by overflow | DOM | overflow hidden + clipped text | empty nodes | warning | ~0.8 | overflow styles | |
| image-overflow | Image exceeds container | images present | natural/box overflow | decorative tiny imgs | warning | ~0.85 | sizes | |
| missing-alt | Image without alt | images present | missing/empty alt | role=presentation | warning | ~0.95 | attrs | |
| broken-image | Failed image load | images present | complete && naturalWidth=0 | still loading | critical | ~0.9 | natural size | |
| broken-link | Empty/unsafe href | links present | empty, `#`, `javascript:` | in-page `#id` when target exists | warning | ~0.9 | href | no network fetch |
| fixed-width | Fixed px risk on narrow vp | responsive context | width ≥ threshold px | small icons | warning | ~0.75 | computed width | |
| small-touch-target | Tiny tap targets | mobile/tablet primarily | &lt; 44×44 interactive | hidden | warning | ~0.85 | box size | |
| inaccessible-control | Unnamed buttons | DOM | button/role=button no name | labelled | critical | ~0.9 | text/aria | not WCAG cert |
| duplicate-id | Non-unique ids | DOM | id count &gt; 1 | empty ids | warning | ~0.95 | id/count | |
| invalid-aria | Broken ARIA refs | DOM | labelledby/describedby/controls missing | hidden | warning | ~0.9 | missing ids | not WCAG cert |
| unlabelled-control | Inputs without name | DOM | no label/aria | hidden/submit | critical | ~0.9 | attrs | not WCAG cert |
| sticky-obstruction | Content under sticky/fixed | DOM | sticky overlaps content | intentional overlays | warning | ~0.75 | intersection | |
| unexpected-scrollbar | Unexpected scrollbars | DOM | overflow scroll without need | intentional scroll areas | info | ~0.7 | overflow | |
| small-text | Unreadable font size | DOM | font-size &lt; 12px visible text | icons/decorative | warning | ~0.8 | font-size | |
| image-layout-shift | Images without dimensions | images present | no width/height attrs/CSS | sized images | warning | ~0.85 | attrs/styles | |

Skipped rules appear in diagnostics with a reason. One failed rule does not fail the session.
