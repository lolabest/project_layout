import type { BoxSides } from '../models/types'

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/([^\w-])/g, '\\$1')
}

/** Generate a reasonably unique CSS selector for an element. */
export function getCssSelector(element: Element): string {
  if (element.id) {
    const idSelector = `#${cssEscape(element.id)}`
    try {
      if (element.ownerDocument.querySelectorAll(idSelector).length === 1) {
        return idSelector
      }
    } catch {
      /* ignore invalid id */
    }
  }

  const parts: string[] = []
  let current: Element | null = element

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase()
    if (tag === 'html') {
      parts.unshift('html')
      break
    }
    if (tag === 'body') {
      parts.unshift('body')
      break
    }

    let part = tag
    if (current.classList.length > 0) {
      const classes = Array.from(current.classList)
        .slice(0, 2)
        .map((c) => `.${cssEscape(c)}`)
        .join('')
      part += classes
    }

    const parentEl: Element | null = current.parentElement
    if (parentEl) {
      const siblings = Array.from(parentEl.children).filter(
        (child: Element) => child.tagName === current!.tagName,
      )
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        part += `:nth-of-type(${index})`
      }
    }

    parts.unshift(part)
    current = parentEl
    if (parts.length >= 5) break
  }

  return parts.join(' > ')
}

export function parsePx(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

export function getBoxSides(
  style: CSSStyleDeclaration,
  prefix: 'margin' | 'padding',
): BoxSides {
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
