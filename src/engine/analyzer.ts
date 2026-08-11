import type {
  AnalysisResult,
  DetectedIssue,
  IssueType,
  Severity,
} from '../models/types'
import { createId, getCssSelector, isVisible, parsePx, rectsOverlap } from './domUtils'

const SKIP_TAGS = new Set([
  'HTML',
  'HEAD',
  'SCRIPT',
  'STYLE',
  'META',
  'LINK',
  'TITLE',
  'NOSCRIPT',
  'BR',
  'WBR',
])

const INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'])

interface AnalyzerOptions {
  viewportWidth: number
  viewportHeight: number
  minTouchTarget?: number
  fixedWidthThreshold?: number
}

function getView(doc: Document): Window | null {
  return doc.defaultView ?? (typeof window !== 'undefined' ? window : null)
}

function computedStyle(doc: Document, el: Element): CSSStyleDeclaration | null {
  const view = getView(doc)
  if (!view) return null
  try {
    return view.getComputedStyle(el)
  } catch {
    return null
  }
}

function issue(
  type: IssueType,
  severity: Severity,
  element: Element,
  explanation: string,
  recommendation: string,
): DetectedIssue {
  const rect = element.getBoundingClientRect()
  return {
    id: createId('issue'),
    type,
    severity,
    selector: getCssSelector(element),
    explanation,
    recommendation,
    tagName: element.tagName.toLowerCase(),
    boundingRect: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
  }
}

function collectElements(doc: Document): Element[] {
  return Array.from(doc.body?.querySelectorAll('*') ?? []).filter(
    (el) => !SKIP_TAGS.has(el.tagName),
  )
}

export function detectHorizontalOverflow(
  doc: Document,
  viewportWidth: number,
): DetectedIssue[] {
  const issues: DetectedIssue[] = []
  const scrollWidth = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0)

  if (scrollWidth > viewportWidth + 1) {
    issues.push({
      id: createId('issue'),
      type: 'horizontal-overflow',
      severity: 'critical',
      selector: 'html',
      explanation: `Page content width (${scrollWidth}px) exceeds the viewport width (${viewportWidth}px), causing horizontal scrolling.`,
      recommendation:
        'Use fluid widths (%, max-width, clamp), avoid fixed large widths, and ensure containers can shrink on smaller viewports.',
      boundingRect: { top: 0, left: 0, width: scrollWidth, height: 20 },
      tagName: 'html',
    })
  }

  for (const el of collectElements(doc)) {
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue
    const rect = el.getBoundingClientRect()
    if (rect.right > viewportWidth + 2 && rect.width > 8) {
      issues.push(
        issue(
          'horizontal-overflow',
          'warning',
          el,
          `Element extends ${Math.round(rect.right - viewportWidth)}px past the right edge of the viewport.`,
          'Reduce width, use max-width: 100%, or adjust layout so content fits within the viewport.',
        ),
      )
    }
  }

  return issues
}

export function detectOutsideViewport(
  doc: Document,
  viewportWidth: number,
  viewportHeight: number,
): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  for (const el of collectElements(doc)) {
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue

    const fullyOutside =
      rect.right < 0 ||
      rect.bottom < 0 ||
      rect.left > viewportWidth ||
      rect.top > viewportHeight + Math.min(viewportHeight, 2000)

    if (fullyOutside && style.position !== 'fixed') {
      issues.push(
        issue(
          'outside-viewport',
          'warning',
          el,
          'Element is positioned fully outside the visible viewport area.',
          'Check absolute/fixed positioning, transforms, and negative margins that push content off-screen unintentionally.',
        ),
      )
    }
  }

  return issues
}

