import type { ElementMeasurements } from '../models/types'
import { getBoxSides, getCssSelector, parsePx } from './domUtils'

export function measureElement(element: Element): ElementMeasurements {
  const doc = element.ownerDocument
  const style = doc.defaultView?.getComputedStyle(element)
  const rect = element.getBoundingClientRect()

  if (!style) {
    return {
      selector: getCssSelector(element),
      tagName: element.tagName.toLowerCase(),
      width: rect.width,
      height: rect.height,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      position: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      },
      fontSize: '',
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
    'z-index',
    'box-sizing',
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
    position: {
      top: Math.round(rect.top * 100) / 100,
      left: Math.round(rect.left * 100) / 100,
      right: Math.round(rect.right * 100) / 100,
      bottom: Math.round(rect.bottom * 100) / 100,
    },
    fontSize: style.fontSize,
    computedStyles,
  }
}

export function applyTemporaryStyles(
  element: HTMLElement,
  styles: Record<string, string>,
): () => void {
  const previous: Record<string, string> = {}
  for (const [prop, value] of Object.entries(styles)) {
    previous[prop] = element.style.getPropertyValue(prop)
    element.style.setProperty(prop, value)
  }

  return () => {
    for (const [prop, value] of Object.entries(previous)) {
      if (value) {
        element.style.setProperty(prop, value)
      } else {
        element.style.removeProperty(prop)
      }
    }
  }
}

export function parseNumericStyle(value: string): number {
  return parsePx(value)
}
