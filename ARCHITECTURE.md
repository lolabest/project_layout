# Architecture

## Layers

```
presentation/   React components + App.tsx (UI state only)
application/    Use-case orchestration (AnalysisApplicationService)
domain/         State machines, scoring, fingerprinting, Result/Error types
infrastructure/ Rule engine, persistence, DOM/screenshot adapters
engine/         Shared helpers + backward-compatible facades
```

## Dependency rule

`presentation → application → domain`  
`application → infrastructure` (via ports / concrete adapters)  
`infrastructure → domain`  
React components must **not** detect issues, score, persist sessions, or generate reports.

## Key services

| Service | Responsibility |
| --- | --- |
| `AnalysisApplicationService` | Load/validate source, create session, run/cancel analysis, ignore issues, export, restore sessions |
| `LayoutRuleEngine` + `RuleRegistry` | Execute applicable rules independently; collect executions + issues |
| `LocalStorageSessionRepository` | Versioned session persistence (schema v2, max 20, quota-safe) |
| `DiagnosticLogger` | In-memory structured events (replaceable telemetry adapter) |

## Analysis pipeline (per viewport)

1. Validate source / capabilities  
2. Apply viewport + prepare preview  
3. Stabilize (load, fonts, images, rAF, quiet period)  
4. Run applicable rules via engine  
5. Deduplicate / score / coverage  
6. Persist viewport result  

## Capabilities

Preview, DOM inspection, screenshots, and reference comparison are tracked separately. A blocked cross-origin page is a **capability limitation**, not treated as an unexplained application crash.
