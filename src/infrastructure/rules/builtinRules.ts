import { asRuleId } from '../../domain/ids'
import { rectsOverlap } from '../../engine/domUtils'
import {
  collectElements,
  computedStyle,
  cssEscape,
  intentionallyOffscreen,
  isDecorativeOverlay,
  isPresentInAccessibilityTree,
  isScrollContainer,
  isVisible,
  issueFromElement,
  parsePx,
  requiresDom,
  styleEvidence,
} from './helpers'
import type { AnalysisRule, RuleContext, RuleIssueData, RuleResult } from './types'

function timed(
  context: RuleContext,
  inspect: () => { issues: RuleIssueData[]; inspected: number; warnings?: string[] },
): RuleResult {
  const started = performance.now()
  try {
    if (context.signal?.aborted) {
      return {
        status: 'failed',
        issues: [],
        inspectedElements: 0,
        durationMs: 0,
        warnings: [],
        diagnostic: 'Aborted',
      }
    }
    const { issues, inspected, warnings = [] } = inspect()
    return {
      status: 'completed',
      issues: issues.slice(0, context.limits.maxIssuesPerRule),
      inspectedElements: inspected,
      durationMs: Math.round(performance.now() - started),
      warnings:
        issues.length > context.limits.maxIssuesPerRule
          ? [...warnings, `Issue cap ${context.limits.maxIssuesPerRule} reached for this rule.`]
          : warnings,
    }
  } catch (error) {
    return {
      status: 'failed',
      issues: [],
      inspectedElements: 0,
      durationMs: Math.round(performance.now() - started),
      warnings: [],
      diagnostic: error instanceof Error ? error.message : String(error),
    }
  }
}

function baseRec(data: RuleIssueData): string {
  return data.recommendation
}

export const horizontalOverflowRule: AnalysisRule = {
  id: asRuleId('horizontal-overflow'),
  name: 'Horizontal overflow',
  description: 'Detects document or element overflow beyond the viewport width.',
  category: 'overflow',
  defaultSeverity: 'critical',
  version: '1.1.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const doc = context.document
      const vp = context.viewport
      const issues: RuleIssueData[] = []
      const scrollWidth = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0)
      const overflowAmount = scrollWidth - vp.width
      if (overflowAmount > 1) {
        issues.push({
          severity: 'critical',
          title: 'Horizontal page overflow',
          explanation: `Page scroll width (${scrollWidth}px) exceeds viewport (${vp.width}px) by ${Math.round(overflowAmount)}px.`,
          selector: 'html',
          elementPath: 'html',
          category: 'overflow',
          confidence: 0.95,
          actual: { scrollWidth, overflowPx: overflowAmount },
          expected: { scrollWidthMax: vp.width },
          recommendation:
            'Use fluid widths (%, max-width, clamp) and avoid large fixed widths that force horizontal scrolling.',
          measurementSignature: `doc-overflow:${Math.round(overflowAmount)}`,
          boundingRect: { top: 0, left: 0, width: scrollWidth, height: 20 },
        })
      }
      const { elements } = collectElements(doc, context.limits.maxElements)
      let inspected = 1
      for (const el of elements) {
        inspected++
        const style = computedStyle(doc, el)
        if (!style || !isVisible(el, style) || isScrollContainer(style)) continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) continue
        const over = rect.right - vp.width
        if (over > 1) {
          issues.push(
            issueFromElement(el, {
              severity: 'warning',
              title: 'Element overflows viewport',
              explanation: `Element extends ${Math.round(over)}px past the right edge.`,
              category: 'overflow',
              confidence: 0.9,
              actual: { right: rect.right, overflowPx: over },
              expected: { rightMax: vp.width },
              evidenceStyles: styleEvidence(style, ['width', 'max-width', 'overflow', 'display']),
              recommendation: 'Reduce width or set max-width: 100% so the element fits the viewport.',
              measurementSignature: `el-overflow:${Math.round(over)}`,
              overflowArea: Math.round(over * rect.height),
            }),
          )
        }
      }
      return { issues, inspected }
    })
  },
}

