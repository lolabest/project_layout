# Detection Rules

Rule engine version: see `RULE_ENGINE_VERSION` in `LayoutRuleEngine.ts`.

Each rule implements: `id`, `name`, `description`, `category`, `defaultSeverity`, `version`, `supports`, `evaluate`, `getRecommendation`.

| Rule ID | Purpose | Applicability | Severity | Key exclusions |
| --- | --- | --- | --- | --- |
| `horizontal-overflow` | Page/element wider than viewport | DOM inspectable | Critical/Warning | Intentional scroll containers; subpixel ≤1px |
| `outside-viewport` | Visible nodes off horizontal bounds | DOM inspectable | Warning/Info | SR/off-screen hide patterns |
| `overlapping` | Unintended overlap of priority content | DOM inspectable | Warning/Info | Modals/tooltips/menus/overlays; parent-child; pointer-events:none; tiny intersections |
| `text-clipping` | Text does not fit container | DOM inspectable | Warning/Info | Intentional ellipsis → Info (not Critical) |
| `image-overflow` | Image exceeds parent / unconstrained | Has images | Warning/Info | Decorative zero-size |
| `missing-alt` | `<img>` without `alt` | Has images | Critical | `alt=""` decorative images |
| `broken-image` | `complete` + zero natural size | Has images | Critical | Empty src |
| `broken-link` | Empty/#/javascript:/malformed href | DOM inspectable | Info/Warning | No network probing of external URLs |
| `fixed-width` | Large fixed px width vs viewport | DOM inspectable | Warning | Small icons/controls; intentional max-width containers |
| `small-touch-target` | Controls < 44×44 | Mobile/tablet only | Warning | Nested interactive duplicates |
| `inaccessible-control` | Unlabelled inputs, unnamed buttons, duplicate IDs, bad ARIA refs | DOM inspectable | Critical/Warning | Hidden inputs |
| `sticky-obstruction` | Content under sticky/fixed bars | DOM inspectable | Warning | Decorative overlays |
| `unexpected-scrollbar` | Horizontal root scrollbar | DOM inspectable | Warning | — |
| `small-text` | Font size < 12px | DOM inspectable | Info | Empty text nodes |
| `image-layout-shift` | Images without reserved space | Has images | Info | width+height attrs or aspect-ratio present |

Skipped rules appear in diagnostics with a reason. Skipped ≠ failed.

**Accessibility rules are heuristic checks, not WCAG certification.**
