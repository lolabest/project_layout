import type {
  AnalysisResult,
  AnalyzerOptions,
  AppError,
  IssueType,
  LayoutIssue,
  Severity,
  ViewportSize,
} from '../models/types'
import { ISSUE_TYPE_LABELS } from '../models/types'
import { createId, isVisible, parsePx, rectsOverlap } from './domUtils'
import { dedupeIssues } from './issueLifecycle'
import { calculateHealthScore } from './scoring'
import { buildIssueKey, getCssSelector, getElementPath } from './selectors'

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
  'TEMPLATE',
])

const PRIORITY_TAGS = new Set([
  'A',
  'BUTTON',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'LABEL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'NAV',
  'P',
  'LI',
])

const OVERLAY_HINTS = /(modal|dialog|tooltip|dropdown|menu|popover|overlay|toast)/i

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

function collectElements(doc: Document, max: number): { elements: Element[]; truncated: boolean } {
  const all = Array.from(doc.body?.querySelectorAll('*') ?? []).filter(
    (el) => !SKIP_TAGS.has(el.tagName),
  )
  return { elements: all.slice(0, max), truncated: all.length > max }
}

function makeIssue(input: {
  ruleId: string
  type: IssueType
  severity: Severity
  element: Element
  viewport: ViewportSize
  description: string
  recommendation: string
  measuredValues?: LayoutIssue['measuredValues']
  expectedValues?: LayoutIssue['expectedValues']
  confidence?: number
  title?: string
}): LayoutIssue {
  const rect = input.element.getBoundingClientRect()
  const selector = getCssSelector(input.element)
  return {
    id: createId('issue'),
    ruleId: input.ruleId,
    type: input.type,
    severity: input.severity,
    title: input.title ?? ISSUE_TYPE_LABELS[input.type],
    description: input.description,
    selector,
    elementPath: getElementPath(input.element),
    viewport: input.viewport,
    measuredValues: input.measuredValues ?? {},
    expectedValues: input.expectedValues ?? {},
    recommendation: input.recommendation,
    confidence: input.confidence ?? 0.85,
    timestamp: new Date().toISOString(),
    lifecycle: 'open',
    issueKey: buildIssueKey(input.ruleId, selector, input.viewport.id),
    tagName: input.element.tagName.toLowerCase(),
    boundingRect: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
  }
}

function isScrollContainer(style: CSSStyleDeclaration): boolean {
  const ox = style.overflowX
  const oy = style.overflowY
  return (
    ox === 'auto' ||
    ox === 'scroll' ||
    oy === 'auto' ||
    oy === 'scroll' ||
    style.overflow === 'auto' ||
    style.overflow === 'scroll'
  )
}

function isDecorativeOverlay(el: Element, style: CSSStyleDeclaration): boolean {
  if (style.pointerEvents === 'none') return true
  if (OVERLAY_HINTS.test(el.className?.toString?.() ?? '') || OVERLAY_HINTS.test(el.id)) return true
  const role = el.getAttribute('role')
  if (role && OVERLAY_HINTS.test(role)) return true
  if (style.position === 'fixed' || style.position === 'sticky') {
    if ((el.getAttribute('aria-modal') === 'true') || role === 'dialog') return true
  }
  return false
}

function intentionallyOffscreen(style: CSSStyleDeclaration, rect: DOMRect): boolean {
  // Common screen-reader / responsive hide patterns
  if (style.position === 'absolute' && (rect.width <= 1 || rect.height <= 1)) return true
  if (parsePx(style.clip) > 0) return true
  const clipPath = style.clipPath || style.getPropertyValue('clip-path')
  if (clipPath && clipPath.includes('inset(50%)')) return true
  if (style.overflow === 'hidden' && (rect.width <= 1 || rect.height <= 1)) return true
  return false
}