export const outsideViewportRule: AnalysisRule = {
  id: asRuleId('outside-viewport'),
  name: 'Outside viewport',
  description: 'Detects visible elements positioned outside the horizontal viewport.',
  category: 'overflow',
  defaultSeverity: 'warning',
  version: '1.1.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const issues: RuleIssueData[] = []
      const { elements } = collectElements(context.document, context.limits.maxElements)
      let inspected = 0
      for (const el of elements) {
        inspected++
        const style = computedStyle(context.document, el)
        if (!style || !isVisible(el, style)) continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) continue
        if (intentionallyOffscreen(style, rect)) continue
        const fully = rect.right < 0 || rect.left > context.viewport.width
        const partial = rect.left < -1 || rect.right > context.viewport.width + 1
        if (fully && style.position !== 'fixed') {
          issues.push(
            issueFromElement(el, {
              severity: 'warning',
              title: 'Element outside viewport',
              explanation: 'Element is fully outside the horizontal viewport.',
              category: 'overflow',
              confidence: 0.8,
              actual: { left: rect.left, right: rect.right },
              expected: { leftMin: 0, rightMax: context.viewport.width },
              evidenceStyles: styleEvidence(style, ['position', 'transform', 'margin']),
              recommendation: 'Check absolute positioning and negative margins that push content off-screen.',
              measurementSignature: `outside-full:${Math.round(rect.left)}`,
            }),
          )
        } else if (partial && rect.width > 8) {
          issues.push(
            issueFromElement(el, {
              severity: 'info',
              title: 'Element partially outside viewport',
              explanation: 'Element is partially outside the horizontal viewport bounds.',
              category: 'overflow',
              confidence: 0.7,
              actual: { left: rect.left, right: rect.right },
              expected: { leftMin: 0, rightMax: context.viewport.width },
              recommendation: 'Ensure important content remains fully visible at this width.',
              measurementSignature: `outside-partial:${Math.round(rect.left)}:${Math.round(rect.right)}`,
            }),
          )
        }
      }
      return { issues, inspected }
    })
  },
}

export const overlappingRule: AnalysisRule = {
  id: asRuleId('overlapping'),
  name: 'Unintended overlap',
  description: 'Detects overlapping interactive or textual content using spatial buckets.',
  category: 'overlap',
  defaultSeverity: 'warning',
  version: '1.2.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const PRIORITY = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'H1', 'H2', 'H3', 'NAV', 'P'])
      type Cand = { el: Element; style: CSSStyleDeclaration; rect: DOMRect; priority: boolean }
      const candidates: Cand[] = []
      const { elements } = collectElements(context.document, context.limits.maxOverlapCandidates)
      for (const el of elements) {
        const style = computedStyle(context.document, el)
        if (!style || !isVisible(el, style) || isDecorativeOverlay(el, style)) continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 16 || rect.height < 16) continue
        candidates.push({
          el,
          style,
          rect,
          priority: PRIORITY.has(el.tagName) || el.getAttribute('role') === 'button',
        })
      }

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

      const issues: RuleIssueData[] = []
      const reported = new Set<string>()
      const pairSeen = new Set<string>()

      for (const indices of buckets.values()) {
        for (let i = 0; i < indices.length; i++) {
          for (let j = i + 1; j < indices.length; j++) {
            const ia = indices[i]
            const ib = indices[j]
            if (ia === undefined || ib === undefined) continue
            const pairKey = [ia, ib].sort((a, b) => a - b).join(':')
            if (pairSeen.has(pairKey)) continue
            pairSeen.add(pairKey)
            const a = candidates[ia]
            const b = candidates[ib]
            if (!a || !b) continue
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue
            if (!a.priority && !b.priority) continue
            const aRect = { top: a.rect.top, left: a.rect.left, width: a.rect.width, height: a.rect.height }
            const bRect = { top: b.rect.top, left: b.rect.left, width: b.rect.width, height: b.rect.height }
            if (!rectsOverlap(aRect, bRect, 12)) continue
            const selA = issueFromElement(a.el, {
              severity: 'warning',
              title: 'x',
              explanation: 'x',
              category: 'overlap',
              confidence: 1,
              actual: {},
              expected: {},
              recommendation: 'x',
              measurementSignature: 'x',
            }).selector
            const selB = issueFromElement(b.el, {
              severity: 'warning',
              title: 'x',
              explanation: 'x',
              category: 'overlap',
              confidence: 1,
              actual: {},
              expected: {},
              recommendation: 'x',
              measurementSignature: 'x',
            }).selector
            const key = [selA, selB].sort().join('|')
            if (reported.has(key)) continue
            reported.add(key)
            const target = a.priority ? a : b
            const other = a.priority ? b : a
            const iw =
              Math.min(a.rect.left + a.rect.width, b.rect.left + b.rect.width) -
              Math.max(a.rect.left, b.rect.left)
            const ih =
              Math.min(a.rect.top + a.rect.height, b.rect.top + b.rect.height) -
              Math.max(a.rect.top, b.rect.top)
            const area = Math.max(0, iw) * Math.max(0, ih)
            const blocksInteractive = target.priority
            issues.push(
              issueFromElement(target.el, {
                severity: blocksInteractive ? 'warning' : 'info',
                title: 'Overlapping elements',
                explanation: `Element overlaps another node (${selB === selA ? 'peer' : other.el.tagName.toLowerCase()}) with intersection ${Math.round(iw)}×${Math.round(ih)}px.`,
                category: 'overlap',
                confidence: 0.75,
                actual: { intersectionWidth: iw, intersectionHeight: ih, intersectionArea: area },
                expected: { intersectionAreaMax: 12 },
                intersectionArea: area,
                evidenceStyles: styleEvidence(target.style, ['position', 'z-index', 'display']),
                recommendation:
                  'Adjust spacing, position, or z-index so interactive/text content is not obscured.',
                measurementSignature: `overlap:${Math.round(area)}`,
              }),
            )
            if (issues.length >= context.limits.maxIssuesPerRule) break
          }
        }
      }

      return {
        issues,
        inspected: candidates.length,
        warnings:
          elements.length >= context.limits.maxOverlapCandidates
            ? ['Overlap detection sampled a limited candidate set for performance.']
            : [],
      }
    })
  },
}

