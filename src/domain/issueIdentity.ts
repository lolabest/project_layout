import { hashString } from './fingerprint'
import { asIssueId, type IssueId, type SourceFingerprint } from './ids'

/**
 * Structural identity for an issue.
 * Numeric measurement magnitudes are stripped so reruns with slightly different
 * pixel values preserve the same identity.
 */
export function structuralIdentitySignature(measurementSignature: string): string {
  const colon = measurementSignature.indexOf(':')
  if (colon === -1) return measurementSignature
  const head = measurementSignature.slice(0, colon)
  const tail = measurementSignature.slice(colon + 1)
  if (/^-?\d+(\.\d+)?$/.test(tail.trim())) return head
  return measurementSignature
}

export function buildIssueIdentity(input: {
  fingerprint: string | SourceFingerprint
  ruleId: string
  selector: string
  measurementSignature: string
}): string {
  const structural = structuralIdentitySignature(input.measurementSignature)
  return `${input.fingerprint}|${input.ruleId}|${input.selector}|${structural}`
}

export function createStableIssueId(input: {
  fingerprint: string | SourceFingerprint
  ruleId: string
  selector: string
  measurementSignature: string
}): IssueId {
  return asIssueId(`issue-${hashString(buildIssueIdentity(input))}`)
}

/** Scoped ignore key so ignored state never leaks across different sources. */
export function buildIgnoredIdentityKey(input: {
  fingerprint: string | SourceFingerprint
  ruleId: string
  selector: string
}): string {
  return `${input.fingerprint}::${input.ruleId}::${input.selector}`
}
