export interface StabilizeOptions {
  timeoutMs?: number
  quietMs?: number
  signal?: AbortSignal
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(() => resolve(), ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

function doubleRaf(doc: Document): Promise<void> {
  const view = doc.defaultView ?? window
  return new Promise((resolve) => {
    view.requestAnimationFrame(() => {
      view.requestAnimationFrame(() => resolve())
    })
  })
}

async function waitForFonts(doc: Document, signal?: AbortSignal): Promise<void> {
  const fonts = doc.fonts
  if (!fonts?.ready) return
  await Promise.race([
    fonts.ready.then(() => undefined),
    wait(1500, signal).catch(() => undefined),
  ])
}

async function waitForImages(doc: Document, signal?: AbortSignal): Promise<void> {
  const images = Array.from(doc.images)
  const pending = images.filter((img) => !img.complete)
  if (pending.length === 0) return

  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            const done = () => resolve()
            img.addEventListener('load', done, { once: true })
            img.addEventListener('error', done, { once: true })
          }),
      ),
    ),
    wait(2500, signal).catch(() => undefined),
  ])
}

/**
 * Wait until the iframe document is ready enough for layout analysis.
 * Continues even if some assets fail (broken assets become issues).
 */
export async function waitForLayoutStabilization(
  doc: Document,
  options: StabilizeOptions = {},
): Promise<{ timedOut: boolean }> {
  const timeoutMs = options.timeoutMs ?? 5000
  const quietMs = options.quietMs ?? 80
  const signal = options.signal
  const started = Date.now()

  const run = async () => {
    if (doc.readyState !== 'complete') {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => resolve()
        doc.addEventListener('readystatechange', () => {
          if (doc.readyState === 'complete') onReady()
        })
        doc.defaultView?.addEventListener('load', onReady, { once: true })
        void wait(timeoutMs, signal).then(onReady, reject)
      })
    }

    await waitForFonts(doc, signal)
    await waitForImages(doc, signal)
    await doubleRaf(doc)
    await wait(quietMs, signal)
  }

  try {
    await Promise.race([
      run(),
      wait(timeoutMs, signal).then(() => {
        throw new Error('stabilization-timeout')
      }),
    ])
    return { timedOut: false }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { timedOut: Date.now() - started >= timeoutMs - 10 }
  }
}

export function createAnalysisController(): {
  controller: AbortController
  isStale: () => boolean
  cancel: () => void
} {
  const controller = new AbortController()
  let cancelled = false
  return {
    controller,
    isStale: () => cancelled || controller.signal.aborted,
    cancel: () => {
      cancelled = true
      controller.abort()
    },
  }
}