export const textClippingRule: AnalysisRule = {
  id: asRuleId('text-clipping'),
  name: 'Text clipping',
  description: 'Detects clipped text due to overflow or fixed sizing.',
  category: 'typography',
  defaultSeverity: 'warning',
  version: '1.1.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const issues: RuleIssueData[] = []
      const nodes = Array.from(
        context.document.body?.querySelectorAll(
          'p, h1, h2, h3, h4, h5, h6, span, a, li, label, button, td, th',
        ) ?? [],
      )
      let inspected = 0
      for (const el of nodes) {
        inspected++
        const style = computedStyle(context.document, el)
        if (!style || !isVisible(el, style)) continue
        if ((el.textContent?.trim().length ?? 0) < 2) continue
        const overflowHidden =
          style.overflowX === 'hidden' || style.overflowY === 'hidden' || style.overflow === 'hidden'
        const hasEllipsis = style.textOverflow === 'ellipsis'
        const clippedX = el.scrollWidth > el.clientWidth + 2
        const clippedY = el.scrollHeight > el.clientHeight + 2
        const fixedHeight = style.height.endsWith('px') && parsePx(style.height) > 0 && clippedY
        if ((overflowHidden && (clippedX || clippedY)) || fixedHeight || (hasEllipsis && clippedX)) {
          const intentional = hasEllipsis && clippedX && !clippedY
          issues.push(
            issueFromElement(el, {
              severity: intentional ? 'info' : 'warning',
              title: intentional ? 'Truncated text (ellipsis)' : 'Text clipping',
              explanation: intentional
                ? 'Text is truncated with ellipsis. Confirm truncation is intentional.'
                : 'Text does not fit its container due to overflow or fixed sizing.',
              category: 'typography',
              confidence: intentional ? 0.65 : 0.85,
              actual: {
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                textOverflow: style.textOverflow,
              },
              expected: { fits: true },
              evidenceStyles: styleEvidence(style, ['overflow', 'height', 'line-height', 'text-overflow']),
              recommendation: 'Increase container size or allow wrapping so text remains readable.',
              measurementSignature: `clip:${el.scrollWidth - el.clientWidth}`,
            }),
          )
        }
      }
      return { issues, inspected }
    })
  },
}

