import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  analyzeDocument,
  detectBrokenLinks,
  detectInaccessibleControls,
  detectMissingAlt,
  detectHorizontalOverflow,
  detectSmallTouchTargets,
} from './analyzer'
import { buildSrcDoc, validateMarkup, validateUrl } from './validation'
import {
  validateViewportDimensions,
  switchOrientation,
  applyPreset,
} from './viewportUtils'
import { calculateHealthScore, sortIssuesBySeverityThenDom, scoreLabel } from './scoring'
import {
  applyIgnoredState,
  dedupeIssues,
  groupIssuesAcrossViewports,
  ignoreIssue,
} from './issueLifecycle'
import { getCssSelector, getElementPath, buildIssueKey } from './selectors'
import {
  createReport,
  exportReportHtml,
  exportReportJson,
  createSession,
  saveSession,
  loadSessions,
  finalizeSessionStatus,
  buildViewportResult,
} from './reports'
import type { LayoutIssue } from '../models/types'
import { MOBILE_VIEWPORT, TABLET_VIEWPORT, DESKTOP_VIEWPORT, PREDEFINED_VIEWPORTS } from '../models/types'

function makeDoc(html: string, css = ''): Document {
  return new DOMParser().parseFromString(buildSrcDoc(html, css), 'text/html')
}

function issue(partial: Partial<LayoutIssue> & Pick<LayoutIssue, 'ruleId' | 'selector' | 'severity' | 'type'>): LayoutIssue {
  const viewport = MOBILE_VIEWPORT
  return {
    id: partial.id ?? `i-${Math.random()}`,
    ruleId: partial.ruleId,
    type: partial.type,
    severity: partial.severity,
    title: partial.title ?? partial.type,
    description: partial.description ?? 'desc',
    selector: partial.selector,
    elementPath: partial.elementPath ?? partial.selector,
    viewport: partial.viewport ?? viewport,
    measuredValues: {},
    expectedValues: {},
    recommendation: partial.recommendation ?? 'fix',
    confidence: 0.9,
    timestamp: new Date().toISOString(),
    lifecycle: partial.lifecycle ?? 'open',
    issueKey:
      partial.issueKey ??
      buildIssueKey(partial.ruleId, partial.selector, (partial.viewport ?? viewport).id),
  }
}

describe('viewport validation', () => {
  it('rejects out-of-range dimensions', () => {
    expect(validateViewportDimensions(100, 800).valid).toBe(false)
    expect(validateViewportDimensions(375, 100).valid).toBe(false)
    expect(validateViewportDimensions(375, 812).valid).toBe(true)
    expect(validateViewportDimensions(3840, 2160).valid).toBe(true)
  })

  it('switches orientation by swapping sides', () => {
    const mobile = MOBILE_VIEWPORT
    const landscape = switchOrientation(mobile, 'landscape')
    expect(landscape.viewport.width).toBe(mobile.height)
    expect(landscape.viewport.height).toBe(mobile.width)
    const back = switchOrientation(landscape.viewport, 'portrait')
    expect(back.viewport.width).toBe(mobile.width)
  })

  it('applies presets with orientation', () => {
    const preset = applyPreset(TABLET_VIEWPORT, 'landscape')
    expect(preset.width).toBe(1024)
    expect(preset.height).toBe(768)
  })
})

