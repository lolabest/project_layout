import { useRef, useState } from 'react'
import { compareImages, fileToDataUrl } from '../engine/comparison'
import styles from './ComparisonPanel.module.css'

interface ComparisonPanelProps {
  open: boolean
  onClose: () => void
  renderedScreenshot: string | null
  onCaptureRendered: () => Promise<string | null>
}

export function ComparisonPanel({
  open,
  onClose,
  renderedScreenshot,
  onCaptureRendered,
}: ComparisonPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [opacity, setOpacity] = useState(0.5)
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
    try {
      const dataUrl = await fileToDataUrl(file)
      setReference(dataUrl)
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
          'Could not capture the preview. Screenshots require same-origin access (use pasted HTML/CSS).',
        )
        setRendered(null)
      } else {
        setRendered(shot)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleCompare = async () => {
    if (!reference || !rendered) {
      setError('Upload a reference image and capture the rendered preview first.')
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
      setError('Comparison failed while processing images.')
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
            <p>Compare a reference design with the rendered preview.</p>
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
          )}
          {similarity !== null && (
            <div className={styles.similarity}>
              Estimated visual similarity: <strong>{similarity}%</strong>
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
                style={{ opacity }}
                className={styles.overlayImg}
              />
            </div>
          )}

          {mode === 'difference' && difference && (
            <div className={styles.diffWrap}>
              <img src={difference} alt="Visual difference heatmap" />
              <p>Red intensity indicates mismatched pixels between reference and rendered preview.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
