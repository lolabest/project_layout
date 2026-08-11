import { Errors, type AppError } from '../errors'
import { err, ok, type Result } from '../result'

export type TransitionTable<S extends string> = Record<S, readonly S[]>

export function canTransition<S extends string>(
  table: TransitionTable<S>,
  from: S,
  to: S,
): boolean {
  return table[from]?.includes(to) ?? false
}

export function transition<S extends string>(
  table: TransitionTable<S>,
  from: S,
  to: S,
  machine: string,
): Result<S, AppError> {
  if (from === to) return ok(from)
  if (!canTransition(table, from, to)) {
    return err(Errors.invalidTransition(from, to, machine))
  }
  return ok(to)
}

export function assertTerminal<S extends string>(
  state: S,
  terminals: readonly S[],
): boolean {
  return terminals.includes(state)
}
