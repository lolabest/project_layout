import { useEffect, useState } from 'react'
import type { ElementMeasurements, IssueDelta } from '../models/types'
import styles from './ElementInspector.module.css'

interface ElementInspectorProps {
  measurements: ElementMeasurements | null
  onApplyStyles: (styles: Record<string, string>) => void
  onUndo: () => void
  onResetElement: () => void
  onResetAll: () => void
  canUndo: boolean
  issueDelta: IssueDelta | null
  scoreBefore: number | null
  scoreAfter: number | null
}

const EDITABLE = [
  'width',
  'height',
  'margin',
  'padding',
  'display',
  'position',
  'font-size',
  'line-height',
  'overflow',
  'color',
  'background-color',
  'border',
] as const

export function ElementInspector({
  measurements,
  onApplyStyles,
  onUndo,
  onResetElement,
  onResetAll,
  canUndo,
  issueDelta,
  scoreBefore,
  scoreAfter,
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
      display: measurements.display,
      position: measurements.positionType,
      'font-size': measurements.fontSize,
      'line-height': measurements.lineHeight,
      overflow: measurements.overflow,
      color: measurements.color,
      'background-color': measurements.backgroundColor,
      border: `${measurements.border.top}px solid`,
    })
  }, [measurements])

  if (!measurements) {
    return (
      <div className={styles.empty}>
        Click an element in the preview to inspect its box model, typography, and accessibility name.
        Edits apply temporarily to the preview only and do not modify the source.
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
            ({measurements.position.left}, {measurements.position.top}) · {measurements.positionType}
          </div>
        </div>
        <div>
          <div className={styles.label}>Display / z-index</div>
          <div className={styles.value}>
            {measurements.display} / {measurements.zIndex}
          </div>
        </div>
        <div>
          <div className={styles.label}>Margin / Padding</div>
          <div className={styles.value}>
            {measurements.margin.top}/{measurements.margin.right}/{measurements.margin.bottom}/
            {measurements.margin.left} · {measurements.padding.top}/{measurements.padding.right}/
            {measurements.padding.bottom}/{measurements.padding.left}
          </div>
        </div>
        <div>
          <div className={styles.label}>Font</div>
          <div className={styles.value}>
            {measurements.fontSize} / {measurements.lineHeight}
          </div>
        </div>
        <div>
          <div className={styles.label}>Overflow</div>
          <div className={styles.value}>
            {measurements.overflow} ({measurements.overflowX}/{measurements.overflowY})
          </div>
        </div>
        <div>
          <div className={styles.label}>Colors</div>
          <div className={styles.value}>
            {measurements.color} / {measurements.backgroundColor}
          </div>
        </div>
        <div>
          <div className={styles.label}>Accessible name</div>
          <div className={styles.value}>{measurements.accessibleName || '—'}</div>
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
          Apply
        </button>
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          Undo last
        </button>
        <button type="button" onClick={onResetElement}>
          Reset element
        </button>
        <button type="button" onClick={onResetAll}>
          Reset all
        </button>
      </div>

      {issueDelta && (
        <div className={styles.delta}>
          <h3 className={styles.heading}>After CSS change</h3>
          <div>
            Resolved: {issueDelta.resolved.length} · Introduced: {issueDelta.introduced.length} ·
            Unchanged: {issueDelta.unchanged.length}
          </div>
          {scoreBefore !== null && scoreAfter !== null && (
            <div>
              Score: {scoreBefore} → {scoreAfter} ({scoreAfter - scoreBefore >= 0 ? '+' : ''}
              {scoreAfter - scoreBefore})
            </div>
          )}
        </div>
      )}
    </div>
  )
}
