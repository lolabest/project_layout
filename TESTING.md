# Testing

## Commands

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Suites

| Area | Location |
| --- | --- |
| State machines (allowed + rejected) | `src/domain/states/stateMachines.test.ts` |
| Score / coverage / fingerprints | `src/domain/scoring/scorePolicy.test.ts` |
| Rules + validation + reports | `src/engine/analyzer.test.ts`, `businessLogic.test.ts` |
| Integration flows | `src/engine/integration.test.ts` |

## Fixtures

Automated tests use **deterministic local HTML fixtures** via `DOMParser` / `buildSrcDoc`.  
They do **not** depend on public websites.

## Rule tests cover

- valid layout paths  
- broken layout detection  
- intentional exclusions (e.g. `alt=""`, ellipsis as Info)  
- boundary / hidden / zero-size protections where implemented  

## Manual checks

Use the sample markup in the app: Load Preview → Analyze Layout → Run All Viewports → Compare → Export.
