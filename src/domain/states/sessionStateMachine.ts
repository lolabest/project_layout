import { assertTerminal, transition, type TransitionTable } from './stateMachine'
import type { Result } from '../result'
import type { AppError } from '../errors'

export type SessionLifecycleState =
  | 'Draft'
  | 'Queued'
  | 'Running'
  | 'Cancelling'
  | 'Cancelled'
  | 'Completed'
  | 'CompletedWithErrors'
  | 'Failed'

export const SESSION_TERMINAL: readonly SessionLifecycleState[] = [
  'Cancelled',
  'Completed',
  'CompletedWithErrors',
  'Failed',
]

export const SESSION_TRANSITIONS: TransitionTable<SessionLifecycleState> = {
  Draft: ['Queued', 'Running', 'Failed'],
  Queued: ['Running', 'Cancelled', 'Failed'],
  Running: ['Cancelling', 'Completed', 'CompletedWithErrors', 'Failed'],
  Cancelling: ['Cancelled', 'Failed'],
  Cancelled: [],
  Completed: [],
  CompletedWithErrors: [],
  Failed: [],
}

export function transitionSession(
  from: SessionLifecycleState,
  to: SessionLifecycleState,
): Result<SessionLifecycleState, AppError> {
  return transition(SESSION_TRANSITIONS, from, to, 'AnalysisSession')
}

export function isSessionTerminal(state: SessionLifecycleState): boolean {
  return assertTerminal(state, SESSION_TERMINAL)
}

export function toUiSessionStatus(state: SessionLifecycleState): string {
  switch (state) {
    case 'CompletedWithErrors':
      return 'Completed with errors'
    default:
      return state
  }
}

export function fromUiSessionStatus(status: string): SessionLifecycleState {
  if (status === 'Completed with errors') return 'CompletedWithErrors'
  if (
    status === 'Draft' ||
    status === 'Queued' ||
    status === 'Running' ||
    status === 'Cancelling' ||
    status === 'Cancelled' ||
    status === 'Completed' ||
    status === 'Failed'
  ) {
    return status
  }
  return 'Draft'
}