export const imageOverflowRule: AnalysisRule = {
  id: asRuleId('image-overflow'),
  name: 'Image overflow',
  description: 'Detects images exceeding their parent content box.',
  category: 'media',
  defaultSeverity: 'warning',
  version: '1.1.0',
  supports(ctx) {
    const base = requiresDom(ctx)
    if (!base.applicable) return base
    if (ctx.document.images.length === 0) return { applicable: false, reason: 'No images in document.' }
    return { applicable: true }
  },
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const issues: RuleIssueData[] = []
      const images = Array.from(context.document.images)
      for (const img of images) {
        const style = computedStyle(context.document, img)
        if (!style || !isVisible(img, style)) continue
        const parent = img.parentElement
        if (!parent) continue
        const parentRect = parent.getBoundingClientRect()
        const imgRect = img.getBoundingClientRect()
        if (parentRect.width <= 0) continue
        const maxWidth = style.maxWidth
        const responsive = maxWidth === '100%' || maxWidth.endsWith('%') || style.width === '100%'
        if (imgRect.width > parentRect.width + 2) {
          issues.push(
            issueFromElement(img, {
              severity: 'warning',
              title: 'Image exceeds container',
              explanation: `Image is ${Math.round(imgRect.width - parentRect.width)}px wider than its parent.`,
              category: 'media',
              confidence: 0.9,
              actual: { imageWidth: imgRect.width, parentWidth: parentRect.width },
              expected: { imageWidthMax: parentRect.width },
              evidenceStyles: styleEvidence(style, ['width', 'max-width', 'height']),
              recommendation: 'Set max-width: 100%; height: auto on images.',
              measurementSignature: `img-over:${Math.round(imgRect.width - parentRect.width)}`,
            }),
          )
        } else if (!responsive && img.naturalWidth > parentRect.width + 2) {
          issues.push(
            issueFromElement(img, {
              severity: 'info',
              title: 'Unconstrained image',
              explanation: 'Image lacks responsive constraints while natural width exceeds the container.',
              category: 'media',
              confidence: 0.7,
              actual: { naturalWidth: img.naturalWidth, parentWidth: parentRect.width },
              expected: { maxWidth: '100%' },
              recommendation: 'Add max-width: 100%; height: auto.',
              measurementSignature: `img-unconstrained:${img.naturalWidth}`,
            }),
          )
        }
      }
      return { issues, inspected: images.length }
    })
  },
}

export const missingAltRule: AnalysisRule = {
  id: asRuleId('missing-alt'),
  name: 'Missing image alt',
  description: 'Reports images without an alt attribute. Decorative alt="" is excluded.',
  category: 'accessibility',
  defaultSeverity: 'critical',
  version: '1.1.0',
  supports(ctx) {
    const base = requiresDom(ctx)
    if (!base.applicable) return base
    if (ctx.document.images.length === 0) return { applicable: false, reason: 'No images in document.' }
    return { applicable: true }
  },
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const issues: RuleIssueData[] = []
      for (const img of Array.from(context.document.images)) {
        if (!img.hasAttribute('alt')) {
          issues.push(
            issueFromElement(img, {
              severity: 'critical',
              title: 'Missing alt attribute',
              explanation: 'Image has no alt attribute. Decorative images should use alt="".',
              category: 'accessibility',
              confidence: 0.95,
              actual: { hasAlt: false },
              expected: { hasAlt: true },
              recommendation: 'Add meaningful alt text, or alt="" for decorative images.',
              measurementSignature: 'missing-alt',
            }),
          )
        }
      }
      return { issues, inspected: context.document.images.length }
    })
  },
}

export const brokenImageRule: AnalysisRule = {
  id: asRuleId('broken-image'),
  name: 'Broken image',
  description: 'Detects images that finished loading with zero natural dimensions.',
  category: 'media',
  defaultSeverity: 'critical',
  version: '1.1.0',
  supports(ctx) {
    const base = requiresDom(ctx)
    if (!base.applicable) return base
    if (ctx.document.images.length === 0) return { applicable: false, reason: 'No images in document.' }
    return { applicable: true }
  },
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const issues: RuleIssueData[] = []
      for (const img of Array.from(context.document.images)) {
        const src = img.getAttribute('src')
        if (img.complete && (img.naturalWidth === 0 || img.naturalHeight === 0) && src) {
          issues.push(
            issueFromElement(img, {
              severity: 'critical',
              title: 'Broken image',
              explanation: `Image failed to load (src: ${src}).`,
              category: 'media',
              confidence: 0.95,
              actual: { naturalWidth: img.naturalWidth, complete: true, src },
              expected: { naturalWidthMin: 1 },
              recommendation: 'Verify the image URL and provide a fallback if needed.',
              measurementSignature: `broken-img:${src}`,
            }),
          )
        }
      }
      return { issues, inspected: context.document.images.length }
    })
  },
}

