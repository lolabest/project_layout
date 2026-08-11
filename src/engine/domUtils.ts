import type { BoxSides } from '../models/types'

export { getCssSelector, getElementPath, buildIssueKey } from './selectors'

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/([^\w-])/g, '\\$1')
}

export function parsePx(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

export function getBoxSides(
  style: CSSStyleDeclaration,
  prefix: 'margin' | 'padding' | 'border',
): BoxSides {
  if (prefix === 'border') {
    return {
      top: parsePx(style.borderTopWidth),
      right: parsePx(style.borderRightWidth),
      bottom: parsePx(style.borderBottomWidth),
      left: parsePx(style.borderLeftWidth),
    }
  }
  return {
    top: parsePx(style.getPropertyValue(`${prefix}-top`)),
    right: parsePx(style.getPropertyValue(`${prefix}-right`)),
    bottom: parsePx(style.getPropertyValue(`${prefix}-bottom`)),
    left: parsePx(style.getPropertyValue(`${prefix}-left`)),
  }
}

export function rectsOverlap(
  a: { top: number; left: number; width: number; height: number },
  b: { top: number; left: number; width: number; height: number },
  minOverlap = 4,
): boolean {
  const overlapX = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
  const overlapY = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  return overlapX > minOverlap && overlapY > minOverlap
}

export function isVisible(element: Element, style: CSSStyleDeclaration): boolean {
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function createId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function getAccessibleName(element: Element): string {
  const ariaLabel = element.getAttribute('aria-label')?.trim()
  if (ariaLabel) return ariaLabel

  const labelledBy = element.getAttribute('aria-labelledby')?.trim()
  if (labelledBy && element.ownerDocument) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument!.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
    if (parts.length) return parts.join(' ')
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.labels && element.labels.length > 0) {
      return Array.from(element.labels)
        .map((l) => l.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
    }
  }

  const text = element.textContent?.trim()
  if (text) return text
  if (element instanceof HTMLImageElement) return element.alt || ''
  return element.getAttribute('title')?.trim() ?? ''
}

void cssEscape
