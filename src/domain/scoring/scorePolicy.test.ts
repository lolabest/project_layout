import { describe, expect, it } from 'vitest'
import { calculateCoverage } from '../coverage'
import { fingerprintMarkup, fingerprintUrl } from '../fingerprint'
import { calculateScore, scoreLabel, SCORING_POLICY_VERSION } from './scorePolicy'

describe('score policy', () => {
  it('deduplicates cross-viewport repeats and applies confidence weighting', () => {
    const result = calculateScore([
      {
        ruleId: 'missing-alt',
        selector: 'img',
        severity: 'critical',
        confidence: 1,
        category: 'accessibility',
        lifecycle: 'Open',
      },
      {
        ruleId: 'missing-alt',
        selector: 'img',
        severity: 'critical',
        confidence: 1,
        category: 'accessibility',
        lifecycle: 'Open',
      },
      {
        ruleId: 'broken-link',
        selector: 'a',
        severity: 'info',
        confidence: 1,
        category: 'links',
        lifecycle: 'Open',
      },
    ])
    // one critical 15 + one info 1 = 84
    expect(result.finalScore).toBe(84)
    expect(result.policyVersion).toBe(SCORING_POLICY_VERSION)
    expect(result.label).toBe(scoreLabel(84))
    expect(result.lines).toHaveLength(2)
    expect(result.disclaimer).toMatch(/not a formal accessibility/i)
  })

  it('excludes ignored issues and clamps to 0–100', () => {
    const ignored = calculateScore([
      {
        ruleId: 'x',
        selector: '#a',
        severity: 'critical',
        confidence: 1,
        category: 'overflow',
        lifecycle: 'Ignored',
      },
    ])
    expect(ignored.finalScore).toBe(100)

    const many = calculateScore(
      Array.from({ length: 20 }, (_, i) => ({
        ruleId: `r${i}`,
        selector: `#e${i}`,
        severity: 'critical' as const,
        confidence: 1,
        category: 'overflow' as const,
        lifecycle: 'Open' as const,
      })),
    )
    expect(many.finalScore).toBe(0)
  })
})

describe('coverage', () => {
  it('warns when coverage is low', () => {
    const result = calculateCoverage({
      applicableRules: 10,
      executedRules: 4,
      skippedRules: 4,
      failedRules: 2,
      domAccessible: true,
      stabilizationTimedOut: false,
    })
    expect(result.percent).toBeLessThan(70)
    expect(result.warning).toMatch(/health score may not represent/i)
  })

  it('returns 0 when DOM inaccessible', () => {
    const result = calculateCoverage({
      applicableRules: 10,
      executedRules: 0,
      skippedRules: 0,
      failedRules: 0,
      domAccessible: false,
      stabilizationTimedOut: false,
    })
    expect(result.percent).toBe(0)
    expect(result.warning).toBeTruthy()
  })
})

describe('fingerprinting', () => {
  it('is stable for normalized markup and URLs', () => {
    expect(fingerprintMarkup('<div>  a </div>', '.x{color:red}')).toBe(
      fingerprintMarkup('<div> a </div>', '.x{color:red}'),
    )
    expect(fingerprintUrl('https://Example.com/path/')).toBe(
      fingerprintUrl('https://example.com/path'),
    )
    expect(fingerprintUrl('https://a.com')).not.toBe(fingerprintUrl('https://b.com'))
  })
})