export const brokenLinkRule: AnalysisRule = {
  id: asRuleId('broken-link'),
  name: 'Broken or unsafe link',
  description: 'Detects empty, placeholder, javascript:, or malformed hrefs without network requests.',
  category: 'links',
  defaultSeverity: 'warning',
  version: '1.1.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const issues: RuleIssueData[] = []
      const anchors = Array.from(context.document.querySelectorAll('a'))
      for (const anchor of anchors) {
        const href = anchor.getAttribute('href')
        if (href === null || href.trim() === '' || href.trim() === '#') {
          issues.push(
            issueFromElement(anchor, {
              severity: 'info',
              title: 'Placeholder link',
              explanation: 'Anchor has an empty or # href.',
              category: 'links',
              confidence: 0.9,
              actual: { href: href ?? '' },
              expected: { validHref: true },
              recommendation: 'Provide a real destination or use a button for actions.',
              measurementSignature: 'href-empty',
            }),
          )
        } else if (/^(javascript:|void\(0\))/i.test(href.trim())) {
          issues.push(
            issueFromElement(anchor, {
              severity: 'warning',
              title: 'Unsafe javascript: link',
              explanation: 'Anchor uses a javascript: or void href.',
              category: 'links',
              confidence: 0.9,
              actual: { href },
              expected: { validHref: true },
              recommendation: 'Use a real URL or a button with an event handler.',
              measurementSignature: 'href-js',
            }),
          )
        } else if (href.includes('://') && !/^https?:\/\//i.test(href) && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          issues.push(
            issueFromElement(anchor, {
              severity: 'warning',
              title: 'Malformed link',
              explanation: `Anchor href looks malformed: ${href}`,
              category: 'links',
              confidence: 0.7,
              actual: { href },
              expected: { validHref: true },
              recommendation: 'Correct the URL scheme and destination.',
              measurementSignature: `href-bad:${href}`,
            }),
          )
        }
      }
      return { issues, inspected: anchors.length }
    })
  },
}

export const fixedWidthRule: AnalysisRule = {
  id: asRuleId('fixed-width'),
  name: 'Fixed-width responsive risk',
  description: 'Detects large fixed pixel widths that nearly exceed the viewport.',
  category: 'responsive',
  defaultSeverity: 'warning',
  version: '1.1.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const issues: RuleIssueData[] = []
      const { elements } = collectElements(context.document, context.limits.maxElements)
      let inspected = 0
      const threshold = 0.9
      for (const el of elements) {
        inspected++
        const style = computedStyle(context.document, el)
        if (!style || !isVisible(el, style)) continue
        if (['IMG', 'SVG', 'HR', 'I', 'SPAN'].includes(el.tagName) && parsePx(style.width) < 96) continue
        const inlineWidth = (el as HTMLElement).style?.width ?? ''
        const hasFixed = /^\d+px$/i.test(inlineWidth.trim()) || !!el.getAttribute('width')
        const width = parsePx(style.width)
        const isMaxOnly =
          style.maxWidth.endsWith('px') && parsePx(style.maxWidth) === width && !hasFixed
        if (isMaxOnly) continue
        if (!hasFixed && !(style.width.endsWith('px') && width > context.viewport.width * threshold)) {
          continue
        }
        if (width > context.viewport.width * threshold && width > 200) {
          issues.push(
            issueFromElement(el, {
              severity: 'warning',
              title: 'Fixed width risk',
              explanation: `Fixed width ${Math.round(width)}px may break at viewport ${context.viewport.width}px.`,
              category: 'responsive',
              confidence: 0.8,
              actual: { width, viewportWidth: context.viewport.width },
              expected: { widthMaxRatio: threshold },
              evidenceStyles: styleEvidence(style, ['width', 'max-width', 'min-width']),
              recommendation: 'Prefer max-width, %, or clamp() for large containers.',
              measurementSignature: `fixed:${Math.round(width)}`,
            }),
          )
        }
      }
      return { issues, inspected }
    })
  },
}

export const smallTouchTargetRule: AnalysisRule = {
  id: asRuleId('small-touch-target'),
  name: 'Small touch target',
  description: 'Interactive targets under 44×44px on mobile/tablet.',
  category: 'accessibility',
  defaultSeverity: 'warning',
  version: '1.1.0',
  supports(ctx) {
    const base = requiresDom(ctx)
    if (!base.applicable) return base
    if (ctx.viewport.width > 1024) {
      return { applicable: false, reason: 'Touch-target checks are primarily for mobile/tablet viewports.' }
    }
    return { applicable: true }
  },
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const minSize = 44
      const issues: RuleIssueData[] = []
      const selector = 'a, button, input, select, textarea, summary, [role="button"], [onclick]'
      const seen = new Set<Element>()
      const nodes = Array.from(context.document.querySelectorAll(selector))
      for (const el of nodes) {
        if (seen.has(el)) continue
        if (el.parentElement?.closest(selector) && el.parentElement.closest(selector) !== el) {
          seen.add(el)
          continue
        }
        const style = computedStyle(context.document, el)
        if (!style || !isVisible(el, style)) continue
        const rect = el.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0 && (rect.width < minSize || rect.height < minSize)) {
          issues.push(
            issueFromElement(el, {
              severity: 'warning',
              title: 'Small touch target',
              explanation: `Interactive control is ${Math.round(rect.width)}×${Math.round(rect.height)}px; recommended minimum is ${minSize}×${minSize}px.`,
              category: 'accessibility',
              confidence: 0.9,
              actual: { width: rect.width, height: rect.height },
              expected: { minWidth: minSize, minHeight: minSize },
              recommendation: 'Increase padding or min size to ~44×44px.',
              measurementSignature: `touch:${Math.round(rect.width)}x${Math.round(rect.height)}`,
            }),
          )
        }
        seen.add(el)
      }
      return { issues, inspected: nodes.length }
    })
  },
}

