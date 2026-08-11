/** Branded identifier types — prevent mixing IDs across domains. */

declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type SessionId = Brand<string, 'SessionId'>
export type ViewportId = Brand<string, 'ViewportId'>
export type IssueId = Brand<string, 'IssueId'>
export type RuleId = Brand<string, 'RuleId'>
export type ElementId = Brand<string, 'ElementId'>
export type TransactionId = Brand<string, 'TransactionId'>
export type SourceFingerprint = Brand<string, 'SourceFingerprint'>

export function asSessionId(value: string): SessionId {
  return value as SessionId
}
export function asViewportId(value: string): ViewportId {
  return value as ViewportId
}
export function asIssueId(value: string): IssueId {
  return value as IssueId
}
export function asRuleId(value: string): RuleId {
  return value as RuleId
}
export function asElementId(value: string): ElementId {
  return value as ElementId
}
export function asTransactionId(value: string): TransactionId {
  return value as TransactionId
}
export function asFingerprint(value: string): SourceFingerprint {
  return value as SourceFingerprint
}

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
