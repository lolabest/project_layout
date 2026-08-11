import styles from './Toolbar.module.css'

interface ToolbarProps {
  onLoad: () => void
  onRefresh: () => void
  onRunAnalysis: () => void
  onRunAllViewports: () => void
  onToggleGrid: () => void
  onToggleOutline: () => void
  onToggleRulers: () => void
  onToggleSpacing: () => void
  onOpenComparison: () => void
  onExportJson: () => void
  onExportHtml: () => void
  onToggleLeft: () => void
  onToggleRight: () => void
  gridActive: boolean
  outlineActive: boolean
  rulersActive: boolean
  spacingActive: boolean
  comparisonActive: boolean
  loading: boolean
  hasPreview: boolean
  hasIssues: boolean
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header className={styles.toolbar}>
      <div className={styles.brand}>
        <span className={styles.logo}>LT</span>
        <div>
          <div className={styles.title}>Layout Tester</div>
          <div className={styles.subtitle}>Visual website layout testing</div>
        </div>
      </div>

      <div className={styles.group}>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={props.onLoad}>
          Load Preview
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={props.onRefresh}
          disabled={!props.hasPreview || props.loading}
        >
          Refresh
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={props.onRunAnalysis}
          disabled={!props.hasPreview || props.loading}
        >
          Analyze Layout
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={props.onRunAllViewports}
          disabled={!props.hasPreview || props.loading}
        >
          Run All Viewports
        </button>
      </div>

      <div className={styles.group}>
        <button
          type="button"
          className={`${styles.btn} ${props.gridActive ? styles.active : ''}`}
          onClick={props.onToggleGrid}
          aria-pressed={props.gridActive}
        >
          Grid
        </button>
        <button
          type="button"
          className={`${styles.btn} ${props.rulersActive ? styles.active : ''}`}
          onClick={props.onToggleRulers}
          aria-pressed={props.rulersActive}
        >
          Rulers
        </button>
        <button
          type="button"
          className={`${styles.btn} ${props.outlineActive ? styles.active : ''}`}
          onClick={props.onToggleOutline}
          aria-pressed={props.outlineActive}
        >
          Outline
        </button>
        <button
          type="button"
          className={`${styles.btn} ${props.spacingActive ? styles.active : ''}`}
          onClick={props.onToggleSpacing}
          aria-pressed={props.spacingActive}
        >
          Spacing
        </button>
        <button
          type="button"
          className={`${styles.btn} ${props.comparisonActive ? styles.active : ''}`}
          onClick={props.onOpenComparison}
          aria-pressed={props.comparisonActive}
        >
          Compare
        </button>
      </div>

      <div className={styles.group}>
        <button
          type="button"
          className={styles.btn}
          onClick={props.onExportJson}
          disabled={!props.hasIssues}
        >
          Export JSON
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={props.onExportHtml}
          disabled={!props.hasIssues}
        >
          Export HTML
        </button>
        <button type="button" className={styles.btn} onClick={props.onToggleLeft} title="Toggle left panel">
          ‹ Panels
        </button>
        <button type="button" className={styles.btn} onClick={props.onToggleRight} title="Toggle right panel">
          Panels ›
        </button>
      </div>
    </header>
  )
}