export function detectHorizontalOverflow(
  doc: Document,
  viewport: ViewportSize,
): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const scrollWidth = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0)
  const overflowAmount = scrollWidth - viewport.width

  if (overflowAmount > 1) {
    issues.push({
      id: createId('issue'),
      ruleId: 'horizontal-overflow.document',
      type: 'horizontal-overflow',
      severity: 'critical',
      title: ISSUE_TYPE_LABELS['horizontal-overflow'],
      description: `Page content width (${scrollWidth}px) exceeds the viewport (${viewport.width}px) by ${Math.round(overflowAmount)}px, causing horizontal scrolling.`,
      selector: 'html',
      elementPath: 'html',
      viewport,
      measuredValues: { scrollWidth, overflowPx: overflowAmount, viewportWidth: viewport.width },
      expectedValues: { scrollWidth: viewport.width },
      recommendation:
        'Use fluid widths (%, max-width, clamp), avoid large fixed widths, and ensure containers shrink on smaller viewports.',
      confidence: 0.95,
      timestamp: new Date().toISOString(),
      lifecycle: 'open',
      issueKey: buildIssueKey('horizontal-overflow.document', 'html', viewport.id),
      tagName: 'html',
      boundingRect: { top: 0, left: 0, width: scrollWidth, height: 20 },
    })
  }

  const { elements } = collectElements(doc, 400)
  for (const el of elements) {
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue
    if (isScrollContainer(style)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    const over = rect.right - viewport.width
    if (over > 1) {
      issues.push(
        makeIssue({
          ruleId: 'horizontal-overflow.element',
          type: 'horizontal-overflow',
          severity: 'warning',
          element: el,
          viewport,
          description: `Element extends ${Math.round(over)}px past the right edge of the viewport.`,
          recommendation:
            'Reduce width, use max-width: 100%, or adjust layout so content fits within the viewport.',
          measuredValues: { right: rect.right, overflowPx: over, width: rect.width },
          expectedValues: { right: viewport.width },
          confidence: 0.9,
        }),
      )
    }
  }
  return issues
}

export function detectOutsideViewport(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const { elements } = collectElements(doc, 400)

  for (const el of elements) {
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    if (intentionallyOffscreen(style, rect)) continue

    const fullyOutside =
      rect.right < 0 || rect.left > viewport.width || rect.bottom < 0
    const partiallyOutsideX = rect.left < -1 || rect.right > viewport.width + 1

    if (fullyOutside && style.position !== 'fixed') {
      issues.push(
        makeIssue({
          ruleId: 'outside-viewport.full',
          type: 'outside-viewport',
          severity: 'warning',
          element: el,
          viewport,
          description: 'Element is positioned fully outside the visible viewport area.',
          recommendation:
            'Check absolute positioning, transforms, and negative margins that push content off-screen unintentionally.',
          measuredValues: { left: rect.left, right: rect.right, top: rect.top },
          expectedValues: { leftMin: 0, rightMax: viewport.width },
          confidence: 0.8,
        }),
      )
    } else if (partiallyOutsideX && rect.width > 8) {
      issues.push(
        makeIssue({
          ruleId: 'outside-viewport.partial',
          type: 'outside-viewport',
          severity: 'info',
          element: el,
          viewport,
          description: 'Element is partially outside the horizontal viewport bounds.',
          recommendation: 'Ensure important content remains fully visible at this viewport width.',
          measuredValues: { left: rect.left, right: rect.right },
          expectedValues: { leftMin: 0, rightMax: viewport.width },
          confidence: 0.7,
        }),
      )
    }
  }
  return issues
}

