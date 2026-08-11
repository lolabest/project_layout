import { useEffect, useState } from 'react'
import type { ElementMeasurements } from '../models/types'
import styles from './ElementInspector.module.css'

interface ElementInspectorProps {
  measurements: ElementMeasurements | null
  onApplyStyles: (styles: Record<string, string>) => void
  onResetStyles: () => void
}

const EDITABLE = [
  'width',
  'height',
  'margin',
  'padding',
  'font-size',
  'color',
  'background-color',
  'max-width',
  'display',
  'position',
] as const

export function ElementInspector({
  measurements,
  onApplyStyles,
  onResetStyles,
}: ElementInspectorProps) {
  const [draft, setDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!measurements) {
      setDraft({})
      return
    }
    setDraft({
      width: `${measurements.width}px`,
      height: `${measurements.height}px`,
      margin: `${measurements.margin.top}px ${measurements.margin.right}px ${measurements.margin.bottom}px ${measurements.margin.left}px`,
      padding: `${measurements.padding.top}px ${measurements.padding.right}px ${measurements.padding.bottom}px ${measurements.padding.left}px`,
      'font-size': measurements.fontSize,
      color: measurements.computedStyles.color ?? '',
      'background-color': measurements.computedStyles['background-color'] ?? '',
      'max-width': measurements.computedStyles['max-width'] ?? '',
      display: measurements.computedStyles.display ?? '',
      position: measurements.computedStyles.position ?? '',
    })
  }, [measurements])

  if (!measurements) {
    return (
      <div className={styles.empty}>
        Click an element in the preview to inspect its box model, typography, and selector. Edits
        apply temporarily to the preview only.
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.block}>
        <div className={styles.label}>Selector</div>
        <code>{measurements.selector}</code>
      </div>

      <div className={styles.grid}>
        <div>
          <div className={styles.label}>Size</div>
          <div className={styles.value}>
            {measurements.width} × {measurements.height}
          </div>
        </div>
        <div>
          <div className={styles.label}>Position</div>
          <div className={styles.value}>
            ({measurements.position.left}, {measurements.position.top})
          </div>
        </div>
        <div>
          <div className={styles.label}>Margin</div>
          <div className={styles.value}>
            {measurements.margin.top}/{measurements.margin.right}/
            {measurements.margin.bottom}/{measurements.margin.left}
          </div>
        </div>
        <div>
          <div className={styles.label}>Padding</div>
          <div className={styles.value}>
            {measurements.padding.top}/{measurements.padding.right}/
            {measurements.padding.bottom}/{measurements.padding.left}
          </div>
        </div>
        <div>
          <div className={styles.label}>Font size</div>
          <div className={styles.value}>{measurements.fontSize}</div>
        </div>
        <div>
          <div className={styles.label}>Tag</div>
          <div className={styles.value}>{measurements.tagName}</div>
        </div>
      </div>

      <h3 className={styles.heading}>Temporary CSS edits</h3>
      <div className={styles.editors}>
        {EDITABLE.map((prop) => (
          <label key={prop}>
            {prop}
            <input
              value={draft[prop] ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, [prop]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => onApplyStyles(draft)}>
          Apply to preview
        </button>
        <button type="button" onClick={onResetStyles}>
          Reset edits
        </button>
      </div>
    </div>
  )
}