describe('scoring and sorting', () => {
  it('calculates health score with caps and labels', () => {
    const issues = [
      issue({ ruleId: 'a', selector: '#a', severity: 'critical', type: 'missing-alt' }),
      issue({ ruleId: 'a', selector: '#a', severity: 'critical', type: 'missing-alt', viewport: TABLET_VIEWPORT }),
      issue({ ruleId: 'b', selector: '#b', severity: 'warning', type: 'overlapping' }),
      issue({ ruleId: 'c', selector: '#c', severity: 'info', type: 'broken-link' }),
    ]
    const result = calculateHealthScore(issues)
    // one critical (15) + warning (5) + info (1) = 79
    expect(result.score).toBe(79)
    expect(scoreLabel(result.score)).toBe('Good')
  })

  it('sorts critical before warning before info then DOM', () => {
    const issues = [
      issue({
        ruleId: 'i',
        selector: 'b',
        severity: 'info',
        type: 'broken-link',
        boundingRect: { top: 10, left: 0, width: 1, height: 1 },
      }),
      issue({
        ruleId: 'c',
        selector: 'a',
        severity: 'critical',
        type: 'missing-alt',
        boundingRect: { top: 50, left: 0, width: 1, height: 1 },
      }),
      issue({
        ruleId: 'w',
        selector: 'c',
        severity: 'warning',
        type: 'overlapping',
        boundingRect: { top: 5, left: 0, width: 1, height: 1 },
      }),
    ]
    const sorted = sortIssuesBySeverityThenDom(issues)
    expect(sorted[0]?.severity).toBe('critical')
    expect(sorted[1]?.severity).toBe('warning')
    expect(sorted[2]?.severity).toBe('info')
  })
})

describe('issue dedupe and grouping', () => {
  it('dedupes by issueKey', () => {
    const a = issue({ ruleId: 'r', selector: '#x', severity: 'warning', type: 'fixed-width' })
    const b = { ...a, id: 'other' }
    expect(dedupeIssues([a, b])).toHaveLength(1)
  })

  it('groups across viewports', () => {
    const issues = [
      issue({ ruleId: 'r', selector: '#x', severity: 'warning', type: 'fixed-width', viewport: MOBILE_VIEWPORT }),
      issue({ ruleId: 'r', selector: '#x', severity: 'warning', type: 'fixed-width', viewport: TABLET_VIEWPORT }),
    ]
    const grouped = groupIssuesAcrossViewports(issues, PREDEFINED_VIEWPORTS.slice(0, 2))
    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.affectedViewports).toHaveLength(2)
    expect(grouped[0]?.occursEverywhere).toBe(true)
    expect(grouped[0]?.firstFailingViewport).toBe('mobile')
  })
})

describe('selectors', () => {
  it('prefers unique ids and builds paths', () => {
    const doc = makeDoc('<div id="hero" class="banner">Hi</div>')
    const el = doc.querySelector('#hero')!
    expect(getCssSelector(el)).toBe('#hero')
    expect(getElementPath(el)).toContain('hero')
  })

  it('uses data-testid when present', () => {
    const doc = makeDoc('<button data-testid="save-btn">Save</button>')
    const el = doc.querySelector('button')!
    expect(getCssSelector(el)).toContain('data-testid')
  })
})

describe('source validation', () => {
  it('validates urls and markup', () => {
    expect(validateUrl('https://example.com').valid).toBe(true)
    expect(validateUrl('nope').valid).toBe(false)
    expect(validateMarkup('', '').valid).toBe(false)
    expect(validateMarkup('<div/>', '').valid).toBe(true)
  })
})

describe('ignored issue persistence', () => {
  it('preserves ignored state by cross-viewport key', () => {
    const base = [
      issue({ ruleId: 'r', selector: '#x', severity: 'info', type: 'broken-link' }),
    ]
    const { ignoredKeys } = ignoreIssue(base, base[0]!.id, 'accepted')
    const nextRun = [
      issue({
        ruleId: 'r',
        selector: '#x',
        severity: 'info',
        type: 'broken-link',
        viewport: TABLET_VIEWPORT,
      }),
    ]
    const applied = applyIgnoredState(nextRun, ignoredKeys)
    expect(applied[0]?.lifecycle).toBe('ignored')
    expect(applied[0]?.ignoreReason).toBe('accepted')
  })
})

