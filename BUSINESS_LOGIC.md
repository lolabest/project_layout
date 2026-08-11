# Business Logic

## Core entities

- **SourceDocument** — URL or markup + fingerprint  
- **Viewport** — id, name, width/height  
- **AnalysisSession** — immutable config snapshot + status  
- **ViewportRun** — per-viewport pipeline state  
- **LayoutIssue** — evidence-backed finding with stable identity  
- **TemporaryStyleChange** — reversible CSS transaction metadata  

## Session lifecycle

`Draft → Queued/Running → Cancelling → Cancelled`  
`Running → Completed | CompletedWithErrors | Failed`  

Terminal states: Cancelled, Completed, CompletedWithErrors, Failed.

Only one non-terminal session may run at a time (`SessionConflictError`).

## Issue lifecycle

`Open → Resolved | Ignored | Stale | UnableToVerify`  
`Ignored|Resolved|Stale|UnableToVerify → Open` (rediscovery / restore)

Ignored issues persist by `ruleId::selector` keyed to the **source fingerprint**.

## Analysis invariants

1. Analysis requires `DomInspectionAvailable`.  
2. One failed rule does not abort the engine.  
3. Skipped rules are not failures; they reduce coverage.  
4. Cross-viewport repeats share identity for scoring.  
5. Temporary CSS never mutates the original source automatically.  
6. Export only for completed / partially completed sessions.  
7. Health score is **not** an accessibility certification.

## Error behaviour

Expected failures return `Result<T, AppError>` with:

- stable `code`
- user message
- diagnostic
- recoverability
- next action

Raw stack traces are not shown in the primary UI; diagnostics remain collapsible.
