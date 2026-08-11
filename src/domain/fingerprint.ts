import { asFingerprint, type SourceFingerprint } from './ids'

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim())
    parsed.hash = ''
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.replace(/\/+$/, '') || '/'
    return `${parsed.protocol}//${host}${path}${parsed.search}`
  } catch {
    return normalizeWhitespace(url.toLowerCase())
  }
}

/** Simple deterministic non-crypto hash for fingerprinting (browser-safe). */
export function hashString(input: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x811c9dc5 ^ 0xdeadbeef
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h1 >>> 16)
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

export function fingerprintMarkup(html: string, css: string): SourceFingerprint {
  const normalized = `markup|${normalizeWhitespace(html)}|${normalizeWhitespace(css)}`
  return asFingerprint(hashString(normalized))
}

export function fingerprintUrl(url: string, metadata = ''): SourceFingerprint {
  const normalized = `url|${normalizeUrl(url)}|${normalizeWhitespace(metadata)}`
  return asFingerprint(hashString(normalized))
}

export function fingerprintSource(input: {
  mode: 'url' | 'markup'
  url: string
  html: string
  css: string
}): SourceFingerprint {
  if (input.mode === 'url') return fingerprintUrl(input.url)
  return fingerprintMarkup(input.html, input.css)
}