export function detectOverlapping(doc: Document, viewport: ViewportSize, maxElements = 120): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const { elements, truncated } = collectElements(doc, maxElements)

  type Cand = { el: Element; style: CSSStyleDeclaration; rect: DOMRect; priority: boolean }
  const candidates: Cand[] = []

  for (const el of elements) {
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue
    if (isDecorativeOverlay(el, style)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 16 || rect.height < 16) continue
    candidates.push({
      el,
      style,
      rect,
      priority: PRIORITY_TAGS.has(el.tagName) || el.getAttribute('role') === 'button',
    })
  }

  // Spatial buckets by 200px cells
  const cell = 200
  const buckets = new Map<string, number[]>()
  candidates.forEach((c, index) => {
    const x0 = Math.floor(c.rect.left / cell)
    const x1 = Math.floor(c.rect.right / cell)
    const y0 = Math.floor(c.rect.top / cell)
    const y1 = Math.floor(c.rect.bottom / cell)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x}:${y}`
        const list = buckets.get(key) ?? []
        list.push(index)
        buckets.set(key, list)
      }
    }
  })

  const reported = new Set<string>()
  const pairSeen = new Set<string>()

  for (const indices of buckets.values()) {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = candidates[indices[i]]
        const b = candidates[indices[j]]
        const pairKey = [indices[i], indices[j]].sort().join(':')
        if (pairSeen.has(pairKey)) continue
        pairSeen.add(pairKey)
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue
        if (!a.priority && !b.priority) continue

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
        if (!rectsOverlap(aRect, bRect, 12)) continue

        const key = [getCssSelector(a.el), getCssSelector(b.el)].sort().join('|')
        if (reported.has(key)) continue
        reported.add(key)

        const target = a.priority ? a.el : b.el
        const other = a.priority ? b.el : a.el
        issues.push(
          makeIssue({
            ruleId: 'overlapping.elements',
            type: 'overlapping',
            severity: 'warning',
            element: target,
            viewport,
            description: `Element overlaps with ${getCssSelector(other)}.`,
            recommendation:
              'Adjust positioning, z-index, spacing, or layout flow so interactive/text content does not obscure other elements.',
            measuredValues: { overlapMinPx: 12 },
            confidence: 0.75,
          }),
        )
        if (issues.length >= 30) {
          if (truncated) {
            /* caller handles truncated warning */
          }
          return issues
        }
      }
    }
  }

  return issues
}

export function detectTextClipping(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const textElements = Array.from(
    doc.body?.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, li, label, button, td, th') ??
      [],
  )

  for (const el of textElements) {
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue
    const text = el.textContent?.trim() ?? ''
    if (text.length < 2) continue

    const overflowHidden =
      style.overflowX === 'hidden' ||
      style.overflowY === 'hidden' ||
      style.overflow === 'hidden'
    const hasEllipsis = style.textOverflow === 'ellipsis'
    const clippedX = el.scrollWidth > el.clientWidth + 2
    const clippedY = el.scrollHeight > el.clientHeight + 2
    const fixedHeight = style.height.endsWith('px') && parsePx(style.height) > 0 && clippedY

    if ((overflowHidden && (clippedX || clippedY)) || fixedHeight || (hasEllipsis && clippedX)) {
      const intentionalEllipsis = hasEllipsis && clippedX && !clippedY
      issues.push(
        makeIssue({
          ruleId: 'text-clipping.content',
          type: 'text-clipping',
          severity: intentionalEllipsis ? 'info' : 'warning',
          element: el,
          viewport,
          description: intentionalEllipsis
            ? 'Text is truncated with ellipsis. Confirm this truncation is intentional.'
            : 'Text content appears clipped within its container due to overflow or fixed sizing.',
          recommendation:
            'Increase container size, allow wrapping, or use responsive typography so text remains readable.',
          measuredValues: {
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            textOverflow: style.textOverflow,
          },
          expectedValues: { fits: true },
          confidence: intentionalEllipsis ? 0.65 : 0.85,
        }),
      )
    }
  }
  return issues
}

export function detectImageOverflow(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  for (const img of Array.from(doc.images)) {
    const style = computedStyle(doc, img)
    if (!style || !isVisible(img, style)) continue
    const parent = img.parentElement
    if (!parent) continue
    const parentRect = parent.getBoundingClientRect()
    const imgRect = img.getBoundingClientRect()
    if (parentRect.width <= 0) continue

    const maxWidth = style.maxWidth
    const hasResponsive = maxWidth === '100%' || maxWidth.endsWith('%') || style.width === '100%'

    if (imgRect.width > parentRect.width + 2) {
      issues.push(
        makeIssue({
          ruleId: 'image-overflow.bounds',
          type: 'image-overflow',
          severity: 'warning',
          element: img,
          viewport,
          description: `Image is ${Math.round(imgRect.width - parentRect.width)}px wider than its container.`,
          recommendation:
            'Set max-width: 100% and height: auto on images, or use object-fit with a constrained container.',
          measuredValues: {
            imageWidth: imgRect.width,
            parentWidth: parentRect.width,
            naturalWidth: img.naturalWidth,
          },
          expectedValues: { imageWidthMax: parentRect.width },
          confidence: 0.9,
        }),
      )
    } else if (
      !hasResponsive &&
      img.naturalWidth > 0 &&
      img.naturalWidth > parentRect.width + 2 &&
      imgRect.width >= parentRect.width - 1
    ) {
      issues.push(
        makeIssue({
          ruleId: 'image-overflow.unconstrained',
          type: 'image-overflow',
          severity: 'info',
          element: img,
          viewport,
          description:
            'Image lacks responsive constraints and its natural width exceeds the container.',
          recommendation: 'Add max-width: 100%; height: auto to prevent overflow on smaller screens.',
          measuredValues: { naturalWidth: img.naturalWidth, parentWidth: parentRect.width },
          expectedValues: { maxWidth: '100%' },
          confidence: 0.7,
        }),
      )
    }
  }
  return issues
}

export function detectMissingAlt(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  for (const img of Array.from(doc.images)) {
    if (!img.hasAttribute('alt')) {
      issues.push(
        makeIssue({
          ruleId: 'a11y.missing-alt',
          type: 'missing-alt',
          severity: 'critical',
          element: img,
          viewport,
          description: 'Meaningful image is missing an alt attribute.',
          recommendation:
            'Add a meaningful alt attribute describing the image, or alt="" only for decorative images.',
          measuredValues: { hasAlt: false },
          expectedValues: { hasAlt: true },
          confidence: 0.95,
        }),
      )
    }
    // alt="" is decorative — intentionally not reported
  }
  return issues
}

export function detectBrokenImages(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  for (const img of Array.from(doc.images)) {
    const src = img.getAttribute('src')
    const broken = img.complete && (img.naturalWidth === 0 || img.naturalHeight === 0) && Boolean(src)
    if (broken) {
      issues.push(
        makeIssue({
          ruleId: 'a11y.broken-image',
          type: 'broken-image',
          severity: 'critical',
          element: img,
          viewport,
          description: `Image failed to load (src: ${src}).`,
          recommendation:
            'Verify the image URL and availability. Provide a fallback image if needed.',
          measuredValues: { naturalWidth: img.naturalWidth, complete: img.complete, src },
          expectedValues: { naturalWidthMin: 1 },
          confidence: 0.95,
        }),
      )
    }
  }
  return issues
}

export function detectBrokenLinks(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  for (const anchor of Array.from(doc.querySelectorAll('a'))) {
    const href = anchor.getAttribute('href')
    if (href === null || href.trim() === '' || href.trim() === '#') {
      issues.push(
        makeIssue({
          ruleId: 'links.empty',
          type: 'broken-link',
          severity: 'info',
          element: anchor,
          viewport,
          description: 'Anchor has an empty or placeholder href.',
          recommendation:
            'Provide a valid destination URL, or use a button for non-navigation actions.',
          measuredValues: { href: href ?? '' },
          expectedValues: { validHref: true },
          confidence: 0.9,
        }),
      )
    } else if (/^(javascript:|void\(0\))/i.test(href.trim())) {
      issues.push(
        makeIssue({
          ruleId: 'links.javascript',
          type: 'broken-link',
          severity: 'warning',
          element: anchor,
          viewport,
          description: 'Anchor uses a javascript: or void href.',
          recommendation: 'Use a real URL or a button with an event handler.',
          measuredValues: { href },
          expectedValues: { validHref: true },
          confidence: 0.9,
        }),
      )
    } else if (
      !href.startsWith('/') &&
      !href.startsWith('#') &&
      !href.startsWith('?') &&
      !href.startsWith('mailto:') &&
      !href.startsWith('tel:') &&
      !/^https?:\/\//i.test(href)
    ) {
      // malformed absolute-looking values
      try {
        // relative paths are fine
        if (href.includes('://')) {
          // invalid protocol cases
          issues.push(
            makeIssue({
              ruleId: 'links.malformed',
              type: 'broken-link',
              severity: 'warning',
              element: anchor,
              viewport,
              description: `Anchor href looks malformed: ${href}`,
              recommendation: 'Correct the URL scheme and destination.',
              measuredValues: { href },
              expectedValues: { validHref: true },
              confidence: 0.7,
            }),
          )
        }
      } catch {
        /* ignore */
      }
    }
  }
  return issues
}

export function detectFixedWidths(doc: Document, viewport: ViewportSize, threshold = 0.9): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const { elements } = collectElements(doc, 400)

  for (const el of elements) {
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue
    const tag = el.tagName
    if (['IMG', 'SVG', 'ICON', 'HR', 'I', 'SPAN'].includes(tag) && parsePx(style.width) < 96) {
      continue
    }

    const inlineWidth = (el as HTMLElement).style?.width ?? ''
    const widthAttr = el.getAttribute('width')
    const hasFixedInline =
      /^\d+px$/i.test(inlineWidth.trim()) || (widthAttr !== null && /^\d+$/.test(widthAttr.trim()))
    const computedWidth = parsePx(style.width)
    const isMaxWidthContainer = style.maxWidth.endsWith('px') && parsePx(style.maxWidth) === computedWidth

    if (isMaxWidthContainer && !hasFixedInline) continue
    if (
      !hasFixedInline &&
      !(style.width.endsWith('px') && computedWidth > viewport.width * threshold)
    ) {
      continue
    }

    if (computedWidth > viewport.width * threshold && computedWidth > 200) {
      issues.push(
        makeIssue({
          ruleId: 'fixed-width.risk',
          type: 'fixed-width',
          severity: 'warning',
          element: el,
          viewport,
          description: `Element uses a large fixed width (${Math.round(computedWidth)}px) that may break smaller viewports.`,
          recommendation:
            'Prefer max-width, percentage, or clamp()-based widths so layouts adapt across breakpoints.',
          measuredValues: { width: computedWidth, viewportWidth: viewport.width },
          expectedValues: { widthMaxRatio: threshold },
          confidence: 0.8,
        }),
      )
    }
  }
  return issues
}

export function detectSmallTouchTargets(doc: Document, viewport: ViewportSize, minSize = 44): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  // Mobile / tablet only
  if (viewport.width > 1024) return issues

  const selectors = 'a, button, input, select, textarea, summary, [role="button"], [onclick]'
  const seen = new Set<Element>()

  for (const el of Array.from(doc.querySelectorAll(selectors))) {
    if (seen.has(el)) continue
    // Skip nested interactive representing one control
    const nestedParent = el.parentElement?.closest(selectors)
    if (nestedParent && nestedParent !== el) {
      seen.add(el)
      continue
    }
    const style = computedStyle(doc, el)
    if (!style || !isVisible(el, style)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0 && (rect.width < minSize || rect.height < minSize)) {
      issues.push(
        makeIssue({
          ruleId: 'a11y.touch-target',
          type: 'small-touch-target',
          severity: 'warning',
          element: el,
          viewport,
          description: `Interactive element is ${Math.round(rect.width)}×${Math.round(rect.height)}px; recommended minimum is ${minSize}×${minSize}px.`,
          recommendation:
            'Increase padding or min-width/min-height so touch targets meet ~44×44px guidelines.',
          measuredValues: { width: rect.width, height: rect.height },
          expectedValues: { minWidth: minSize, minHeight: minSize },
          confidence: 0.9,
        }),
      )
    }
    seen.add(el)
  }
  return issues
}

export function detectInaccessibleControls(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  const issues: LayoutIssue[] = []

  // Duplicate IDs
  const idMap = new Map<string, Element[]>()
  for (const el of Array.from(doc.querySelectorAll('[id]'))) {
    const id = el.id
    if (!id) continue
    const list = idMap.get(id) ?? []
    list.push(el)
    idMap.set(id, list)
  }
  for (const [id, els] of idMap) {
    if (els.length > 1) {
      issues.push(
        makeIssue({
          ruleId: 'a11y.duplicate-id',
          type: 'inaccessible-control',
          severity: 'warning',
          element: els[0],
          viewport,
          description: `Duplicate element id "${id}" found ${els.length} times.`,
          recommendation: 'Ensure every id attribute is unique within the document.',
          measuredValues: { id, count: els.length },
          expectedValues: { count: 1 },
          confidence: 0.95,
        }),
      )
    }
  }

  // Inputs without label / accessible name
  for (const input of Array.from(
    doc.querySelectorAll('input, select, textarea'),
  ) as HTMLInputElement[]) {
    if (input.type === 'hidden') continue
    const style = computedStyle(doc, input)
    if (!style || !isVisible(input, style)) continue

    const ariaLabel = input.getAttribute('aria-label')?.trim()
    const ariaLabelledBy = input.getAttribute('aria-labelledby')?.trim()
    const title = input.getAttribute('title')?.trim()
    let labelled = Boolean(ariaLabel || title)

    if (ariaLabelledBy) {
      const ids = ariaLabelledBy.split(/\s+/)
      const missing = ids.filter((id) => !doc.getElementById(id))
      if (missing.length) {
        issues.push(
          makeIssue({
            ruleId: 'a11y.invalid-aria-ref',
            type: 'inaccessible-control',
            severity: 'warning',
            element: input,
            viewport,
            description: `aria-labelledby references missing id(s): ${missing.join(', ')}.`,
            recommendation: 'Point aria-labelledby to existing element ids.',
            measuredValues: { ariaLabelledBy, missing: missing.join(',') },
            expectedValues: { validRefs: true },
            confidence: 0.9,
          }),
        )
      } else {
        labelled = true
      }
    }

    if (input.id) {
      const escaped =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(input.id)
          : input.id.replace(/([^\w-])/g, '\\$1')
      const label = doc.querySelector(`label[for="${escaped}"]`)
      if (label) labelled = true
    }
    if (input.closest('label')) labelled = true

    if (!labelled) {
      issues.push(
        makeIssue({
          ruleId: 'a11y.unlabeled-input',
          type: 'inaccessible-control',
          severity: 'critical',
          element: input,
          viewport,
          description: 'Form control has no associated label or accessible name.',
          recommendation:
            'Add a <label for="...">, wrap the control in a label, or provide aria-label / aria-labelledby.',
          measuredValues: { accessibleName: '' },
          expectedValues: { accessibleName: true },
          confidence: 0.9,
        }),
      )
    }
  }

  // Buttons without readable name
  for (const button of Array.from(doc.querySelectorAll('button, [role="button"]'))) {
    const style = computedStyle(doc, button)
    if (!style || !isVisible(button, style)) continue
    const text = button.textContent?.trim() ?? ''
    const ariaLabel = button.getAttribute('aria-label')?.trim()
    const ariaLabelledBy = button.getAttribute('aria-labelledby')?.trim()
    let named = Boolean(text || ariaLabel)
    if (ariaLabelledBy) {
      const ids = ariaLabelledBy.split(/\s+/)
      const missing = ids.filter((id) => !doc.getElementById(id))
      if (missing.length) {
        issues.push(
          makeIssue({
            ruleId: 'a11y.invalid-aria-ref',
            type: 'inaccessible-control',
            severity: 'warning',
            element: button,
            viewport,
            description: `aria-labelledby references missing id(s): ${missing.join(', ')}.`,
            recommendation: 'Point aria-labelledby to existing element ids.',
            measuredValues: { ariaLabelledBy },
            expectedValues: { validRefs: true },
            confidence: 0.9,
          }),
        )
      } else {
        named = true
      }
    }
    if (!named) {
      issues.push(
        makeIssue({
          ruleId: 'a11y.unnamed-button',
          type: 'inaccessible-control',
          severity: 'critical',
          element: button,
          viewport,
          description: 'Button has no readable text or aria-label.',
          recommendation: 'Provide visible text content or an aria-label that describes the action.',
          measuredValues: { text: text || null, ariaLabel: ariaLabel || null },
          expectedValues: { accessibleName: true },
          confidence: 0.9,
        }),
      )
    }
  }

  // Invalid aria-describedby / aria-controls refs
  for (const el of Array.from(doc.querySelectorAll('[aria-describedby], [aria-controls]'))) {
    for (const attr of ['aria-describedby', 'aria-controls'] as const) {
      const value = el.getAttribute(attr)
      if (!value) continue
      const missing = value.split(/\s+/).filter((id) => id && !doc.getElementById(id))
      if (missing.length) {
        issues.push(
          makeIssue({
            ruleId: 'a11y.invalid-aria-ref',
            type: 'inaccessible-control',
            severity: 'info',
            element: el,
            viewport,
            description: `${attr} references missing id(s): ${missing.join(', ')}.`,
            recommendation: `Ensure ${attr} points to elements that exist in the document.`,
            measuredValues: { attr, missing: missing.join(',') },
            expectedValues: { validRefs: true },
            confidence: 0.85,
          }),
        )
      }
    }
  }

  return issues
}

type RuleFn = (doc: Document, options: AnalyzerOptions) => LayoutIssue[]

const RULES: Array<{ id: string; run: RuleFn }> = [
  {
    id: 'horizontal-overflow',
    run: (doc, opt) => detectHorizontalOverflow(doc, opt.viewport),
  },
  {
    id: 'outside-viewport',
    run: (doc, opt) => detectOutsideViewport(doc, opt.viewport),
  },
  {
    id: 'overlapping',
    run: (doc, opt) => detectOverlapping(doc, opt.viewport, opt.maxElements ?? 120),
  },
  {
    id: 'text-clipping',
    run: (doc, opt) => detectTextClipping(doc, opt.viewport),
  },
  {
    id: 'image-overflow',
    run: (doc, opt) => detectImageOverflow(doc, opt.viewport),
  },
  {
    id: 'missing-alt',
    run: (doc, opt) => detectMissingAlt(doc, opt.viewport),
  },
  {
    id: 'broken-image',
    run: (doc, opt) => detectBrokenImages(doc, opt.viewport),
  },
  {
    id: 'broken-link',
    run: (doc, opt) => detectBrokenLinks(doc, opt.viewport),
  },
  {
    id: 'fixed-width',
    run: (doc, opt) => detectFixedWidths(doc, opt.viewport, opt.fixedWidthThreshold ?? 0.9),
  },
  {
    id: 'small-touch-target',
    run: (doc, opt) => detectSmallTouchTargets(doc, opt.viewport, opt.minTouchTarget ?? 44),
  },
  {
    id: 'inaccessible-control',
    run: (doc, opt) => detectInaccessibleControls(doc, opt.viewport),
  },
]

/** Independent layout analysis service — no React dependencies. */
export class LayoutAnalyzer {
  analyze(doc: Document, options: AnalyzerOptions): AnalysisResult {
    if (options.signal?.aborted) {
      return {
        issues: [],
        analyzedAt: new Date().toISOString(),
        accessible: false,
        errorMessage: 'Analysis cancelled.',
      }
    }

    if (!doc.body) {
      return {
        issues: [],
        analyzedAt: new Date().toISOString(),
        accessible: false,
        errorMessage: 'Document body is not available for analysis.',
      }
    }

    const enabled = new Set(options.enabledRules ?? RULES.map((r) => r.id))
    const ruleErrors: AppError[] = []
    const issues: LayoutIssue[] = []
    const { truncated } = collectElements(doc, options.maxElements ?? 500)

    for (const rule of RULES) {
      if (!enabled.has(rule.id)) continue
      if (options.signal?.aborted) break
      try {
        issues.push(...rule.run(doc, options))
      } catch (error) {
        ruleErrors.push({
          category: 'rule-execution-failed',
          message: `Rule "${rule.id}" failed and was skipped.`,
          diagnostic: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        })
      }
    }

    const deduped = dedupeIssues(issues)
    const healthScore = calculateHealthScore(deduped)

    return {
      issues: deduped,
      analyzedAt: new Date().toISOString(),
      accessible: true,
      ruleErrors,
      truncated,
      healthScore,
      errorMessage: truncated
        ? 'Page is large — analysis sampled a limited set of elements.'
        : undefined,
    }
  }
}

export const layoutAnalyzer = new LayoutAnalyzer()

/** Convenience wrapper used by UI and tests. */
export function analyzeDocument(
  doc: Document,
  options: AnalyzerOptions | { viewportWidth: number; viewportHeight: number; minTouchTarget?: number; fixedWidthThreshold?: number },
): AnalysisResult {
  if ('viewport' in options) {
    return layoutAnalyzer.analyze(doc, options)
  }
  return layoutAnalyzer.analyze(doc, {
    viewport: {
      id: 'custom',
      name: 'Custom',
      width: options.viewportWidth,
      height: options.viewportHeight,
    },
    minTouchTarget: options.minTouchTarget,
    fixedWidthThreshold: options.fixedWidthThreshold,
  })
}

export function countBySeverity(issues: LayoutIssue[]): Record<Severity, number> {
  return {
    critical: issues.filter((i) => i.severity === 'critical' && i.lifecycle !== 'ignored').length,
    warning: issues.filter((i) => i.severity === 'warning' && i.lifecycle !== 'ignored').length,
    info: issues.filter((i) => i.severity === 'info' && i.lifecycle !== 'ignored').length,
  }
}
