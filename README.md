# Layout Tester

A production-oriented **Visual Website Layout Testing Tool** built with React, TypeScript, and Vite. Paste HTML/CSS or load a public URL, preview it across viewports, detect layout and accessibility issues, compare against a reference design, and export reports.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

### Other commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Typecheck and create a production build |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Run TypeScript project references check |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run unit tests (Vitest) |

## Architecture

```
src/
  models/types.ts          Typed models (sessions, viewports, issues, reports)
  engine/
    analyzer.ts            Layout / a11y detection (UI-independent)
    domUtils.ts            Selectors, geometry helpers
    measurements.ts        Element box-model measurement + temp CSS
    validation.ts          URL/markup validation + srcdoc builder
    comparison.ts          Reference vs rendered image diff
    screenshot.ts          Same-origin iframe capture (html2canvas)
    reports.ts             JSON/HTML export + localStorage sessions
  components/              DevTools-style UI (toolbar, sidebars, preview)
  styles/                  Global theme + CSS modules
  App.tsx                  Application wiring
```

The **analysis engine is separated from the UI**. Components call into `engine/*`; checks can be unit-tested without mounting React.

### Data flow

1. User enters a URL or HTML/CSS → validation → iframe preview (`src` or sandboxed `srcdoc`).
2. Same-origin documents are analyzed by `analyzeDocument()`.
3. Issues appear in the right panel; clicking an issue highlights/scrolls to the element.
4. Multi-viewport runs reuse the analyzer for each predefined size and capture screenshots when possible.
5. Reports are generated in-memory and can be exported or stored in `localStorage`.

## Supported checks

| Check | Severity | Notes |
| --- | --- | --- |
| Horizontal overflow | Critical / Warning | Page scroll width and elements past the right edge |
| Outside viewport | Warning | Fully off-screen positioned content |
| Overlapping elements | Warning | Heuristic pairwise overlap for visible candidates |
| Text clipping | Warning | Overflow hidden / ellipsis with scroll overflow |
| Images exceeding containers | Warning | Image box wider than parent |
| Missing `alt` | Critical | `<img>` without an `alt` attribute |
| Broken images | Critical | Loaded images with zero natural dimensions |
| Broken / placeholder links | Info / Warning | Empty, `#`, or `javascript:` hrefs |
| Fixed widths | Warning | Large px widths that may break small viewports |
| Small touch targets | Warning | Interactive controls under ~44×44px |

## UI overview

- **Left sidebar** — source input (URL or HTML/CSS), viewport presets, custom size, orientation, scale/fit, saved sessions
- **Center** — scaled iframe preview with optional grid, rulers, breakpoint guides, outline mode, spacing inspection
- **Right sidebar** — issues, element inspector (measurements + temporary CSS edits), multi-viewport results
- **Top toolbar** — load, refresh, analyze, run all viewports, inspection toggles, compare, export
- **Panels** — resizable and collapsible

## Screenshot comparison

1. Open **Compare**
2. Upload a reference design image
3. **Capture preview** (same-origin / pasted markup only)
4. Use side-by-side, opacity overlay, or difference heatmap
5. Review the estimated visual similarity percentage

## Security limitations (important)

This tool runs entirely in the browser and **does not bypass** browser security controls:

- **X-Frame-Options / CSP `frame-ancestors`** may prevent embedding external sites in the preview iframe.
- **Cross-origin isolation** prevents reading another origin’s DOM, so layout analysis, element selection, screenshots, and temporary CSS edits are unavailable for blocked or cross-origin pages.
- Pasted markup is rendered with an iframe `sandbox` (`allow-scripts allow-same-origin`) via `srcdoc`.
- No attempts are made to circumvent CORS, CSP, authentication walls, or mixed-content restrictions.

When an external URL cannot be inspected, the UI shows a clear message and you can continue with pasted HTML/CSS.

## Backend requirements

**None for core functionality.** The app is a static client-side SPA.

Optional future backends could help with:

- Server-side rendering / headless screenshots of arbitrary URLs
- Authenticated page capture
- Shared team report storage
- Proxying pages that disallow framing (still subject to legal/ToS constraints)

## localStorage

Previous test sessions (source, viewport, issues, optional multi-viewport summary/report metadata) are stored under `layout-tester.sessions` (max 20). Clearing site data removes them. Large screenshot data URLs may increase storage usage.

## Future extension points

- Additional analyzers in `engine/analyzer.ts` (contrast, tap spacing, font scaling)
- Pluggable reporters implementing the `TestReport` model
- CI integration via a headless runner that imports `analyzeDocument`
- Design-token / Figma reference ingestion for comparison
- Persisted cloud sessions instead of `localStorage`

## Sample content

The app ships with a sample markup document that intentionally includes overflow, missing alt text, broken images/links, clipped text, fixed widths, and small touch targets so you can exercise the analyzer immediately after **Load Preview** → **Analyze Layout**.
