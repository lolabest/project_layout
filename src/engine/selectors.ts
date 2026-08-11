/** Stable CSS selector + readable DOM path generation. */

const DYNAMIC_CLASS = /^(css-|sc-|emotion-|jsx-|svelte-|astro-|_|tw-)/i
const FRAMEWORK_HASH = /[a-z]+-[a-z0-9]{5,}$/i

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/([^\w-])/g, '\\$1')
}

function isStableClass(name: string): boolean {
  if (!name || name.length > 48) return false
  if (DYNAMIC_CLASS.test(name)) return false
  if (FRAMEWORK_HASH.test(name) && name.includes('_')) return false
  return true
}

function uniqueMatch(doc: Document, selector: string): boolean {
  try {
    return doc.querySelectorAll(selector).length === 1
  } catch {
    return false
  }
}

/** Prefer unique id → data-testid → semantic attrs → stable classes → structural path. */
export function getCssSelector(element: Element): string {
  const doc = element.ownerDocument

  if (element.id && !/^\d/.test(element.id)) {
    const idSel = `#${cssEscape(element.id)}`
    if (uniqueMatch(doc, idSel)) return idSel
  }

  const testId = element.getAttribute('data-testid') || element.getAttribute('data-test-id')
  if (testId) {
    const sel = `[data-testid="${cssEscape(testId)}"]`
    if (uniqueMatch(doc, sel) || element.hasAttribute('data-testid')) {
      return element.hasAttribute('data-testid')
        ? `[data-testid="${cssEscape(testId)}"]`
        : `[data-test-id="${cssEscape(testId)}"]`
    }
  }

  const name = element.getAttribute('name')
  if (name && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(element.tagName)) {
    const sel = `${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`
    if (uniqueMatch(doc, sel)) return sel
  }

  const ariaLabel = element.getAttribute('aria-label')
  if (ariaLabel) {
    const sel = `${element.tagName.toLowerCase()}[aria-label="${cssEscape(ariaLabel)}"]`
    if (uniqueMatch(doc, sel)) return sel
  }

  const role = element.getAttribute('role')
  const stableClasses = Array.from(element.classList).filter(isStableClass).slice(0, 3)
  if (stableClasses.length > 0) {
    let sel = element.tagName.toLowerCase()
    if (role) sel += `[role="${cssEscape(role)}"]`
    sel += stableClasses.map((c) => `.${cssEscape(c)}`).join('')
    if (uniqueMatch(doc, sel)) return sel
  }

  return buildStructuralSelector(element)
}

function buildStructuralSelector(element: Element): string {
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
    const stable = Array.from(current.classList).filter(isStableClass).slice(0, 2)
    if (stable.length) {
      part += stable.map((c) => `.${cssEscape(c)}`).join('')
    }

    const parentEl: Element | null = current.parentElement
    if (parentEl) {
      const siblings = Array.from(parentEl.children).filter(
        (child: Element) => child.tagName === current!.tagName,
      )
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`
      }
    }

    parts.unshift(part)
    current = parentEl
    if (parts.length >= 6) break
  }

  return parts.join(' > ')
}

/** Human-readable DOM path, e.g. body > header.hero > a.cta */
export function getElementPath(element: Element): string {
  const parts: string[] = []
  let current: Element | null = element
  while (current && parts.length < 8) {
    const tag = current.tagName.toLowerCase()
    if (tag === 'html') break
    let part = tag
    if (current.id) {
      part += `#${current.id}`
    } else {
      const cls = Array.from(current.classList).filter(isStableClass)[0]
      if (cls) part += `.${cls}`
    }
    parts.unshift(part)
    current = current.parentElement
    if (tag === 'body') break
  }
  return parts.join(' > ')
}

export function buildIssueKey(ruleId: string, selector: string, viewportId: string): string {
  return `${ruleId}::${selector}::${viewportId}`
}

export function buildCrossViewportKey(ruleId: string, selector: string): string {
  return `${ruleId}::${selector}`
}
