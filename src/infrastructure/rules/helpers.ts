import { getCssSelector, getElementPath } from '../../engine/selectors'
import { isVisible, parsePx } from '../../engine/domUtils'
import type { RuleContext, RuleIssueData } from './types'

export const SKIP_TAGS = new Set([
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

export const OVERLAY_HINTS = /(modal|dialog|tooltip|dropdown|menu|popover|overlay|toast|badge)/i

export function getView(doc: Document): Window | null {
  return doc.defaultView ?? (typeof window !== 'undefined' ? window : null)
}

export function computedStyle(doc: Document, el: Element): CSSStyleDeclaration | null {
  const view = getView(doc)
  if (!view) return null
  try {
    return view.getComputedStyle(el)
  } catch {
    return null
  }
}

export function collectElements(doc: Document, max: number): { elements: Element[]; truncated: boolean } {
  const all = Array.from(doc.body?.querySelectorAll('*') ?? []).filter(
    (el) => !SKIP_TAGS.has(el.tagName),
  )
  return { elements: all.slice(0, max), truncated: all.length > max }
}

export function styleEvidence(style: CSSStyleDeclaration, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of keys) out[key] = style.getPropertyValue(key)
  return out
}

export function issueFromElement(
  el: Element,
  partial: Omit<RuleIssueData, 'selector' | 'elementPath' | 'tagName' | 'boundingRect'> & {
    boundingRect?: RuleIssueData['boundingRect']
  },
): RuleIssueData {
  const rect = el.getBoundingClientRect()
  return {
    ...partial,
    selector: getCssSelector(el),
    elementPath: getElementPath(el),
    tagName: el.tagName.toLowerCase(),
    boundingRect: partial.boundingRect ?? {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
  }
}

export function requiresDom(
  context: RuleContext,
): { applicable: boolean; reason?: string | undefined } {
  if (!context.capabilities.domInspectionAvailable) {
    return {
      applicable: false,
      reason: 'DOM inspection unavailable (cross-origin or blocked preview).',
    }
  }
  if (!context.document.body) {
    return { applicable: false, reason: 'Document body is not available.' }
  }
  return { applicable: true }
}

/**
 * Attribute/structure checks should not require a non-zero box
 * (jsdom often reports 0×0; zero-size controls can still be a11y defects).
 */
export function isPresentInAccessibilityTree(
  style: CSSStyleDeclaration | null,
): boolean {
  if (!style) return true
  return !(
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  )
}

export function isScrollContainer(style: CSSStyleDeclaration): boolean {
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

export function isDecorativeOverlay(el: Element, style: CSSStyleDeclaration): boolean {
  if (style.pointerEvents === 'none') return true
  const cls = el.className?.toString?.() ?? ''
  if (OVERLAY_HINTS.test(cls) || OVERLAY_HINTS.test(el.id)) return true
  const role = el.getAttribute('role')
  if (role && OVERLAY_HINTS.test(role)) return true
  if ((style.position === 'fixed' || style.position === 'sticky') && (el.getAttribute('aria-modal') === 'true' || role === 'dialog')) {
    return true
  }
  return false
}

export function intentionallyOffscreen(style: CSSStyleDeclaration, rect: DOMRect): boolean {
  if (style.position === 'absolute' && (rect.width <= 1 || rect.height <= 1)) return true
  const clipPath = style.clipPath || style.getPropertyValue('clip-path')
  if (clipPath.includes('inset(50%)')) return true
  if (style.overflow === 'hidden' && (rect.width <= 1 || rect.height <= 1)) return true
  return false
}

export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/([^\w-])/g, '\\$1')
}

export { isVisible, parsePx, getCssSelector, getElementPath }
