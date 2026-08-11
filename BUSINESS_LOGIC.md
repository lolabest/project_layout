# Business Logic

## Core entities

Domain models are defined in `src/domain/entities/index.ts` with branded IDs (`SessionId`, `ViewportId`, `IssueId`, `RuleId`, `ElementId`, `TransactionId`, `SourceFingerprint`).

UI-facing DTOs remain in `src/models/types.ts` for serialization and React props.

## Session lifecycle

1. Validate source → fingerprint.
2. Create session with immutable config snapshot (enabled rules, rule/scoring versions, limits).
3. Run viewport pipeline (single or all).
4. Persist completed sessions (max 20).
5. Terminal states: Completed, CompletedWithErrors, Cancelled, Failed.

Changing source fingerprint / enabled rules after analysis starts requires a new session (ignored keys are fingerprint-scoped).

## Issue lifecycle

Open → Resolved | Ignored | Stale | UnableToVerify  
Ignored → Open (restore)  
Resolved/Stale → Open if rediscovered  

Ignored keys: `{fingerprint}::{ruleId}::{selector}` so state cannot leak across websites.

## Analysis pipeline

validate source → prepare preview → apply viewport → iframe load → stabilize (fonts/images/mutations/rAF) → capture measurements → run applicable rules → dedupe → score → coverage → save viewport result → next viewport.

Cancellation via `AbortController`. Concurrent runs on the same session return `SessionConflictError`.

## Scoring & coverage

Health score from scoring policy v1 (confidence-weighted, capped, cross-viewport deduped).  
Coverage is separate: low coverage with high score shows an explicit warning.

## Temporary CSS transactions

Apply / undo / redo / reset element / reset all. Source markup is never mutated. After each change, affected rules re-run and issue deltas + score before/after are recorded.

## Invariants

- Same issue identity across reruns when fingerprint + rule + selector + structural signature match.
- Cross-viewport repeats score once.
- Skipped rule ≠ failed rule.
- Cross-origin preview may work while DOM inspection is unavailable — not treated as an app crash.
- Score is not accessibility certification.

## Error behaviour

Expected failures return `Result` with typed `AppError` (`code`, user message, diagnostic, recoverability, next action). Stack traces are not shown in the main UI.
