import { transition, type TransitionTable } from './stateMachine'
import type { Result } from '../result'
import type { AppError } from '../errors'

export type ViewportRunState =
  | 'Pending'
  | 'Preparing'
  | 'Stabilising'
  | 'Analysing'
  | 'Completed'
  | 'Skipped'
  | 'Failed'
  | 'Cancelled'

export const VIEWPORT_RUN_TRANSITIONS: TransitionTable<ViewportRunState> = {
  Pending: ['Preparing', 'Skipped', 'Cancelled'],
  Preparing: ['Stabilising', 'Failed', 'Cancelled', 'Skipped'],
  Stabilising: ['Analysing', 'Failed', 'Cancelled'],
  Analysing: ['Completed', 'Failed', 'Cancelled'],
  Completed: [],
  Skipped: [],
  Failed: [],
  Cancelled: [],
}

export function transitionViewportRun(
  from: ViewportRunState,
  to: ViewportRunState,
): Result<ViewportRunState, AppError> {
  return transition(VIEWPORT_RUN_TRANSITIONS, from, to, 'ViewportRun')
}
