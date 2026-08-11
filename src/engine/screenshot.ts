import html2canvas from 'html2canvas'

/**
 * Capture a same-origin iframe document as a PNG data URL.
 * Cross-origin frames cannot be captured due to browser security.
 */
export async function captureIframeScreenshot(
  iframe: HTMLIFrameElement,
): Promise<string | null> {
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win || !doc.body) {
    return null
  }

  try {
    const canvas = await html2canvas(doc.documentElement, {
      backgroundColor: '#ffffff',
      useCORS: false,
      allowTaint: true,
      logging: false,
      width: win.innerWidth,
      height: win.innerHeight,
      windowWidth: win.innerWidth,
      windowHeight: win.innerHeight,
      scale: 1,
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export function canAccessIframe(iframe: HTMLIFrameElement | null): boolean {
  if (!iframe) return false
  try {
    return Boolean(iframe.contentDocument?.body)
  } catch {
    return false
  }
}