describe('detection rules', () => {
  it('detects missing alt, broken links, inaccessible controls', () => {
    const doc = makeDoc(`
      <img src="a.png" />
      <a href="#">x</a>
      <input id="email" type="email" />
      <button></button>
      <div id="dup"></div><span id="dup"></span>
    `)
    const vp = MOBILE_VIEWPORT
    expect(detectMissingAlt(doc, vp).length).toBeGreaterThan(0)
    expect(detectBrokenLinks(doc, vp).length).toBeGreaterThan(0)
    expect(detectInaccessibleControls(doc, vp).length).toBeGreaterThan(0)
  })

  it('detects document overflow', () => {
    const doc = makeDoc('<div>wide</div>')
    Object.defineProperty(doc.documentElement, 'scrollWidth', { configurable: true, get: () => 2000 })
    Object.defineProperty(doc.body!, 'scrollWidth', { configurable: true, get: () => 2000 })
    const issues = detectHorizontalOverflow(doc, MOBILE_VIEWPORT)
    expect(issues.some((i) => i.ruleId === 'horizontal-overflow')).toBe(true)
    expect(Number(issues[0]?.measuredValues.overflowPx)).toBeGreaterThan(0)
  })

  it('analyzeDocument returns LayoutIssue shape', () => {
    const doc = makeDoc('<img src="x.png" /><a href="#"></a>')
    const result = analyzeDocument(doc, { viewport: MOBILE_VIEWPORT })
    expect(result.accessible).toBe(true)
    expect(result.healthScore).toBeDefined()
    expect(result.issues[0]?.ruleId).toBeTruthy()
    expect(result.issues[0]?.issueKey).toContain('::')
    expect(result.issues[0]?.elementPath).toBeTruthy()
  })
})

describe('sessions and reports', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('creates and exports reports', () => {
    const report = createReport({
      sourceName: 'Demo',
      sourceMode: 'markup',
      viewport: MOBILE_VIEWPORT,
      issues: [
        issue({ ruleId: 'a11y.missing-alt', selector: 'img', severity: 'critical', type: 'missing-alt' }),
      ],
    })
    expect(exportReportJson(report)).toContain('missing-alt')
    expect(exportReportHtml(report)).toContain('Health score')
  })

  it('saves sessions to localStorage', () => {
    const session = createSession({
      name: 'Demo',
      source: { mode: 'markup', url: '', html: '<p>x</p>', css: '', name: 'Demo' },
      selectedViewports: PREDEFINED_VIEWPORTS,
      status: 'Completed',
      issues: [],
    })
    saveSession(session)
    expect(loadSessions()[0]?.id).toBe(session.id)
  })

  it('finalizes multi-viewport status', () => {
    const ok = buildViewportResult(MOBILE_VIEWPORT, [], null, 'success')
    const bad = buildViewportResult(TABLET_VIEWPORT, [], null, 'failed')
    expect(finalizeSessionStatus([ok, ok])).toBe('Completed')
    expect(finalizeSessionStatus([ok, bad])).toBe('Completed with errors')
    expect(finalizeSessionStatus([bad, bad])).toBe('Failed')
  })
})

describe('touch targets mobile only', () => {
  it('skips desktop viewport', () => {
    const doc = makeDoc('<button id="tiny">Go</button>')
    const el = doc.getElementById('tiny') as HTMLElement
    el.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 20, height: 18, right: 20, bottom: 18, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    const original = window.getComputedStyle
    window.getComputedStyle = ((element: Element) => {
      const style = original.call(window, element)
      if (element !== el) return style
      return new Proxy(style, {
        get(target, prop, receiver) {
          if (prop === 'display') return 'inline-block'
          if (prop === 'visibility') return 'visible'
          if (prop === 'opacity') return '1'
          return Reflect.get(target, prop, receiver)
        },
      })
    }) as typeof window.getComputedStyle
    expect(detectSmallTouchTargets(doc, DESKTOP_VIEWPORT).length).toBe(0)
    expect(detectSmallTouchTargets(doc, MOBILE_VIEWPORT).length).toBeGreaterThan(0)
    window.getComputedStyle = original
  })
})
