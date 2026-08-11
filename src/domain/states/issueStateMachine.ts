import { transition, type TransitionTable } from './stateMachine'
import type { Result } from '../result'
import type { AppError } from '../errors'

export type IssueLifecycleState =
  | 'Open'
  | 'Resolved'
  | 'Ignored'
  | 'Stale'
  | 'UnableToVerify'

export const ISSUE_TRANSITIONS: TransitionTable<IssueLifecycleState> = {
  Open: ['Resolved', 'Ignored', 'Stale', 'UnableToVerify'],
  Resolved: ['Open'],
  Ignored: ['Open'],
  Stale: ['Open'],
  UnableToVerify: ['Open'],
}

export function transitionIssue(
  from: IssueLifecycleState,
  to: IssueLifecycleState,
): Result<IssueLifecycleState, AppError> {
  return transition(ISSUE_TRANSITIONS, from, to, 'LayoutIssue')
}

export function toLegacyLifecycle(
  state: IssueLifecycleState,
): 'open' | 'resolved' | 'ignored' | 'stale' {
  switch (state) {
    case 'Open':
      return 'open'
    case 'Resolved':
      return 'resolved'
    case 'Ignored':
      return 'ignored'
    case 'Stale':
    case 'UnableToVerify':
      return 'stale'
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

export function fromLegacyLifecycle(
  legacy: 'open' | 'resolved' | 'ignored' | 'stale',
): IssueLifecycleState {
  switch (legacy) {
    case 'open':
      return 'Open'
    case 'resolved':
      return 'Resolved'
    case 'ignored':
      return 'Ignored'
    case 'stale':
      return 'Stale'
    default: {
      const _exhaustive: never = legacy
      return _exhaustive
    }
  }
}
