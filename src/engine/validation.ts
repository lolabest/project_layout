import type { PreviewSource } from '../models/types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

const URL_PATTERN = /^(https?:\/\/)[^\s/$.?#].[^\s]*$/i

export function validateUrl(url: string): ValidationResult {
  const errors: string[] = []
  const trimmed = url.trim()

  if (!trimmed) {
    errors.push('Please enter a website URL.')
    return { valid: false, errors }
  }

  if (!URL_PATTERN.test(trimmed)) {
    errors.push('URL must start with http:// or https:// and be a valid absolute URL.')
  }

  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      errors.push('Only http and https URLs are supported.')
    }
  } catch {
    errors.push('The URL could not be parsed. Check for typos.')
  }

  return { valid: errors.length === 0, errors }
}

export function validateMarkup(html: string, css: string): ValidationResult {
  const errors: string[] = []
  if (!html.trim() && !css.trim()) {
    errors.push('Paste HTML and/or CSS to preview markup.')
  }
  if (html.trim().length > 500_000) {
    errors.push('HTML input is too large (max ~500KB).')
  }
  if (css.trim().length > 200_000) {
    errors.push('CSS input is too large (max ~200KB).')
  }
  return { valid: errors.length === 0, errors }
}

export function validateSource(source: PreviewSource): ValidationResult {
  if (source.mode === 'url') {
    return validateUrl(source.url)
  }
  return validateMarkup(source.html, source.css)
}

/** Build a sandboxed srcdoc document from pasted HTML/CSS. */
export function buildSrcDoc(html: string, css: string): string {
  const hasHtmlTag = /<html[\s>]/i.test(html)
  if (hasHtmlTag) {
    if (css.trim()) {
      return html.replace(
        /<\/head>/i,
        `<style id="layout-tester-injected">${css}</style></head>`,
      ).replace(
        /<head([^>]*)>/i,
        (match) =>
          match.includes('layout-tester')
            ? match
            : `${match}<style id="layout-tester-injected">${css}</style>`,
      )
    }
    return html
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; }
    img { max-width: 100%; }
    ${css}
  </style>
</head>
<body>
${html || '<p style="font-family: sans-serif; padding: 16px; color: #666;">No HTML provided.</p>'}
</body>
</html>`
}

export function sourceDisplayName(source: PreviewSource): string {
  if (source.name.trim()) return source.name.trim()
  if (source.mode === 'url' && source.url.trim()) {
    try {
      return new URL(source.url.trim()).hostname
    } catch {
      return source.url.trim()
    }
  }
  return 'Pasted markup'
}