export const duplicateIdRule: AnalysisRule = {
  id: asRuleId('duplicate-id'),
  name: 'Duplicate DOM ID',
  description: 'Detects non-unique id attributes that break labels and ARIA references.',
  category: 'structure',
  defaultSeverity: 'warning',
  version: '1.0.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const doc = context.document
      const issues: RuleIssueData[] = []
      const idMap = new Map<string, Element[]>()
      let inspected = 0
      for (const el of Array.from(doc.querySelectorAll('[id]'))) {
        inspected++
        if (!el.id) continue
        const list = idMap.get(el.id) ?? []
        list.push(el)
        idMap.set(el.id, list)
      }
      for (const [id, els] of idMap) {
        if (els.length > 1 && els[0]) {
          issues.push(
            issueFromElement(els[0], {
              severity: 'warning',
              title: 'Duplicate DOM ID',
              explanation: `id="${id}" appears ${els.length} times. Duplicate ids break label associations and ARIA references.`,
              category: 'structure',
              confidence: 0.95,
              actual: { id, count: els.length },
              expected: { count: 1 },
              recommendation: 'Ensure every id is unique in the document.',
              measurementSignature: `dup-id:${id}`,
            }),
          )
        }
      }
      return { issues, inspected }
    })
  },
}

export const invalidAriaRule: AnalysisRule = {
  id: asRuleId('invalid-aria'),
  name: 'Invalid ARIA reference',
  description: 'Detects aria-labelledby / aria-describedby pointing at missing ids.',
  category: 'accessibility',
  defaultSeverity: 'warning',
  version: '1.0.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const doc = context.document
      const issues: RuleIssueData[] = []
      let inspected = 0
      const attrs = ['aria-labelledby', 'aria-describedby', 'aria-controls'] as const
      for (const el of Array.from(doc.querySelectorAll(attrs.map((a) => `[${a}]`).join(',')))) {
        inspected++
        const style = computedStyle(doc, el)
        if (!isPresentInAccessibilityTree(style)) continue
        for (const attr of attrs) {
          const value = el.getAttribute(attr)?.trim()
          if (!value) continue
          const missing = value.split(/\s+/).filter((id) => id && !doc.getElementById(id))
          if (!missing.length) continue
          issues.push(
            issueFromElement(el, {
              severity: 'warning',
              title: 'Invalid ARIA reference',
              explanation: `${attr} references missing id(s): ${missing.join(', ')}. This is a heuristic check, not WCAG certification.`,
              category: 'accessibility',
              confidence: 0.9,
              actual: { attribute: attr, missing: missing.join(',') },
              expected: { validRefs: true },
              recommendation: 'Point ARIA references to existing element ids.',
              measurementSignature: `aria-missing:${attr}:${missing.join(',')}`,
              evidenceStyles: style ? styleEvidence(style, ['display', 'visibility']) : undefined,
            }),
          )
        }
      }
      return { issues, inspected }
    })
  },
}

export const unlabelledControlRule: AnalysisRule = {
  id: asRuleId('unlabelled-control'),
  name: 'Unlabelled form control',
  description: 'Detects visible inputs/selects/textareas without an accessible name.',
  category: 'accessibility',
  defaultSeverity: 'critical',
  version: '1.0.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const doc = context.document
      const issues: RuleIssueData[] = []
      let inspected = 0
      for (const input of Array.from(doc.querySelectorAll('input, select, textarea')) as HTMLInputElement[]) {
        inspected++
        if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') continue
        const style = computedStyle(doc, input)
        if (!isPresentInAccessibilityTree(style)) continue
        let labelled = Boolean(input.getAttribute('aria-label')?.trim() || input.getAttribute('title')?.trim())
        const labelledBy = input.getAttribute('aria-labelledby')?.trim()
        if (labelledBy) {
          const ids = labelledBy.split(/\s+/).filter(Boolean)
          if (ids.every((id) => doc.getElementById(id))) labelled = true
        }
        if (input.id && doc.querySelector(`label[for="${cssEscape(input.id)}"]`)) labelled = true
        if (input.closest('label')) labelled = true
        if (!labelled) {
          issues.push(
            issueFromElement(input, {
              severity: 'critical',
              title: 'Unlabelled form control',
              explanation: 'Form control has no associated label or accessible name. Heuristic only — not WCAG certification.',
              category: 'accessibility',
              confidence: 0.9,
              actual: { accessibleName: '' },
              expected: { accessibleName: true },
              recommendation: 'Add a label, aria-label, or aria-labelledby.',
              measurementSignature: 'unlabelled-input',
              evidenceStyles: style
                ? styleEvidence(style, ['display', 'visibility', 'opacity'])
                : undefined,
            }),
          )
        }
      }
      return { issues, inspected }
    })
  },
}

