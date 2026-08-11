import { describe, expect, it } from 'vitest'
import { buildSrcDoc } from '../../engine/validation'
import { BUILTIN_RULES, duplicateIdRule, invalidAriaRule, unlabelledControlRule } from './builtinRules'
import { DEFAULT_RULE_LIMITS, type RuleContext } from './types'
import { MOBILE_VIEWPORT } from '../../models/types'

function ctx(html: string, css = ''): RuleContext {
  const doc = new DOMParser().parseFromString(buildSrcDoc(html, css), 'text/html')
  return {
    document: doc,
    viewport: MOBILE_VIEWPORT,
    sourceFingerprint: 'fixture',
    capabilities: {
      previewAvailable: true,
      domInspectionAvailable: true,
      screenshotAvailable: true,
    },
    limits: DEFAULT_RULE_LIMITS,
  }
}

describe('split accessibility rules', () => {
  it('detects duplicate ids', () => {
    const result = duplicateIdRule.evaluate(ctx('<div id="dup"></div><span id="dup"></span>'))
    expect(result.status).toBe('completed')
    expect(result.issues.some((i) => i.title.includes('Duplicate'))).toBe(true)
  })

  it('detects invalid ARIA references', () => {
    const result = invalidAriaRule.evaluate(ctx('<input aria-labelledby="missing-label" />'))
    expect(result.issues.some((i) => i.title.includes('ARIA'))).toBe(true)
  })

  it('detects unlabelled controls and ignores labelled ones', () => {
    const broken = unlabelledControlRule.evaluate(ctx('<input type="text" />'))
    expect(broken.issues.length).toBeGreaterThan(0)
    const ok = unlabelledControlRule.evaluate(
      ctx('<label for="n">Name</label><input id="n" type="text" />'),
    )
    expect(ok.issues.length).toBe(0)
  })

  it('registers 18 builtin rules', () => {
    expect(BUILTIN_RULES.length).toBe(18)
  })
})
