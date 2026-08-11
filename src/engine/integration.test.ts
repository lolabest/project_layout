import { beforeEach, describe, expect, it } from 'vitest'
import { analyzeDocument } from './analyzer'
import { buildSrcDoc, validateSource } from './validation'
import {
  createReport,
  createSession,
  exportReportHtml,
  exportReportJson,
  finalizeSessionStatus,
  buildViewportResult,
  loadSessions,
  saveSession,
  summarizeMultiViewport,
} from './reports'
import { applyTemporaryStyles, createStyleEditSession, undoLastChange } from './measurements'
import { computeIssueDelta, applyIgnoredState, ignoreIssue } from './issueLifecycle'
import { PREDEFINED_VIEWPORTS } from '../models/types'

const SAMPLE = buildSrcDoc(
  `<div class="wrap"><img src="missing.png" /><a href="#">Go</a><button class="tiny">x</button></div>`,
  `.wrap { width: 1400px; } .tiny { width: 20px; height: 16px; }`,
)

describe('integration flows', () => {
  beforeEach(() => localStorage.clear())

  it('pasted markup validates and analyses for a single viewport', () => {
    const source = {
      mode: 'markup' as const,
      url: '',
      html: '<div>Hi</div>',
      css: '',
      name: 't',
    }
    expect(validateSource(source).valid).toBe(true)
    const doc = new DOMParser().parseFromString(SAMPLE, 'text/html')
    const result = analyzeDocument(doc, { viewport: PREDEFINED_VIEWPORTS[0] })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.healthScore?.score).toBeLessThan(100)
  })

  it('run all viewports aggregates results and status', () => {
    const doc = new DOMParser().parseFromString(SAMPLE, 'text/html')
    const results = PREDEFINED_VIEWPORTS.map((vp) => {
      const analysis = analyzeDocument(doc, { viewport: vp })
      return buildViewportResult(vp, analysis.issues, null, 'success')
    })
    const summary = summarizeMultiViewport('sample', results)
    expect(summary.results).toHaveLength(4)
    expect(summary.groupedIssues.length).toBeGreaterThan(0)
    expect(finalizeSessionStatus(results)).toBe('Completed')
    expect(summary.overallHealthScore).toBeGreaterThanOrEqual(0)
  })

  it('temporary CSS session supports undo', () => {
    const doc = new DOMParser().parseFromString(
      buildSrcDoc('<div id="box">x</div>', ''),
      'text/html',
    )
    const el = doc.getElementById('box') as HTMLElement
    const session = createStyleEditSession()
    applyTemporaryStyles(el, { width: '100px' }, session)
    expect(el.style.width).toBe('100px')
    undoLastChange(doc, session)
    expect(el.style.width).toBe('')
  })

  it('issue selection delta and ignore persist across re-analysis identity', () => {
    const doc = new DOMParser().parseFromString(SAMPLE, 'text/html')
    const first = analyzeDocument(doc, { viewport: PREDEFINED_VIEWPORTS[0] }).issues
    const second = analyzeDocument(doc, { viewport: PREDEFINED_VIEWPORTS[0] }).issues
    const delta = computeIssueDelta(first, second)
    expect(delta.unchanged.length).toBeGreaterThan(0)
    const ignored = ignoreIssue(first, first[0].id, 'n/a')
    const applied = applyIgnoredState(second, ignored.ignoredKeys)
    expect(applied.some((i) => i.lifecycle === 'ignored')).toBe(true)
  })

  it('session restoration and export', () => {
    const doc = new DOMParser().parseFromString(SAMPLE, 'text/html')
    const issues = analyzeDocument(doc, { viewport: PREDEFINED_VIEWPORTS[0] }).issues
    const report = createReport({
      sourceName: 'Sample',
      sourceMode: 'markup',
      viewport: PREDEFINED_VIEWPORTS[0],
      issues,
    })
    const session = createSession({
      name: 'Sample',
      source: { mode: 'markup', url: '', html: '<div/>', css: '', name: 'Sample' },
      selectedViewports: [PREDEFINED_VIEWPORTS[0]],
      status: 'Completed',
      issues,
      report,
    })
    saveSession(session)
    const restored = loadSessions()[0]
    expect(restored.name).toBe('Sample')
    expect(exportReportJson(report)).toContain('Sample')
    expect(exportReportHtml(report)).toContain('Grouped Issues')
  })
})