export const inaccessibleControlRule: AnalysisRule = {
  id: asRuleId('inaccessible-control'),
  name: 'Inaccessible interactive control',
  description: 'Detects buttons and role=button without an accessible name.',
  category: 'accessibility',
  defaultSeverity: 'critical',
  version: '1.3.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const doc = context.document
      const issues: RuleIssueData[] = []
      let inspected = 0
      for (const button of Array.from(doc.querySelectorAll('button, [role="button"]'))) {
        inspected++
        const style = computedStyle(doc, button)
        if (!isPresentInAccessibilityTree(style)) continue
        const text = button.textContent?.trim() ?? ''
        const aria = button.getAttribute('aria-label')?.trim()
        if (!text && !aria) {
          issues.push(
            issueFromElement(button, {
              severity: 'critical',
              title: 'Unnamed button',
              explanation: 'Button has no readable text or aria-label. Heuristic only — not WCAG certification.',
              category: 'accessibility',
              confidence: 0.9,
              actual: { text: null, ariaLabel: null },
              expected: { accessibleName: true },
              recommendation: 'Provide visible text or an aria-label describing the action.',
              measurementSignature: 'unnamed-button',
              evidenceStyles: style
                ? styleEvidence(style, ['display', 'visibility', 'opacity'])
                : undefined,
            }),
          )
        }
      }
      return { issues, inspected }
    })
  },
}

export const stickyObstructionRule: AnalysisRule = {
  id: asRuleId('sticky-obstruction'),
  name: 'Content hidden behind sticky/fixed',
  description: 'Detects content overlapping sticky/fixed bars in a problematic way.',
  category: 'overlap',
  defaultSeverity: 'warning',
  version: '1.0.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const issues: RuleIssueData[] = []
      const fixed = Array.from(context.document.querySelectorAll('*')).filter((el) => {
        const style = computedStyle(context.document, el)
        return style && (style.position === 'fixed' || style.position === 'sticky') && isVisible(el, style)
      })
      const textNodes = Array.from(
        context.document.querySelectorAll('p, h1, h2, h3, a, button, input, label'),
      )
      let inspected = fixed.length
      for (const bar of fixed) {
        const barStyle = computedStyle(context.document, bar)
        if (!barStyle || isDecorativeOverlay(bar, barStyle)) continue
        const barRect = bar.getBoundingClientRect()
        if (barRect.height < 24 || barRect.width < 80) continue
        for (const el of textNodes.slice(0, 80)) {
          if (bar.contains(el) || el.contains(bar)) continue
          const style = computedStyle(context.document, el)
          if (!style || !isVisible(el, style)) continue
          const rect = el.getBoundingClientRect()
          const overlapY =
            Math.min(barRect.bottom, rect.bottom) - Math.max(barRect.top, rect.top)
          const overlapX =
            Math.min(barRect.right, rect.right) - Math.max(barRect.left, rect.left)
          if (overlapY > 12 && overlapX > 12) {
            inspected++
            issues.push(
              issueFromElement(el, {
                severity: 'warning',
                title: 'Content under sticky/fixed layer',
                explanation: 'Important content intersects a sticky/fixed element and may be obscured.',
                category: 'overlap',
                confidence: 0.7,
                actual: { overlapY, overlapX },
                expected: { overlapYMax: 0 },
                intersectionArea: overlapX * overlapY,
                recommendation: 'Add scroll padding or adjust z-index/spacing so content is not covered.',
                measurementSignature: `sticky:${Math.round(overlapX * overlapY)}`,
              }),
            )
            break
          }
        }
      }
      return { issues, inspected }
    })
  },
}

