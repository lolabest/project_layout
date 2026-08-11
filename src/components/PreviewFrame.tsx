import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { InspectionSettings, PreviewSource, ViewportSize } from '../models/types'
import { buildSrcDoc } from '../engine/validation'
import { canAccessIframe } from '../engine/screenshot'
import styles from './PreviewFrame.module.css'

export interface PreviewFrameHandle {
  getIframe: () => HTMLIFrameElement | null
  getDocument: () => Document | null
}

interface PreviewFrameProps {
  source: PreviewSource
  loadedKey: number
  viewport: ViewportSize
  scale: number
  fitToWorkspace: boolean
  inspection: InspectionSettings
  highlightSelector: string | null
  selectedSelector: string | null
  onSelectElement: (selector: string | null, element: Element | null) => void
  onFrameStatus: (status: {
    loading: boolean
    loaded: boolean
    blocked: boolean
    accessible: boolean
    message?: string
  }) => void
  overlayOpacity?: number
  overlayImage?: string | null
  showOverlay?: boolean
}

export const PreviewFrame = forwardRef<PreviewFrameHandle, PreviewFrameProps>(
  function PreviewFrame(props, ref) {
    const {
      source,
      loadedKey,
      viewport,
      scale,
      fitToWorkspace,
      inspection,
      highlightSelector,
      selectedSelector,
      onSelectElement,
      onFrameStatus,
      overlayOpacity = 0.5,
      overlayImage = null,
      showOverlay = false,
    } = props

    const iframeRef = useRef<HTMLIFrameElement>(null)
    const workspaceRef = useRef<HTMLDivElement>(null)
    const [fitScale, setFitScale] = useState(1)
    const [hoverBox, setHoverBox] = useState<DOMRect | null>(null)
    const [selectedBox, setSelectedBox] = useState<DOMRect | null>(null)
    const [highlightBox, setHighlightBox] = useState<DOMRect | null>(null)
    const [spacingBoxes, setSpacingBoxes] = useState<{
      margin: DOMRect
      padding: { top: number; right: number; bottom: number; left: number }
      content: DOMRect
    } | null>(null)

    const srcDoc = useMemo(() => {
      if (source.mode !== 'markup') return undefined
      return buildSrcDoc(source.html, source.css)
    }, [source.mode, source.html, source.css])

    const iframeSrc = source.mode === 'url' ? source.url.trim() : undefined

    useImperativeHandle(ref, () => ({
      getIframe: () => iframeRef.current,
      getDocument: () => {
        try {
          return iframeRef.current?.contentDocument ?? null
        } catch {
          return null
        }
      },
    }))

    useEffect(() => {
      if (!fitToWorkspace || !workspaceRef.current) {
        setFitScale(1)
        return
      }
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const { width, height } = entry.contentRect
        const pad = 48
        const sx = (width - pad) / viewport.width
        const sy = (height - pad) / viewport.height
        setFitScale(Math.max(0.2, Math.min(1, Math.min(sx, sy))))
      })
      observer.observe(workspaceRef.current)
      return () => observer.disconnect()
    }, [fitToWorkspace, viewport.width, viewport.height])

    const effectiveScale = fitToWorkspace ? fitScale : scale

    useEffect(() => {
      onFrameStatus({
        loading: true,
        loaded: false,
        blocked: false,
        accessible: false,
      })
    }, [loadedKey, source.mode, source.url, srcDoc, onFrameStatus])

    const handleLoad = () => {
      const iframe = iframeRef.current
      if (!iframe) return

      const accessible = canAccessIframe(iframe)
      if (source.mode === 'url' && !accessible) {
        onFrameStatus({
          loading: false,
          loaded: true,
          blocked: true,
          accessible: false,
          message:
            'This website blocked iframe embedding or cross-origin access (X-Frame-Options, CSP, or CORS). You can still attempt to view it if allowed, but layout analysis requires same-origin access. Paste HTML/CSS to analyze markup locally.',
        })
        return
      }

      onFrameStatus({
        loading: false,
        loaded: true,
        blocked: false,
        accessible,
        message: accessible
          ? 'Preview loaded. Layout analysis is available.'
          : 'Preview loaded but document access is restricted.',
      })

      if (accessible && iframe.contentDocument) {
        wireInspection(iframe.contentDocument)
      }
    }

    const wireInspection = (doc: Document) => {
      const onMove = (event: MouseEvent) => {
        const target = event.target as Element | null
        if (!target || target === doc.documentElement || target === doc.body) {
          setHoverBox(null)
          return
        }
        setHoverBox(target.getBoundingClientRect())
      }

      const onClick = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        const target = event.target as Element | null
        if (!target || target === doc.documentElement) {
          onSelectElement(null, null)
          setSelectedBox(null)
          setSpacingBoxes(null)
          return
        }
        const rect = target.getBoundingClientRect()
        setSelectedBox(rect)
        const style = doc.defaultView?.getComputedStyle(target)
        if (inspection.spacingMode && style) {
          setSpacingBoxes({
            margin: rect,
            padding: {
              top: Number.parseFloat(style.paddingTop) || 0,
              right: Number.parseFloat(style.paddingRight) || 0,
              bottom: Number.parseFloat(style.paddingBottom) || 0,
              left: Number.parseFloat(style.paddingLeft) || 0,
            },
            content: rect,
          })
        }
        const selector = buildQuickSelector(target)
        onSelectElement(selector, target)
      }

      doc.addEventListener('mousemove', onMove)
      doc.addEventListener('click', onClick, true)

      // Cleanup previous listeners via replace is hard; re-bind each load is fine for srcdoc reloads
    }

    useEffect(() => {
      const doc = iframeRef.current?.contentDocument
      if (!doc || !highlightSelector) {
        setHighlightBox(null)
        return
      }
      try {
        const el = doc.querySelector(highlightSelector)
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          setHighlightBox(el.getBoundingClientRect())
        } else {
          setHighlightBox(null)
        }
      } catch {
        setHighlightBox(null)
      }
    }, [highlightSelector, loadedKey, viewport.width, viewport.height])

    useEffect(() => {
      const doc = iframeRef.current?.contentDocument
      if (!doc || !selectedSelector) {
        setSelectedBox(null)
        return
      }
      try {
        const el = doc.querySelector(selectedSelector)
        if (el) {
          const rect = el.getBoundingClientRect()
          setSelectedBox(rect)
          if (inspection.spacingMode) {
            const style = doc.defaultView?.getComputedStyle(el)
            if (style) {
              setSpacingBoxes({
                margin: rect,
                padding: {
                  top: Number.parseFloat(style.paddingTop) || 0,
                  right: Number.parseFloat(style.paddingRight) || 0,
                  bottom: Number.parseFloat(style.paddingBottom) || 0,
                  left: Number.parseFloat(style.paddingLeft) || 0,
                },
                content: rect,
              })
            }
          } else {
            setSpacingBoxes(null)
          }
        }
      } catch {
        /* ignore */
      }
    }, [selectedSelector, inspection.spacingMode, loadedKey, viewport])

    useEffect(() => {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return
      let styleEl = doc.getElementById('layout-tester-outline') as HTMLStyleElement | null
      if (inspection.outlineMode) {
        if (!styleEl) {
          styleEl = doc.createElement('style')
          styleEl.id = 'layout-tester-outline'
          doc.head.appendChild(styleEl)
        }
        styleEl.textContent = `* { outline: 1px solid rgba(61, 139, 253, 0.45) !important; }`
      } else if (styleEl) {
        styleEl.remove()
      }
    }, [inspection.outlineMode, loadedKey])

    const showPreview = loadedKey > 0 && (Boolean(iframeSrc) || Boolean(srcDoc))

    return (
      <div className={styles.workspace} ref={workspaceRef}>
        {!showPreview && (
          <div className={styles.empty}>
            <h3>No preview loaded</h3>
            <p>
              Enter a public URL or paste HTML/CSS in the left panel, then click{' '}
              <strong>Load Preview</strong>.
            </p>
          </div>
        )}

        {showPreview && (
          <div
            className={styles.stage}
            style={{
              width: viewport.width * effectiveScale + (inspection.showRulers ? 24 : 0),
              height: viewport.height * effectiveScale + (inspection.showRulers ? 24 : 0),
            }}
          >
            {inspection.showRulers && (
              <>
                <div className={styles.rulerCorner} />
                <div
                  className={styles.rulerX}
                  style={{
                    width: viewport.width * effectiveScale,
                    backgroundSize: `${50 * effectiveScale}px 100%`,
                  }}
                />
                <div
                  className={styles.rulerY}
                  style={{
                    height: viewport.height * effectiveScale,
                    backgroundSize: `100% ${50 * effectiveScale}px`,
                  }}
                />
              </>
            )}

            <div
              className={styles.device}
              style={{
                width: viewport.width * effectiveScale,
                height: viewport.height * effectiveScale,
                marginLeft: inspection.showRulers ? 24 : 0,
                marginTop: inspection.showRulers ? 24 : 0,
              }}
            >
              <div
                className={styles.scaler}
                style={{
                  width: viewport.width,
                  height: viewport.height,
                  transform: `scale(${effectiveScale})`,
                }}
              >
                <iframe
                  key={`${loadedKey}-${source.mode}`}
                  ref={iframeRef}
                  className={styles.iframe}
                  title="Website preview"
                  src={iframeSrc}
                  srcDoc={srcDoc}
                  sandbox={
                    source.mode === 'markup'
                      ? 'allow-scripts allow-same-origin'
                      : 'allow-scripts allow-same-origin allow-forms allow-popups'
                  }
                  onLoad={handleLoad}
                />

                {(inspection.showGrid || inspection.showBreakpoints) && (
                  <div className={styles.overlayLayer} aria-hidden>
                    {inspection.showGrid && (
                      <div
                        className={styles.grid}
                        style={{
                          backgroundSize: `${inspection.gridSize}px ${inspection.gridSize}px`,
                        }}
                      />
                    )}
                    {inspection.showBreakpoints && (
                      <>
                        <div className={styles.bp} style={{ left: 375 }} title="375 mobile" />
                        <div className={styles.bp} style={{ left: 768 }} title="768 tablet" />
                        <div className={styles.bp} style={{ left: 1440 }} title="1440 laptop" />
                      </>
                    )}
                  </div>
                )}

                {hoverBox && (
                  <div
                    className={styles.hoverBox}
                    style={{
                      top: hoverBox.top,
                      left: hoverBox.left,
                      width: hoverBox.width,
                      height: hoverBox.height,
                    }}
                  />
                )}
                {selectedBox && (
                  <div
                    className={styles.selectedBox}
                    style={{
                      top: selectedBox.top,
                      left: selectedBox.left,
                      width: selectedBox.width,
                      height: selectedBox.height,
                    }}
                  />
                )}
                {highlightBox && (
                  <div
                    className={styles.highlightBox}
                    style={{
                      top: highlightBox.top,
                      left: highlightBox.left,
                      width: highlightBox.width,
                      height: highlightBox.height,
                    }}
                  />
                )}
                {inspection.spacingMode && spacingBoxes && (
                  <div
                    className={styles.spacingPad}
                    style={{
                      top: spacingBoxes.content.top,
                      left: spacingBoxes.content.left,
                      width: spacingBoxes.content.width,
                      height: spacingBoxes.content.height,
                      borderTopWidth: spacingBoxes.padding.top,
                      borderRightWidth: spacingBoxes.padding.right,
                      borderBottomWidth: spacingBoxes.padding.bottom,
                      borderLeftWidth: spacingBoxes.padding.left,
                    }}
                  />
                )}

                {showOverlay && overlayImage && (
                  <img
                    className={styles.refOverlay}
                    src={overlayImage}
                    alt=""
                    style={{ opacity: overlayOpacity }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  },
)

function buildQuickSelector(element: Element): string {
  const escape =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape.bind(CSS)
      : (value: string) => value.replace(/([^\w-])/g, '\\$1')

  if (element.id) return `#${escape(element.id)}`
  const path: string[] = []
  let current: Element | null = element
  while (current && path.length < 4) {
    let part = current.tagName.toLowerCase()
    if (current.classList.length) {
      part += `.${escape(current.classList[0])}`
    }
    const parentEl: Element | null = current.parentElement
    if (parentEl) {
      const siblings = Array.from(parentEl.children).filter(
        (c: Element) => c.tagName === current!.tagName,
      )
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`
      }
    }
    path.unshift(part)
    current = parentEl
    if (current?.tagName === 'BODY') break
  }
  return path.join(' > ')
}
