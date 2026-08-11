import { describe, expect, it } from 'vitest'
import { analysisApp } from '../AnalysisApplicationService'
import {
  CancelAnalysisSession,
  CreateAnalysisSession,
  DeleteSession,
  IgnoreIssue,
  RestoreIgnoredIssue,
  ValidateSource,
} from './index'
import type { LayoutIssue } from '../../models/types'
import { MOBILE_VIEWPORT } from '../../models/types'

const source = {
  mode: 'markup' as const,
  url: '',
  html: '<main><p>Hello</p></main>',
  css: 'main { padding: 8px; }',
  name: 'usecase-fixture',
}

function sampleIssue(id = 'issue-1'): LayoutIssue {
  return {
    id,
    ruleId: 'missing-alt',
    type: 'missing-alt',
    severity: 'warning',
    title: 'Missing alt',
    description: 'Image missing alt',
    selector: 'img',
    elementPath: 'html > body > img',
    viewport: MOBILE_VIEWPORT,
    measuredValues: {},
    expectedValues: {},
    recommendation: 'Add alt text',
    confidence: 0.9,
    timestamp: new Date().toISOString(),
    lifecycle: 'open',
    issueKey: 'missing-alt::img::mobile',
    sourceFingerprint: 'fp-test',
  }
}

describe('application use cases', () => {
  it('ValidateSource accepts markup and rejects empty html', () => {
    const okResult = ValidateSource(analysisApp, source)
    expect(okResult.ok).toBe(true)
    const bad = ValidateSource(analysisApp, { ...source, html: '', css: '' })
    expect(bad.ok).toBe(false)
  })

  it('CreateAnalysisSession then CancelAnalysisSession', () => {
    CancelAnalysisSession(analysisApp)
    const created = CreateAnalysisSession(analysisApp, source, [MOBILE_VIEWPORT])
    expect(created.ok).toBe(true)
    const cancelled = CancelAnalysisSession(analysisApp)
    expect(cancelled.ok).toBe(true)
  })

  it('IgnoreIssue and RestoreIgnoredIssue round-trip', () => {
    CancelAnalysisSession(analysisApp)
    CreateAnalysisSession(analysisApp, source, [MOBILE_VIEWPORT])
    const issues = [sampleIssue()]
    const ignored = IgnoreIssue(analysisApp, issues, 'issue-1', 'accepted risk')
    expect(ignored.ok).toBe(true)
    if (!ignored.ok) return
    expect(ignored.value.issues[0]?.lifecycle).toBe('ignored')
    const restored = RestoreIgnoredIssue(analysisApp, ignored.value.issues, 'issue-1')
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.value.issues[0]?.lifecycle).toBe('open')
  })

  it('DeleteSession returns Result for unknown id without throwing', () => {
    const result = DeleteSession(analysisApp, 'missing-session-id')
    expect(result.ok).toBe(true)
  })
})