export const unexpectedScrollbarRule: AnalysisRule = {
  id: asRuleId('unexpected-scrollbar'),
  name: 'Unexpected scrollbar',
  description: 'Detects horizontal scrollbar on the document root.',
  category: 'overflow',
  defaultSeverity: 'warning',
  version: '1.0.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const doc = context.document
      const el = doc.documentElement
      const hasH = el.scrollWidth > el.clientWidth + 1
      const issues: RuleIssueData[] = []
      if (hasH) {
        issues.push({
          severity: 'warning',
          title: 'Unexpected horizontal scrollbar',
          explanation: `Document shows a horizontal scrollbar (scrollWidth ${el.scrollWidth}px vs clientWidth ${el.clientWidth}px).`,
          selector: 'html',
          elementPath: 'html',
          category: 'overflow',
          confidence: 0.9,
          actual: { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth },
          expected: { horizontalScrollbar: false },
          recommendation: 'Remove overflowing children or constrain widths to the viewport.',
          measurementSignature: `hscroll:${el.scrollWidth - el.clientWidth}`,
        })
      }
      return { issues, inspected: 1 }
    })
  },
}

export const smallTextRule: AnalysisRule = {
  id: asRuleId('small-text'),
  name: 'Very small text',
  description: 'Detects readable text below 12px.',
  category: 'typography',
  defaultSeverity: 'info',
  version: '1.0.0',
  supports: requiresDom,
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const issues: RuleIssueData[] = []
      const nodes = Array.from(
        context.document.body?.querySelectorAll('p, span, a, li, label, button, td, th, h1, h2, h3') ??
          [],
      )
      let inspected = 0
      for (const el of nodes) {
        inspected++
        const style = computedStyle(context.document, el)
        if (!style || !isVisible(el, style)) continue
        if ((el.textContent?.trim().length ?? 0) < 2) continue
        const size = parsePx(style.fontSize)
        if (size > 0 && size < 12) {
          issues.push(
            issueFromElement(el, {
              severity: 'info',
              title: 'Very small text',
              explanation: `Font size is ${size}px, which may be hard to read.`,
              category: 'typography',
              confidence: 0.8,
              actual: { fontSize: size },
              expected: { fontSizeMin: 12 },
              evidenceStyles: styleEvidence(style, ['font-size', 'line-height']),
              recommendation: 'Use at least 12–14px body text on small screens.',
              measurementSignature: `fontsize:${size}`,
            }),
          )
        }
      }
      return { issues, inspected }
    })
  },
}

export const imageDimensionShiftRule: AnalysisRule = {
  id: asRuleId('image-layout-shift'),
  name: 'Layout shift risk from images',
  description: 'Images without width/height attributes or aspect-ratio may cause layout shift.',
  category: 'media',
  defaultSeverity: 'info',
  version: '1.0.0',
  supports(ctx) {
    const base = requiresDom(ctx)
    if (!base.applicable) return base
    if (ctx.document.images.length === 0) return { applicable: false, reason: 'No images in document.' }
    return { applicable: true }
  },
  getRecommendation: baseRec,
  evaluate(context) {
    return timed(context, () => {
      const issues: RuleIssueData[] = []
      for (const img of Array.from(context.document.images)) {
        const style = computedStyle(context.document, img)
        if (!style || !isVisible(img, style)) continue
        const hasAttr = img.hasAttribute('width') && img.hasAttribute('height')
        const hasAspect = style.aspectRatio && style.aspectRatio !== 'auto'
        if (!hasAttr && !hasAspect) {
          issues.push(
            issueFromElement(img, {
              severity: 'info',
              title: 'Image layout shift risk',
              explanation: 'Image has no width/height attributes or CSS aspect-ratio.',
              category: 'media',
              confidence: 0.7,
              actual: { hasWidthAttr: img.hasAttribute('width'), hasHeightAttr: img.hasAttribute('height'), aspectRatio: style.aspectRatio },
              expected: { reservedSpace: true },
              recommendation: 'Set width/height attributes or aspect-ratio to reduce layout shift.',
              measurementSignature: 'cls-img',
            }),
          )
        }
      }
      return { issues, inspected: context.document.images.length }
    })
  },
}

export const BUILTIN_RULES: AnalysisRule[] = [
  horizontalOverflowRule,
  outsideViewportRule,
  overlappingRule,
  textClippingRule,
  imageOverflowRule,
  missingAltRule,
  brokenImageRule,
  brokenLinkRule,
  fixedWidthRule,
  smallTouchTargetRule,
  inaccessibleControlRule,
  duplicateIdRule,
  invalidAriaRule,
  unlabelledControlRule,
  stickyObstructionRule,
  unexpectedScrollbarRule,
  smallTextRule,
  imageDimensionShiftRule,
]
