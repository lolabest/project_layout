export interface StabilizeOptions {
  timeoutMs?: number
  quietMs?: number
  signal?: AbortSignal
}

export interface StabilizationMetadata {
  timedOut: boolean
  durationMs: number
  fontStatus: 'ready' | 'timeout' | 'unavailable'
  imageStatus: 'ready' | 'timeout' | 'none'
  mutationCount: number
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

async function waitForFonts(
  doc: Document,
  signal?: AbortSignal,
): Promise<'ready' | 'timeout' | 'unavailable'> {
  const fonts = doc.fonts
  if (!fonts?.ready) return 'unavailable'
  let timedOut = false
  await Promise.race([
    fonts.ready.then(() => undefined),
    wait(1500, signal)
      .then(() => {
        timedOut = true
      })
      .catch(() => undefined),
  ])
  return timedOut ? 'timeout' : 'ready'
}

async function waitForImages(
  doc: Document,
  signal?: AbortSignal,
): Promise<'ready' | 'timeout' | 'none'> {
  const images = Array.from(doc.images)
  const pending = images.filter((img) => !img.complete)
  if (images.length === 0) return 'none'
  if (pending.length === 0) return 'ready'

  let timedOut = false
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
    wait(2500, signal)
      .then(() => {
        timedOut = true
      })
      .catch(() => undefined),
  ])
  return timedOut ? 'timeout' : 'ready'
}

/**
 * Wait until the iframe document is ready enough for layout analysis.
 * Continues even if some assets fail (broken assets become issues).
 */
export async function waitForLayoutStabilization(
  doc: Document,
  options: StabilizeOptions = {},
): Promise<StabilizationMetadata> {
  const timeoutMs = options.timeoutMs ?? 5000
  const quietMs = options.quietMs ?? 80
  const signal = options.signal
  const started = Date.now()
  let mutationCount = 0
  let fontStatus: StabilizationMetadata['fontStatus'] = 'unavailable'
  let imageStatus: StabilizationMetadata['imageStatus'] = 'none'

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

    fontStatus = await waitForFonts(doc, signal)
    imageStatus = await waitForImages(doc, signal)
    await doubleRaf(doc)

    const root = doc.documentElement
    const observer = new MutationObserver((records) => {
      mutationCount += records.length
    })
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    try {
      await wait(quietMs, signal)
      // Second quiet window if mutations occurred
      if (mutationCount > 0) {
        const before = mutationCount
        await wait(quietMs, signal)
        if (mutationCount > before) {
          await wait(quietMs, signal)
        }
      }
    } finally {
      observer.disconnect()
    }
  }

  try {
    await Promise.race([
      run(),
      wait(timeoutMs, signal).then(() => {
        throw new Error('stabilization-timeout')
      }),
    ])
    return {
      timedOut: false,
      durationMs: Date.now() - started,
      fontStatus,
      imageStatus,
      mutationCount,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return {
      timedOut: true,
      durationMs: Date.now() - started,
      fontStatus,
      imageStatus,
      mutationCount,
    }
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
