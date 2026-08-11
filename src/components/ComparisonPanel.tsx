import { useRef, useState } from 'react'
import { compareImages, fileToDataUrl } from '../engine/comparison'
import type { ViewportSize } from '../models/types'
import styles from './ComparisonPanel.module.css'

const MAX_BYTES = 8 * 1024 * 1024

interface ComparisonPanelProps {
  open: boolean
  onClose: () => void
  renderedScreenshot: string | null
  onCaptureRendered: () => Promise<string | null>
  viewport: ViewportSize
}

export function ComparisonPanel({
  open,
  onClose,
  renderedScreenshot,
  onCaptureRendered,
  viewport,
}: ComparisonPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [refMeta, setRefMeta] = useState<{ width: number; height: number } | null>(null)
  const [opacity, setOpacity] = useState(0.5)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [mode, setMode] = useState<'side-by-side' | 'overlay' | 'difference'>('side-by-side')
  const [similarity, setSimilarity] = useState<number | null>(null)
  const [difference, setDifference] = useState<string | null>(null)
  const [rendered, setRendered] = useState<string | null>(renderedScreenshot)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const handleUpload = async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, WebP, etc.).')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Reference image must be 8MB or smaller.')
      return
    }
    try {
      const dataUrl = await fileToDataUrl(file)
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('decode failed'))
        img.src = dataUrl
      })
      setReference(dataUrl)
      setRefMeta({ width: img.naturalWidth, height: img.naturalHeight })
      setError(null)
      setSimilarity(null)
      setDifference(null)
    } catch {
      setError('Failed to read the uploaded image.')
    }
  }

  const handleCapture = async () => {
    setBusy(true)
    setError(null)
    try {
      const shot = await onCaptureRendered()
      if (!shot) {
        setError(
          'Could not capture the preview. Screenshots require same-origin access (use pasted HTML/CSS). Similarity score will not be fabricated.',
        )
        setRendered(null)
        setSimilarity(null)
      } else {
        setRendered(shot)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleCompare = async () => {
    if (!reference || !rendered) {
      setError('Upload a reference image and capture the rendered preview first. No fake similarity score is shown without both images.')
      setSimilarity(null)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await compareImages(reference, rendered)
      setSimilarity(result.similarity)
      setDifference(result.differenceDataUrl)
      setMode('difference')
    } catch {
      setError('Comparison failed while processing images. Similarity score unavailable.')
      setSimilarity(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Screenshot comparison">
      <div className={styles.panel}>
        <header className={styles.header}>
          <div>
            <h2>Screenshot comparison</h2>
            <p>
              Reference for viewport {viewport.name} ({viewport.width}×{viewport.height})
              {refMeta ? ` · image ${refMeta.width}×${refMeta.height}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close comparison">
            ×
          </button>
        </header>

        <div className={styles.controls}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
          />
          <button type="button" onClick={() => fileRef.current?.click()}>
            Upload reference
          </button>
          <button type="button" onClick={handleCapture} disabled={busy}>
            Capture preview
          </button>
          <button type="button" onClick={handleCompare} disabled={busy || !reference || !rendered}>
            Compute difference
          </button>
          <div className={styles.modes}>
            <button
              type="button"
              className={mode === 'side-by-side' ? styles.active : ''}
              onClick={() => setMode('side-by-side')}
            >
              Side by side
            </button>
            <button
              type="button"
              className={mode === 'overlay' ? styles.active : ''}
              onClick={() => setMode('overlay')}
              disabled={!reference || !rendered}
            >
              Overlay
            </button>
            <button
              type="button"
              className={mode === 'difference' ? styles.active : ''}
              onClick={() => setMode('difference')}
              disabled={!difference}
            >
              Difference
            </button>
          </div>
          {mode === 'overlay' && (
            <>
              <label className={styles.opacity}>
                Overlay opacity {Math.round(opacity * 100)}%
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                />
              </label>
              <label className={styles.opacity}>
                Offset X {offsetX}px
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={offsetX}
                  onChange={(e) => setOffsetX(Number(e.target.value))}
                />
              </label>
              <label className={styles.opacity}>
                Offset Y {offsetY}px
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={offsetY}
                  onChange={(e) => setOffsetY(Number(e.target.value))}
                />
              </label>
            </>
          )}
          {similarity !== null ? (
            <div className={styles.similarity}>
              Estimated visual similarity: <strong>{similarity}%</strong>
            </div>
          ) : (
            <div className={styles.similarity}>
              Similarity score shown only when both images can be compared.
            </div>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {busy && <div className={styles.busy}>Working…</div>}

        <div className={styles.viewer}>
          {mode === 'side-by-side' && (
            <div className={styles.sideBySide}>
              <figure>
                <figcaption>Reference</figcaption>
                {reference ? (
                  <img src={reference} alt="Reference design" />
                ) : (
                  <div className={styles.placeholder}>Upload a reference image</div>
                )}
              </figure>
              <figure>
                <figcaption>Rendered</figcaption>
                {rendered ? (
                  <img src={rendered} alt="Rendered preview" />
                ) : (
                  <div className={styles.placeholder}>Capture the preview</div>
                )}
              </figure>
            </div>
          )}

          {mode === 'overlay' && reference && rendered && (
            <div className={styles.overlayWrap}>
              <img src={rendered} alt="Rendered preview" />
              <img
                src={reference}
                alt="Reference overlay"
                style={{ opacity, transform: `translate(${offsetX}px, ${offsetY}px)` }}
                className={styles.overlayImg}
              />
            </div>
          )}

          {mode === 'difference' && difference && (
            <div className={styles.diffWrap}>
              <img src={difference} alt="Visual difference heatmap" />
              <p>Red intensity indicates mismatched pixels. Score is an estimate, not a compliance metric.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
