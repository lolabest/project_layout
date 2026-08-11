# Security Limitations

This tool runs entirely in the browser and **does not bypass**:

- CORS
- CSP (`frame-ancestors` and related)
- X-Frame-Options
- authentication walls
- iframe sandbox restrictions

## Capability matrix

| Capability | Same-origin / srcdoc | Cross-origin blocked |
| --- | --- | --- |
| Preview | Yes | Maybe / No |
| DOM inspection | Yes | No |
| Screenshots | Yes | No |
| Reference comparison | Yes (with capture) | No |

When inspection is unavailable, the UI reports a **capability limitation** with guidance to switch to HTML/CSS mode.

Pasted markup uses a sandboxed iframe (`allow-scripts allow-same-origin`) via `srcdoc`.

Diagnostics must not include sensitive page content beyond selectors and measurements needed for layout evidence.
