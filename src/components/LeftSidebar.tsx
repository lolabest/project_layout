import type {
  Orientation,
  PreviewSource,
  SourceMode,
  SourceState,
  ViewportSize,
} from '../models/types'
import { PREDEFINED_VIEWPORTS, VIEWPORT_LIMITS } from '../models/types'
import { applyPreset, createCustomViewport, switchOrientation } from '../engine/viewportUtils'
import styles from './LeftSidebar.module.css'

interface LeftSidebarProps {
  source: PreviewSource
  onSourceChange: (patch: Partial<PreviewSource>) => void
  sourceState: SourceState
  sourceMessage: string | null
  viewport: ViewportSize
  onViewportChange: (viewport: ViewportSize) => void
  orientation: Orientation
  onOrientationChange: (orientation: Orientation) => void
  scale: number
  onScaleChange: (scale: number) => void
  fitToWorkspace: boolean
  onFitToWorkspaceChange: (fit: boolean) => void
  onLoad: () => void
  errors: string[]
  sessions: Array<{ id: string; name: string; updatedAt: string; status?: string }>
  onLoadSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onSaveSession: () => void
  onSwitchToMarkup: () => void
}

export function LeftSidebar(props: LeftSidebarProps) {
  const {
    source,
    onSourceChange,
    viewport,
    onViewportChange,
    orientation,
    onOrientationChange,
    scale,
    onScaleChange,
    fitToWorkspace,
    onFitToWorkspaceChange,
  } = props

  const setMode = (mode: SourceMode) => {
    if (mode === 'markup') props.onSwitchToMarkup()
    else onSourceChange({ mode })
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Source & Viewport</h2>
        <span className={styles.stateBadge}>{props.sourceState}</span>
      </div>
      <div className={styles.body}>
        <div className={styles.segmented}>
          <button
            type="button"
            className={source.mode === 'url' ? styles.active : ''}
            onClick={() => setMode('url')}
          >
            Website URL
          </button>
          <button
            type="button"
            className={source.mode === 'markup' ? styles.active : ''}
            onClick={() => setMode('markup')}
          >
            HTML / CSS
          </button>
        </div>

        <div className={styles.field}>
          <label htmlFor="source-name">Session name</label>
          <input
            id="source-name"
            value={source.name}
            onChange={(e) => onSourceChange({ name: e.target.value })}
            placeholder="My layout test"
          />
        </div>

        {source.mode === 'url' ? (
          <div className={styles.field}>
            <label htmlFor="source-url">Public website URL</label>
            <input
              id="source-url"
              value={source.url}
              onChange={(e) => onSourceChange({ url: e.target.value })}
              placeholder="https://example.com"
            />
            <p className={styles.hint}>
              External sites may block iframe embedding (X-Frame-Options / CSP). This tool does not
              bypass browser security. If blocked, switch to HTML/CSS mode.
            </p>
            {(props.sourceState === 'blocked' || props.sourceState === 'failed') && (
              <button type="button" className={styles.secondaryBtn} onClick={props.onSwitchToMarkup}>
                Switch to HTML/CSS mode
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={styles.field}>
              <label htmlFor="source-html">HTML</label>
              <textarea
                id="source-html"
                value={source.html}
                onChange={(e) => onSourceChange({ html: e.target.value })}
                placeholder="<div class='hero'>...</div>"
                rows={8}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="source-css">CSS</label>
              <textarea
                id="source-css"
                value={source.css}
                onChange={(e) => onSourceChange({ css: e.target.value })}
                placeholder=".hero { width: 1200px; }"
                rows={6}
              />
            </div>
          </>
        )}

        {props.sourceMessage && (
          <p className={styles.hint}>
            <strong>State:</strong> {props.sourceMessage}
          </p>
        )}

        {props.errors.length > 0 && (
          <div className={styles.errors} role="alert">
            {props.errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        )}

        <button type="button" className={styles.loadBtn} onClick={props.onLoad}>
          {props.sourceState === 'modified' ? 'Apply & Load Preview' : 'Load Preview'}
        </button>

        <h3 className={styles.sectionTitle}>Viewport</h3>
        <div className={styles.presets}>
          {PREDEFINED_VIEWPORTS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={
                viewport.name.startsWith(preset.name) || viewport.id.startsWith(preset.id)
                  ? styles.presetActive
                  : ''
              }
              onClick={() => onViewportChange(applyPreset(preset, orientation))}
            >
              {preset.name}
              <span>
                {orientation === 'landscape' && preset.width < preset.height
                  ? `${preset.height}×${preset.width}`
                  : `${preset.width}×${preset.height}`}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="vp-w">Width ({VIEWPORT_LIMITS.minWidth}–{VIEWPORT_LIMITS.maxWidth})</label>
            <input
              id="vp-w"
              type="number"
              min={VIEWPORT_LIMITS.minWidth}
              max={VIEWPORT_LIMITS.maxWidth}
              value={viewport.width}
              onChange={(e) =>
                onViewportChange(createCustomViewport(Number(e.target.value) || 0, viewport.height))
              }
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="vp-h">Height ({VIEWPORT_LIMITS.minHeight}–{VIEWPORT_LIMITS.maxHeight})</label>
            <input
              id="vp-h"
              type="number"
              min={VIEWPORT_LIMITS.minHeight}
              max={VIEWPORT_LIMITS.maxHeight}
              value={viewport.height}
              onChange={(e) =>
                onViewportChange(createCustomViewport(viewport.width, Number(e.target.value) || 0))
              }
            />
          </div>
        </div>

        <div className={styles.segmented}>
          <button
            type="button"
            className={orientation === 'portrait' ? styles.active : ''}
            onClick={() => {
              const next = switchOrientation(viewport, 'portrait')
              onOrientationChange(next.orientation)
              onViewportChange(next.viewport)
            }}
          >
            Portrait
          </button>
          <button
            type="button"
            className={orientation === 'landscape' ? styles.active : ''}
            onClick={() => {
              const next = switchOrientation(viewport, 'landscape')
              onOrientationChange(next.orientation)
              onViewportChange(next.viewport)
            }}
          >
            Landscape
          </button>
        </div>

        <div className={styles.field}>
          <label htmlFor="scale">
            Scale {fitToWorkspace ? '(fit)' : `${Math.round(scale * 100)}%`}
          </label>
          <input
            id="scale"
            type="range"
            min={0.25}
            max={1.5}
            step={0.05}
            value={scale}
            disabled={fitToWorkspace}
            onChange={(e) => onScaleChange(Number(e.target.value))}
          />
        </div>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={fitToWorkspace}
            onChange={(e) => onFitToWorkspaceChange(e.target.checked)}
          />
          Scale preview to fit workspace
        </label>

        <div className={styles.dimReadout}>
          Current viewport: <strong>{viewport.width} × {viewport.height}</strong>
        </div>

        <h3 className={styles.sectionTitle}>Saved sessions</h3>
        <button type="button" className={styles.secondaryBtn} onClick={props.onSaveSession}>
          Save current session
        </button>
        <ul className={styles.sessionList}>
          {props.sessions.length === 0 && <li className={styles.empty}>No saved sessions yet.</li>}
          {props.sessions.map((session) => (
            <li key={session.id}>
              <button type="button" onClick={() => props.onLoadSession(session.id)}>
                <span>
                  {session.name}
                  {session.status ? ` · ${session.status}` : ''}
                </span>
                <small>{new Date(session.updatedAt).toLocaleString()}</small>
              </button>
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={() => props.onDeleteSession(session.id)}
                aria-label={`Delete session ${session.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