export function detectOverlapping(doc: Document): DetectedIssue[] {
  const issues: DetectedIssue[] = []
  const candidates = collectElements(doc)
    .map((el) => {
      const style = computedStyle(doc, el)
      if (!style || !isVisible(el, style)) return null
      const rect = el.getBoundingClientRect()
      if (rect.width < 20 || rect.height < 20) return null
      if (style.position === 'static' && parsePx(style.zIndex) === 0) {
        // Still allow text containers
        if (!['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'BUTTON', 'LABEL'].includes(el.tagName)) {
          return null
        }
      }
      return { el, style, rect }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 80)

  const reported = new Set<string>()

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue

      const aRect = {
        top: a.rect.top,
        left: a.rect.left,
        width: a.rect.width,
        height: a.rect.height,
      }
      const bRect = {
        top: b.rect.top,
        left: b.rect.left,
        width: b.rect.width,
        height: b.rect.height,
      }

      if (!rectsOverlap(aRect, bRect, 10)) continue

      const key = [getCssSelector(a.el), getCssSelector(b.el)].sort().join('|')
      if (reported.has(key)) continue
      reported.add(key)

      issues.push(
        issue(
          'overlapping',
          'warning',
          a.el,
          `Element overlaps with ${getCssSelector(b.el)}.`,
          'Adjust positioning, z-index, spacing, or layout flow so interactive/text content does not obscure other elements.',
        ),
      )

      if (issues.length >= 25) return issues
    }
  }

  return issues
}

export function detectTextClipping(doc: Document): DetectedIssue[] {
  const issues: DetectedIssue[] = []
  const textElements = Array.from(
    doc.body?.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, li, label, button, td, th') ??
      [],
  )

  for (const el of textElements) {
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue
    const text = el.textContent?.trim() ?? ''
    if (text.length < 2) continue

    const overflowX = style.overflowX === 'hidden' || style.overflow === 'hidden'
    const overflowY = style.overflowY === 'hidden' || style.overflow === 'hidden'
    const isClipped =
      (overflowX && el.scrollWidth > el.clientWidth + 2) ||
      (overflowY && el.scrollHeight > el.clientHeight + 2) ||
      (style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 2)

    if (isClipped) {
      issues.push(
        issue(
          'text-clipping',
          'warning',
          el,
          'Text content appears clipped or truncated within its container.',
          'Increase container size, allow wrapping (white-space: normal), or use responsive typography so text remains readable.',
        ),
      )
    }
  }

  return issues
}

export function detectImageOverflow(doc: Document): DetectedIssue[] {
  const issues: DetectedIssue[] = []
  const images = Array.from(doc.images)

  for (const img of images) {
    const style = computedStyle(doc, img)
    if (!style || !isVisible(img, style)) continue
    const parent = img.parentElement
    if (!parent) continue
    const parentRect = parent.getBoundingClientRect()
    const imgRect = img.getBoundingClientRect()
    if (parentRect.width <= 0) continue

    if (imgRect.width > parentRect.width + 2) {
      issues.push(
        issue(
          'image-overflow',
          'warning',
          img,
          `Image is ${Math.round(imgRect.width - parentRect.width)}px wider than its container.`,
          'Set max-width: 100% and height: auto on images, or use object-fit with a constrained container.',
        ),
      )
    }
  }

  return issues
}

export function detectMissingAlt(doc: Document): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  for (const img of Array.from(doc.images)) {
    if (!img.hasAttribute('alt')) {
      issues.push(
        issue(
          'missing-alt',
          'critical',
          img,
          'Image is missing an alt attribute, which harms accessibility and SEO.',
          'Add a meaningful alt attribute describing the image, or alt="" for decorative images.',
        ),
      )
    }
  }

  return issues
}

export function detectBrokenImages(doc: Document): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  for (const img of Array.from(doc.images)) {
    const broken =
      img.complete &&
      (img.naturalWidth === 0 || img.naturalHeight === 0) &&
      Boolean(img.getAttribute('src'))

    if (broken) {
      issues.push(
        issue(
          'broken-image',
          'critical',
          img,
          `Image failed to load (src: ${img.getAttribute('src') ?? 'unknown'}).`,
          'Verify the image URL, path, and CORS/CDN availability. Provide a fallback image if needed.',
        ),
      )
    }
  }

  return issues
}

