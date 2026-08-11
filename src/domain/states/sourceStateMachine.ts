import { transition, type TransitionTable } from './stateMachine'
import type { Result } from '../result'
import type { AppError } from '../errors'

/** Canonical source states (presentation may map legacy aliases). */
export type SourceLifecycleState =
  | 'Empty'
  | 'Dirty'
  | 'Validating'
  | 'Ready'
  | 'Loading'
  | 'Loaded'
  | 'Blocked'
  | 'Failed'

export const SOURCE_TRANSITIONS: TransitionTable<SourceLifecycleState> = {
  Empty: ['Dirty', 'Validating'],
  Dirty: ['Validating', 'Empty'],
  Validating: ['Ready', 'Dirty', 'Empty'],
  Ready: ['Loading', 'Dirty', 'Empty'],
  Loading: ['Loaded', 'Blocked', 'Failed', 'Dirty'],
  Loaded: ['Dirty', 'Loading', 'Empty'],
  Blocked: ['Dirty', 'Loading', 'Empty'],
  Failed: ['Dirty', 'Loading', 'Empty'],
}

export function transitionSource(
  from: SourceLifecycleState,
  to: SourceLifecycleState,
): Result<SourceLifecycleState, AppError> {
  return transition(SOURCE_TRANSITIONS, from, to, 'Source')
}

export function mapLegacySourceState(
  legacy:
    | 'empty'
    | 'ready'
    | 'loading'
    | 'loaded'
    | 'invalid'
    | 'blocked'
    | 'failed'
    | 'modified',
): SourceLifecycleState {
  switch (legacy) {
    case 'empty':
      return 'Empty'
    case 'ready':
      return 'Ready'
    case 'loading':
      return 'Loading'
    case 'loaded':
      return 'Loaded'
    case 'invalid':
      return 'Dirty'
    case 'blocked':
      return 'Blocked'
    case 'failed':
      return 'Failed'
    case 'modified':
      return 'Dirty'
    default: {
      const _exhaustive: never = legacy
      return _exhaustive
    }
  }
}

export function toLegacySourceState(
  state: SourceLifecycleState,
): 'empty' | 'ready' | 'loading' | 'loaded' | 'invalid' | 'blocked' | 'failed' | 'modified' {
  switch (state) {
    case 'Empty':
      return 'empty'
    case 'Dirty':
      return 'modified'
    case 'Validating':
      return 'ready'
    case 'Ready':
      return 'ready'
    case 'Loading':
      return 'loading'
    case 'Loaded':
      return 'loaded'
    case 'Blocked':
      return 'blocked'
    case 'Failed':
      return 'failed'
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}
