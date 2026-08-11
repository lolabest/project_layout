import type { ElementMeasurements, TemporaryStyleChange } from '../models/types'
import { createId, getAccessibleName, getBoxSides, getCssSelector, parsePx } from './domUtils'

export function measureElement(element: Element): ElementMeasurements {
  const doc = element.ownerDocument
  const style = doc.defaultView?.getComputedStyle(element) ??
    (typeof window !== 'undefined' ? window.getComputedStyle(element) : null)
  const rect = element.getBoundingClientRect()

  if (!style) {
    return {
      selector: getCssSelector(element),
      tagName: element.tagName.toLowerCase(),
      width: rect.width,
      height: rect.height,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      border: { top: 0, right: 0, bottom: 0, left: 0 },
      position: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      },
      display: '',
      positionType: '',
      zIndex: '',
      fontFamily: '',
      fontSize: '',
      lineHeight: '',
      color: '',
      backgroundColor: '',
      overflow: '',
      overflowX: '',
      overflowY: '',
      accessibleName: getAccessibleName(element),
      computedStyles: {},
    }
  }

  const keys = [
    'display',
    'position',
    'width',
    'height',
    'max-width',
    'min-width',
    'color',
    'background-color',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'overflow',
    'overflow-x',
    'overflow-y',
    'z-index',
    'box-sizing',
    'border',
  ]

  const computedStyles: Record<string, string> = {}
  for (const key of keys) {
    computedStyles[key] = style.getPropertyValue(key)
  }

  return {
    selector: getCssSelector(element),
    tagName: element.tagName.toLowerCase(),
    width: Math.round(rect.width * 100) / 100,
    height: Math.round(rect.height * 100) / 100,
    margin: getBoxSides(style, 'margin'),
    padding: getBoxSides(style, 'padding'),
    border: getBoxSides(style, 'border'),
    position: {
      top: Math.round(rect.top * 100) / 100,
      left: Math.round(rect.left * 100) / 100,
      right: Math.round(rect.right * 100) / 100,
      bottom: Math.round(rect.bottom * 100) / 100,
    },
    display: style.display,
    positionType: style.position,
    zIndex: style.zIndex,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    color: style.color,
    backgroundColor: style.backgroundColor,
    overflow: style.overflow,
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    accessibleName: getAccessibleName(element),
    computedStyles,
  }
}

export interface StyleEditSession {
  changes: TemporaryStyleChange[]
  originals: Map<string, Map<string, string>>
}

export function createStyleEditSession(): StyleEditSession {
  return { changes: [], originals: new Map() }
}

export function applyTemporaryStyles(
  element: HTMLElement,
  styles: Record<string, string>,
  session?: StyleEditSession,
): () => void {
  const selector = getCssSelector(element)
  const previous: Record<string, string> = {}

  for (const [prop, value] of Object.entries(styles)) {
    previous[prop] = element.style.getPropertyValue(prop)
    if (session) {
      let map = session.originals.get(selector)
      if (!map) {
        map = new Map()
        session.originals.set(selector, map)
      }
      if (!map.has(prop)) {
        map.set(prop, previous[prop])
      }
      session.changes.push({
        id: createId('css'),
        selector,
        property: prop,
        originalValue: map.get(prop) ?? '',
        modifiedValue: value,
        appliedAt: new Date().toISOString(),
      })
    }
    element.style.setProperty(prop, value)
  }

  return () => {
    for (const [prop, value] of Object.entries(previous)) {
      if (value) element.style.setProperty(prop, value)
      else element.style.removeProperty(prop)
    }
  }
}

export function undoLastChange(
  doc: Document,
  session: StyleEditSession,
): TemporaryStyleChange | null {
  const last = session.changes.pop()
  if (!last) return null
  try {
    const el = doc.querySelector(last.selector) as HTMLElement | null
    if (!el) return last
    // Find previous modified value for same property if any
    const prior = [...session.changes].reverse().find(
      (c) => c.selector === last.selector && c.property === last.property,
    )
    if (prior) {
      el.style.setProperty(last.property, prior.modifiedValue)
    } else {
      const original = session.originals.get(last.selector)?.get(last.property) ?? ''
      if (original) el.style.setProperty(last.property, original)
      else el.style.removeProperty(last.property)
    }
  } catch {
    /* ignore */
  }
  return last
}

export function resetElementStyles(
  doc: Document,
  session: StyleEditSession,
  selector: string,
): void {
  const map = session.originals.get(selector)
  if (!map) return
  try {
    const el = doc.querySelector(selector) as HTMLElement | null
    if (el) {
      for (const [prop, value] of map) {
        if (value) el.style.setProperty(prop, value)
        else el.style.removeProperty(prop)
      }
    }
  } catch {
    /* ignore */
  }
  session.changes = session.changes.filter((c) => c.selector !== selector)
  session.originals.delete(selector)
}

export function resetAllStyles(doc: Document, session: StyleEditSession): void {
  for (const selector of Array.from(session.originals.keys())) {
    resetElementStyles(doc, session, selector)
  }
  session.changes = []
  session.originals.clear()
}

export function parseNumericStyle(value: string): number {
  return parsePx(value)
}
