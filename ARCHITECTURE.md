# Architecture

Layered layout analysis system. Domain and application layers are testable without React.

## Layers

```
presentation/   React components + App.tsx (UI state only)
application/    Use cases + AnalysisApplicationService + diagnostics
domain/         Entities, IDs, Result/errors, state machines, scoring, fingerprint, coverage
infrastructure/ Rule engine, rule registry, builtin rules, LocalStorageSessionRepository
engine/         DOM helpers, stabilize, validation, reports, measurements (browser adapters)
```

## Rules for presentation

React components must **not**:

- detect layout problems
- calculate health scores (display scores produced by analysis)
- group/deduplicate issues
- control session state transitions
- access `localStorage` directly
- generate reports from React state

UI calls `analysisApp` / `application/usecases/*` and renders results.

## Domain entities

See `src/domain/entities/index.ts`:

`SourceDocument`, `Viewport`, `AnalysisSession`, `ViewportRun`, `AnalysisRuleDefinition`, `RuleExecution`, `LayoutIssueEntity`, `ElementReference`, `ElementMeasurement`, `TemporaryStyleChangeEntity`, `IssueResolution`, `ReferenceComparison`, `AnalysisReport`.

Branded IDs live in `src/domain/ids.ts`.

## Use cases

Explicit modules in `src/application/usecases/index.ts`:

LoadSource, ValidateSource, CreateAnalysisSession, RunActiveViewportAnalysis, RunAllViewportsAnalysis, CancelAnalysisSession, RerunAnalysis, ApplyTemporaryStyle, UndoTemporaryStyle, RedoTemporaryStyle, ResetTemporaryStyles, IgnoreIssue, RestoreIgnoredIssue, CompareWithReference, GenerateReport, RestorePreviousSession, DeleteSession.

Each returns `Result<T, AppError>`.

## State machines

- Source: Empty → Dirty → Validating → Ready → Loading → Loaded | Blocked | Failed
- Session: Draft → Queued → Running → Cancelling → Cancelled | Completed | CompletedWithErrors | Failed (terminal)
- Viewport run: Pending → Preparing → Stabilising → Analysing → Completed | Skipped | Failed | Cancelled
- Issue: Open ↔ Ignored / Resolved / Stale / UnableToVerify (with reopen rules)

## Rule engine

`LayoutRuleEngine` + `RuleRegistry` + 18 builtin rules. One failed rule does not abort analysis. Skipped rules carry reasons and count toward coverage, not failures.

## Persistence

`SessionRepository` → `LocalStorageSessionRepository` (schema v2, migrate legacy, max 20, quota-safe).
