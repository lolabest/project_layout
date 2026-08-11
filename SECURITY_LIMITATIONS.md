# Security Limitations

The tool respects browser security. It does **not** bypass:

- CORS
- CSP (`frame-ancestors`, etc.)
- X-Frame-Options
- authentication walls
- iframe sandbox restrictions

## Capability matrix

| Capability | Meaning |
|---|---|
| PreviewAvailable | Document can be shown in the sandboxed iframe |
| DomInspectionAvailable | Same-origin access to DOM for rules |
| ScreenshotAvailable | Canvas capture of preview possible |
| ReferenceComparisonAvailable | Both reference image + rendered capture available |

An external site may allow preview but block DOM inspection. That is surfaced as a capability state, not an application failure. Switch to pasted HTML/CSS for full analysis.

## Diagnostics

Diagnostic events never intentionally include full page content or secrets. Persistence failures (quota) do not crash the app.

## Report integrity

Exported reports include `schemaVersion`, rule/scoring policy versions, source fingerprint, and an `integrityHash` over the machine-readable snapshot.
