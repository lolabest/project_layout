# Testing

## Commands

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Unit coverage

- State machines: every allowed/rejected transition (`src/domain/states/stateMachines.test.ts`)
- Source fingerprinting (`fingerprint` tests via businessLogic)
- Issue identity / ignore scoping (`src/domain/issueIdentity.test.ts`)
- Score policy (`src/domain/scoring/scorePolicy.test.ts`)
- Builtin rules including split a11y rules (`src/infrastructure/rules/builtinRules.test.ts`)
- Temporary CSS undo/redo (`src/engine/measurements.test.ts`)
- Session repository migration/corruption/max-20 (`src/infrastructure/persistence/sessionRepository.test.ts`)
- Use cases (`src/application/usecases/usecases.test.ts`)
- Report integrity hash (`src/engine/reports.integrity.test.ts`)
- Analyzer / businessLogic / integration fixtures (deterministic DOM, no public websites)

## Integration

`src/engine/integration.test.ts` covers analysis session flows, export, and persistence facades with local fixtures.

## Strictness

TypeScript enables: `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`, `noImplicitReturns`.
