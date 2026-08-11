import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  detectBrokenLinks,
  detectFixedWidths,
  detectHorizontalOverflow,
  detectMissingAlt,
  detectSmallTouchTargets,
  detectTextClipping,
  analyzeDocument,
} from './analyzer'
import { buildSrcDoc, validateMarkup, validateUrl } from './validation'
import { rectsOverlap, getCssSelector, parsePx } from './domUtils'
import { createReport, exportReportHtml, exportReportJson } from './reports'
import type { ViewportSize } from '../models/types'
import { PREDEFINED_VIEWPORTS } from '../models/types'

const vp = PREDEFINED_VIEWPORTS[0]

function makeDoc(html: string, css = ''): Document {
  const src = buildSrcDoc(html, css)
  return new DOMParser().parseFromString(src, 'text/html')
}

function stubRect(el: Element, width: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
}

function stubVisibleStyle(el: Element, overrides: Record<string, string>): () => void {
  const original = window.getComputedStyle
  window.getComputedStyle = ((element: Element) => {
    const style = original.call(window, element)
    if (element !== el) return style
    return new Proxy(style, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && prop in overrides) return overrides[prop]
        if (prop === 'getPropertyValue') {
          return (name: string) => overrides[name] ?? target.getPropertyValue(name)
        }
        return Reflect.get(target, prop, receiver)
      },
    })
  }) as typeof window.getComputedStyle
  return () => {
    window.getComputedStyle = original
  }
}

describe('validation', () => {
  it('rejects empty and invalid URLs', () => {
    expect(validateUrl('').valid).toBe(false)
    expect(validateUrl('https://example.com').valid).toBe(true)
  })

  it('requires markup content', () => {
    expect(validateMarkup('', '').valid).toBe(false)
    expect(validateMarkup('<div></div>', '').valid).toBe(true)
  })
})

describe('domUtils', () => {
  it('parses px values and overlap', () => {
    expect(parsePx('12px')).toBe(12)
    expect(
      rectsOverlap(
        { top: 0, left: 0, width: 100, height: 100 },
        { top: 50, left: 50, width: 100, height: 100 },
      ),
    ).toBe(true)
  })

  it('builds selectors with ids', () => {
    const doc = makeDoc('<div id="hero">Hello</div>')
    expect(getCssSelector(doc.querySelector('#hero')!)).toBe('#hero')
  })
})

describe('analyzer checks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects missing alt attributes', () => {
    const doc = makeDoc('<img src="a.png" /><img src="b.png" alt="ok" />')
    expect(detectMissingAlt(doc, vp)).toHaveLength(1)
  })

  it('detects empty and javascript links', () => {
    const doc = makeDoc('<a href="#">A</a><a href="javascript:void(0)">B</a><a href="/ok">C</a>')
    const issues = detectBrokenLinks(doc, vp)
    expect(issues.length).toBeGreaterThanOrEqual(2)
  })

  it('detects text clipping', () => {
    const doc = makeDoc('<p id="clip">Hello clipped text content</p>')
    const el = doc.getElementById('clip') as HTMLElement
    Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => 200 })
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 40 })
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 20 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 20 })
    stubRect(el, 40, 20)
    const restore = stubVisibleStyle(el, {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      overflow: 'hidden',
      overflowX: 'hidden',
      overflowY: 'visible',
      textOverflow: 'ellipsis',
      height: 'auto',
    })
    expect(detectTextClipping(doc, vp).some((i) => i.type === 'text-clipping')).toBe(true)
    restore()
  })

  it('detects horizontal overflow from scrollWidth', () => {
    const doc = makeDoc('<div id="wide">wide</div>')
    Object.defineProperty(doc.documentElement, 'scrollWidth', { configurable: true, get: () => 2000 })
    Object.defineProperty(doc.body!, 'scrollWidth', { configurable: true, get: () => 2000 })
    expect(
      detectHorizontalOverflow(doc, vp).some((i) => i.ruleId === 'horizontal-overflow.document'),
    ).toBe(true)
  })

  it('detects large fixed widths', () => {
    const doc = makeDoc('<div id="box" style="width: 1200px">x</div>')
    const el = doc.getElementById('box') as HTMLElement
    stubRect(el, 1200, 40)
    const restore = stubVisibleStyle(el, {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      width: '1200px',
      maxWidth: 'none',
    })
    expect(detectFixedWidths(doc, vp).some((i) => i.type === 'fixed-width')).toBe(true)
    restore()
  })

  it('detects small touch targets', () => {
    const doc = makeDoc('<button id="tiny">Go</button>')
    const el = doc.getElementById('tiny') as HTMLElement
    stubRect(el, 20, 18)
    const restore = stubVisibleStyle(el, {
      display: 'inline-block',
      visibility: 'visible',
      opacity: '1',
    })
    expect(detectSmallTouchTargets(doc, vp).some((i) => i.type === 'small-touch-target')).toBe(true)
    restore()
  })

  it('analyzeDocument returns accessible result with body', () => {
    const doc = makeDoc('<p>Hello</p><img src="x.png" />')
    const result = analyzeDocument(doc, { viewportWidth: 375, viewportHeight: 812 })
    expect(result.accessible).toBe(true)
    expect(result.issues.some((i) => i.type === 'missing-alt')).toBe(true)
    expect(result.healthScore).toBeDefined()
  })
})

describe('reports', () => {
  const viewport: ViewportSize = PREDEFINED_VIEWPORTS[0]

  it('creates JSON and HTML exports', () => {
    const report = createReport({
      sourceName: 'Demo',
      sourceMode: 'markup',
      viewport,
      issues: [
        {
          id: '1',
          ruleId: 'a11y.missing-alt',
          type: 'missing-alt',
          severity: 'critical',
          title: 'Missing Alt Attribute',
          description: 'Missing alt',
          selector: 'img',
          elementPath: 'img',
          viewport,
          measuredValues: {},
          expectedValues: {},
          recommendation: 'Add alt text',
          confidence: 0.9,
          timestamp: new Date().toISOString(),
          lifecycle: 'open',
          issueKey: 'a11y.missing-alt::img::mobile',
        },
      ],
    })
    expect(exportReportJson(report)).toContain('"missing-alt"')
    expect(exportReportHtml(report)).toContain('Layout Test Report')
  })
})