export function detectBrokenLinks(doc: Document): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  for (const anchor of Array.from(doc.querySelectorAll('a'))) {
    const href = anchor.getAttribute('href')
    if (href === null || href.trim() === '' || href.trim() === '#') {
      issues.push(
        issue(
          'broken-link',
          'info',
          anchor,
          'Anchor has an empty or placeholder href.',
          'Provide a valid destination URL, or use a button element for actions that are not navigation.',
        ),
      )
    } else if (/^(javascript:|void\(0\))/i.test(href.trim())) {
      issues.push(
        issue(
          'broken-link',
          'warning',
          anchor,
          'Anchor uses a javascript: or void href, which is fragile and inaccessible.',
          'Use a real URL or a button with an event handler instead of javascript: links.',
        ),
      )
    }
  }

  return issues
}

export function detectFixedWidths(
  doc: Document,
  viewportWidth: number,
  threshold = 0.9,
): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  for (const el of collectElements(doc)) {
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue

    const inlineWidth = (el as HTMLElement).style?.width ?? ''
    const widthAttr = el.getAttribute('width')
    const hasFixedInline =
      /^\d+px$/i.test(inlineWidth.trim()) ||
      (widthAttr !== null && /^\d+$/.test(widthAttr.trim()))

    const computedWidth = parsePx(style.width)
    if (!hasFixedInline && !(style.width.endsWith('px') && computedWidth > viewportWidth * threshold)) {
      continue
    }

    if (computedWidth > viewportWidth * threshold && computedWidth > 200) {
      issues.push(
        issue(
          'fixed-width',
          'warning',
          el,
          `Element uses a large fixed width (${Math.round(computedWidth)}px) that may break smaller viewports.`,
          'Prefer max-width, percentage, or clamp()-based widths so layouts adapt across breakpoints.',
        ),
      )
    }
  }

  return issues
}

export function detectSmallTouchTargets(
  doc: Document,
  minSize = 44,
): DetectedIssue[] {
  const issues: DetectedIssue[] = []
  const selectors = 'a, button, input, select, textarea, summary, [role="button"], [onclick]'

  for (const el of Array.from(doc.querySelectorAll(selectors))) {
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue
    if (!INTERACTIVE_TAGS.has(el.tagName) && !el.hasAttribute('onclick') && el.getAttribute('role') !== 'button') {
      continue
    }

    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0 && (rect.width < minSize || rect.height < minSize)) {
      issues.push(
        issue(
          'small-touch-target',
          'warning',
          el,
          `Interactive element is ${Math.round(rect.width)}×${Math.round(rect.height)}px; recommended minimum is ${minSize}×${minSize}px.`,
          'Increase padding or min-width/min-height so touch targets meet accessibility guidelines (≈44×44px).',
        ),
      )
    }
  }

  return issues
}

/** Run all layout checks against a same-origin document. */
export function analyzeDocument(
  doc: Document,
  options: AnalyzerOptions,
): AnalysisResult {
  const { viewportWidth, viewportHeight, minTouchTarget = 44, fixedWidthThreshold = 0.9 } =
    options

  if (!doc.body) {
    return {
      issues: [],
      analyzedAt: new Date().toISOString(),
      accessible: false,
      errorMessage: 'Document body is not available for analysis.',
    }
  }

  const issues: DetectedIssue[] = [
    ...detectHorizontalOverflow(doc, viewportWidth),
    ...detectOutsideViewport(doc, viewportWidth, viewportHeight),
    ...detectOverlapping(doc),
    ...detectTextClipping(doc),
    ...detectImageOverflow(doc),
    ...detectMissingAlt(doc),
    ...detectBrokenImages(doc),
    ...detectBrokenLinks(doc),
    ...detectFixedWidths(doc, viewportWidth, fixedWidthThreshold),
    ...detectSmallTouchTargets(doc, minTouchTarget),
  ]

  const deduped = dedupeIssues(issues)

  return {
    issues: deduped,
    analyzedAt: new Date().toISOString(),
    accessible: true,
  }
}

function dedupeIssues(issues: DetectedIssue[]): DetectedIssue[] {
  const seen = new Set<string>()
  const result: DetectedIssue[] = []
  for (const item of issues) {
    const key = `${item.type}|${item.selector}|${item.explanation}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

export function countBySeverity(issues: DetectedIssue[]): Record<Severity, number> {
  return {
    critical: issues.filter((i) => i.severity === 'critical').length,
    warning: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
  }
}
