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

function stubVisibleStyle(
  el: Element,
  overrides: Record<string, string>,
): () => void {
  const original = window.getComputedStyle
  window.getComputedStyle = ((element: Element) => {
    const style = original.call(window, element)
    if (element !== el) return style
    return new Proxy(style, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && prop in overrides) {
          return overrides[prop]
        }
        if (prop === 'getPropertyValue') {
          return (name: string) =>
            overrides[name] ?? target.getPropertyValue(name)
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
    expect(validateUrl('ftp://example.com').valid).toBe(false)
    expect(validateUrl('not a url').valid).toBe(false)
    expect(validateUrl('https://example.com').valid).toBe(true)
  })

  it('requires markup content', () => {
    expect(validateMarkup('', '').valid).toBe(false)
    expect(validateMarkup('<div></div>', '').valid).toBe(true)
  })

  it('builds srcdoc with injected CSS', () => {
    const doc = buildSrcDoc('<p class="x">Hi</p>', '.x { color: red; }')
    expect(doc).toContain('.x { color: red; }')
    expect(doc).toContain('<p class="x">Hi</p>')
  })
})

describe('domUtils', () => {
  it('parses px values', () => {
    expect(parsePx('12px')).toBe(12)
    expect(parsePx('auto')).toBe(0)
  })

  it('detects overlapping rects', () => {
    expect(
      rectsOverlap(
        { top: 0, left: 0, width: 100, height: 100 },
        { top: 50, left: 50, width: 100, height: 100 },
      ),
    ).toBe(true)
    expect(
      rectsOverlap(
        { top: 0, left: 0, width: 10, height: 10 },
        { top: 50, left: 50, width: 10, height: 10 },
      ),
    ).toBe(false)
  })

  it('builds selectors with ids', () => {
    const doc = makeDoc('<div id="hero">Hello</div>')
    const el = doc.querySelector('#hero')!
    expect(getCssSelector(el)).toBe('#hero')
  })
})

describe('analyzer checks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects missing alt attributes', () => {
    const doc = makeDoc('<img src="a.png" /><img src="b.png" alt="ok" />')
    const issues = detectMissingAlt(doc)
    expect(issues.some((i) => i.type === 'missing-alt')).toBe(true)
    expect(issues).toHaveLength(1)
  })

  it('detects empty and javascript links', () => {
    const doc = makeDoc('<a href="#">A</a><a href="javascript:void(0)">B</a><a href="/ok">C</a>')
    const issues = detectBrokenLinks(doc)
    expect(issues.length).toBeGreaterThanOrEqual(2)
    expect(issues.some((i) => i.severity === 'info')).toBe(true)
    expect(issues.some((i) => i.severity === 'warning')).toBe(true)
  })

  it('detects text clipping when overflow hidden and content wider', () => {
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
    })

    const issues = detectTextClipping(doc)
    restore()
    expect(issues.some((i) => i.type === 'text-clipping')).toBe(true)
  })

  it('detects horizontal overflow from scrollWidth', () => {
    const doc = makeDoc('<div id="wide">wide</div>', '#wide { width: 2000px; }')
    Object.defineProperty(doc.documentElement, 'scrollWidth', {
      configurable: true,
      get: () => 2000,
    })
    Object.defineProperty(doc.body!, 'scrollWidth', {
      configurable: true,
      get: () => 2000,
    })
    const issues = detectHorizontalOverflow(doc, 375)
    expect(issues.some((i) => i.type === 'horizontal-overflow' && i.selector === 'html')).toBe(
      true,
    )
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
    })

    const issues = detectFixedWidths(doc, 375)
    restore()
    expect(issues.some((i) => i.type === 'fixed-width')).toBe(true)
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

    const issues = detectSmallTouchTargets(doc, 44)
    restore()
    expect(issues.some((i) => i.type === 'small-touch-target')).toBe(true)
  })

  it('analyzeDocument returns accessible result with body', () => {
    const doc = makeDoc('<p>Hello</p><img src="x.png" />')
    const result = analyzeDocument(doc, { viewportWidth: 375, viewportHeight: 812 })
    expect(result.accessible).toBe(true)
    expect(result.issues.some((i) => i.type === 'missing-alt')).toBe(true)
  })
})

describe('reports', () => {
  const viewport: ViewportSize = {
    id: 'mobile',
    name: 'Mobile',
    width: 375,
    height: 812,
  }

  it('creates JSON and HTML exports', () => {
    const report = createReport({
      sourceName: 'Demo',
      sourceMode: 'markup',
      viewport,
      issues: [
        {
          id: '1',
          type: 'missing-alt',
          severity: 'critical',
          selector: 'img',
          explanation: 'Missing alt',
          recommendation: 'Add alt text',
        },
      ],
    })

    const json = exportReportJson(report)
    expect(json).toContain('"missing-alt"')
    const html = exportReportHtml(report)
    expect(html).toContain('Layout Test Report')
    expect(html).toContain('Missing alt')
    expect(html).toContain('Add alt text')
  })
})
