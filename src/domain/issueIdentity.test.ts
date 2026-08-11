import { describe, expect, it } from 'vitest'
import {
  buildIgnoredIdentityKey,
  buildIssueIdentity,
  createStableIssueId,
  structuralIdentitySignature,
} from './issueIdentity'

describe('issue identity', () => {
  it('strips numeric measurement magnitudes for structural identity', () => {
    expect(structuralIdentitySignature('doc-overflow:42')).toBe('doc-overflow')
    expect(structuralIdentitySignature('doc-overflow:41.5')).toBe('doc-overflow')
    expect(structuralIdentitySignature('dup-id:header')).toBe('dup-id:header')
  })

  it('preserves issue id across fluctuating measurements', () => {
    const a = createStableIssueId({
      fingerprint: 'fp1',
      ruleId: 'horizontal-overflow',
      selector: 'html',
      measurementSignature: 'doc-overflow:120',
    })
    const b = createStableIssueId({
      fingerprint: 'fp1',
      ruleId: 'horizontal-overflow',
      selector: 'html',
      measurementSignature: 'doc-overflow:140',
    })
    expect(a).toBe(b)
  })

  it('changes identity when fingerprint or selector changes', () => {
    const base = buildIssueIdentity({
      fingerprint: 'fp1',
      ruleId: 'missing-alt',
      selector: 'img.hero',
      measurementSignature: 'missing-alt',
    })
    const otherFp = buildIssueIdentity({
      fingerprint: 'fp2',
      ruleId: 'missing-alt',
      selector: 'img.hero',
      measurementSignature: 'missing-alt',
    })
    const otherSel = buildIssueIdentity({
      fingerprint: 'fp1',
      ruleId: 'missing-alt',
      selector: 'img.other',
      measurementSignature: 'missing-alt',
    })
    expect(base).not.toBe(otherFp)
    expect(base).not.toBe(otherSel)
  })

  it('scopes ignore keys by fingerprint', () => {
    expect(
      buildIgnoredIdentityKey({
        fingerprint: 'site-a',
        ruleId: 'broken-link',
        selector: 'a.cta',
      }),
    ).toBe('site-a::broken-link::a.cta')
  })
})
