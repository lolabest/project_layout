import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Toolbar } from './components/Toolbar'
import { LeftSidebar } from './components/LeftSidebar'
import { RightSidebar } from './components/RightSidebar'
import { PreviewFrame, type PreviewFrameHandle } from './components/PreviewFrame'
import { ComparisonPanel } from './components/ComparisonPanel'
import { analyzeDocument, countBySeverity } from './engine/analyzer'
import { measureElement, applyTemporaryStyles } from './engine/measurements'
import { captureIframeScreenshot } from './engine/screenshot'
import {
  createReport,
  createSession,
  deleteSession,
  downloadTextFile,
  exportReportHtml,
  exportReportJson,
  loadSessions,
  saveSession,
  summarizeMultiViewport,
} from './engine/reports'
import { sourceDisplayName, validateSource } from './engine/validation'
import type {
  DetectedIssue,
  ElementMeasurements,
  InspectionSettings,
  IssueType,
  MultiViewportSummary,
  Orientation,
  PreviewSource,
  Severity,
  TestSession,
  ViewportSize,
} from './models/types'
import {
  ACCESSIBILITY_ISSUE_TYPES,
  OVERFLOW_ISSUE_TYPES,
  PREDEFINED_VIEWPORTS,
} from './models/types'
import appStyles from './styles/App.module.css'
import './styles/global.css'

const SAMPLE_HTML = `<header class="hero">
  <h1>Ocean Studio</h1>
  <p class="tagline">Responsive layout sample with intentional issues for testing.</p>
  <a class="cta" href="#">Get started</a>
</header>
<main>
  <section class="cards">
    <article class="card">
      <img src="https://invalid.example/missing.jpg" />
      <h2>Broken image & missing alt</h2>
      <p class="clip">This paragraph is intentionally clipped with overflow hidden and nowrap so text gets cut off at the edge of the box.</p>
    </article>
    <article class="card wide">
      <img src="https://placehold.co/800x200" alt="Wide placeholder" class="overflow-img" />
      <h2>Wide fixed panel</h2>
      <p>This block uses a fixed width that can overflow smaller viewports.</p>
      <a href="javascript:void(0)">Bad link</a>
      <button class="tiny">Go</button>
    </article>
  </section>
</main>`

const SAMPLE_CSS = `body {
  margin: 0;
  font-family: Georgia, serif;
  background: #f4f7fb;
  color: #102033;
}
.hero {
  padding: 32px;
  background: linear-gradient(120deg, #0b3d5c, #1f7a8c);
  color: white;
}
.tagline { opacity: 0.9; max-width: 40ch; }
.cta {
  display: inline-block;
  margin-top: 12px;
  padding: 8px 12px;
  background: #ffd166;
  color: #102033;
  text-decoration: none;
  border-radius: 4px;
}
.cards {
  display: flex;
  gap: 16px;
  padding: 24px;
}
.card {
  background: white;
  padding: 16px;
  width: 280px;
  box-shadow: 0 8px 24px rgba(0,0,0,.08);
}
.card.wide {
  width: 1200px;
  position: relative;
}
.clip {
  width: 180px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.overflow-img {
  width: 900px;
  height: auto;
  display: block;
}
.tiny {
  margin-top: 12px;
  width: 28px;
  height: 22px;
  font-size: 10px;
}
.overlap {
  position: absolute;
  top: 40px;
  left: 20px;
  background: rgba(255,0,0,.3);
  padding: 20px;
}`

export default function App() {
  const previewRef = useRef<PreviewFrameHandle>(null)
  const revertStylesRef = useRef<(() => void) | null>(null)
  const selectedElementRef = useRef<HTMLElement | null>(null)

  const [source, setSource] = useState<PreviewSource>({
    mode: 'markup',
    url: 'https://example.com',
    html: SAMPLE_HTML,
    css: SAMPLE_CSS,
    name: 'Sample layout',
  })
  const [viewport, setViewport] = useState<ViewportSize>(PREDEFINED_VIEWPORTS[0])
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [scale, setScale] = useState(0.75)
  const [fitToWorkspace, setFitToWorkspace] = useState(true)
  const [loadedKey, setLoadedKey] = useState(0)
  const [inputErrors, setInputErrors] = useState<string[]>([])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<'info' | 'error' | 'warning' | 'success'>('info')
  const [frameLoading, setFrameLoading] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const [frameAccessible, setFrameAccessible] = useState(false)

  const [inspection, setInspection] = useState<InspectionSettings>({
    showGrid: false,
    showRulers: true,
    showBreakpoints: true,
    outlineMode: false,
    spacingMode: false,
    gridSize: 8,
  })

  const [issues, setIssues] = useState<DetectedIssue[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [highlightSelector, setHighlightSelector] = useState<string | null>(null)
  const [selectedSelector, setSelectedSelector] = useState<string | null>(null)
  const [measurements, setMeasurements] = useState<ElementMeasurements | null>(null)
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<IssueType | 'all'>('all')
  const [rightTab, setRightTab] = useState<'issues' | 'element' | 'results'>('issues')

  const [multiSummary, setMultiSummary] = useState<MultiViewportSummary | null>(null)
  const [viewportFilter, setViewportFilter] = useState<string | 'all'>('all')
  const [comparisonOpen, setComparisonOpen] = useState(false)

  const [leftWidth, setLeftWidth] = useState(300)
  const [rightWidth, setRightWidth] = useState(360)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [sessions, setSessions] = useState<TestSession[]>(() => loadSessions())

  const dragRef = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(
    null,
  )

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragRef.current) return
      const dx = event.clientX - dragRef.current.startX
      if (dragRef.current.side === 'left') {
        setLeftWidth(Math.min(480, Math.max(240, dragRef.current.startWidth + dx)))
      } else {
        setRightWidth(Math.min(520, Math.max(280, dragRef.current.startWidth - dx)))
      }
    }
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const patchSource = (patch: Partial<PreviewSource>) => {
    setSource((prev) => ({ ...prev, ...patch }))
  }

  const handleFrameStatus = useCallback(
    (status: {
      loading: boolean
      loaded: boolean
      blocked: boolean
      accessible: boolean
      message?: string
    }) => {
      setFrameLoading(status.loading)
      setPreviewReady(status.loaded)
      setFrameAccessible(status.accessible)
      if (status.message) {
        setStatusMessage(status.message)
        setStatusTone(status.blocked ? 'warning' : status.accessible ? 'success' : 'info')
      }
    },
    [],
  )

  const loadPreview = () => {
    const validation = validateSource(source)
    if (!validation.valid) {
      setInputErrors(validation.errors)
      setStatusMessage(validation.errors[0] ?? 'Invalid input')
      setStatusTone('error')
      return
    }
    setInputErrors([])
    setIssues([])
    setSelectedIssueId(null)
    setHighlightSelector(null)
    setSelectedSelector(null)
    setMeasurements(null)
    selectedElementRef.current = null
    revertStylesRef.current?.()
    revertStylesRef.current = null
    setLoadedKey((k) => k + 1)
    setFrameLoading(true)
    setStatusMessage('Loading preview…')
    setStatusTone('info')
  }

  const refreshPreview = () => {
    if (loadedKey === 0) return
    loadPreview()
  }

  const runAnalysis = async () => {
    const doc = previewRef.current?.getDocument()
    if (!doc) {
      setStatusMessage(
        'Cannot analyze: preview document is inaccessible. External sites often block cross-origin inspection. Paste HTML/CSS to analyze locally.',
      )
      setStatusTone('warning')
      return
    }

    setAnalyzing(true)
    setStatusMessage('Running layout analysis…')
    setStatusTone('info')

    // Allow layout to settle
    await new Promise((r) => setTimeout(r, 50))

    const result = analyzeDocument(doc, {
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    })

    setIssues(result.issues)
    setAnalyzing(false)
    setRightTab('issues')

    const counts = countBySeverity(result.issues)
    setStatusMessage(
      `Analysis complete: ${result.issues.length} issues (${counts.critical} critical, ${counts.warning} warnings, ${counts.info} info).`,
    )
    setStatusTone(counts.critical > 0 ? 'warning' : 'success')
  }

  const runAllViewports = async () => {
    if (source.mode === 'url' && !frameAccessible) {
      setStatusMessage(
        'Multi-viewport analysis requires same-origin document access. Use pasted HTML/CSS.',
      )
      setStatusTone('warning')
      return
    }

    if (loadedKey === 0) {
      setStatusMessage('Load a preview before running all viewports.')
      setStatusTone('error')
      return
    }

    setAnalyzing(true)
    setStatusMessage('Running tests across all predefined viewports…')
    setStatusTone('info')

    const previous = viewport
    const results = []

    for (const vp of PREDEFINED_VIEWPORTS) {
      setViewport(vp)
      await new Promise((r) => setTimeout(r, 150))

      if (source.mode === 'markup') {
        setLoadedKey((k) => k + 1)
        await new Promise<void>((resolve) => {
          const started = Date.now()
          const poll = () => {
            const iframe = previewRef.current?.getIframe()
            const doc = previewRef.current?.getDocument()
            if (doc?.body || Date.now() - started > 3000) {
              // Allow images / layout to settle
              setTimeout(() => resolve(), 250)
              return
            }
            if (!iframe) {
              setTimeout(poll, 50)
              return
            }
            setTimeout(poll, 50)
          }
          poll()
        })
      } else {
        await new Promise((r) => setTimeout(r, 300))
      }

      const iframe = previewRef.current?.getIframe()
      const doc = previewRef.current?.getDocument()
      if (!doc || !iframe) {
        results.push({
          viewport: vp,
          issues: [],
          screenshotDataUrl: null,
          criticalCount: 0,
          overflowCount: 0,
          accessibilityCount: 0,
        })
        continue
      }

      const analysis = analyzeDocument(doc, {
        viewportWidth: vp.width,
        viewportHeight: vp.height,
      })
      const shot = await captureIframeScreenshot(iframe)
      const criticalCount = analysis.issues.filter((i) => i.severity === 'critical').length
      const overflowCount = analysis.issues.filter((i) =>
        OVERFLOW_ISSUE_TYPES.includes(i.type),
      ).length
      const accessibilityCount = analysis.issues.filter((i) =>
        ACCESSIBILITY_ISSUE_TYPES.includes(i.type),
      ).length

      results.push({
        viewport: vp,
        issues: analysis.issues,
        screenshotDataUrl: shot,
        criticalCount,
        overflowCount,
        accessibilityCount,
      })
    }

    setViewport(previous)
    const summary = summarizeMultiViewport(sourceDisplayName(source), results)
    setMultiSummary(summary)
    setIssues(results.flatMap((r) => r.issues))
    setAnalyzing(false)
    setRightTab('results')
    setStatusMessage(
      `All viewports tested: ${summary.totalIssues} issues total, ${summary.totalCritical} critical.`,
    )
    setStatusTone(summary.totalCritical > 0 ? 'warning' : 'success')

    const session = createSession({
      name: sourceDisplayName(source),
      source,
      viewport: previous,
      orientation,
      scale,
      issues: results.flatMap((r) => r.issues),
      multiViewportSummary: summary,
      report: createReport({
        sourceName: sourceDisplayName(source),
        sourceMode: source.mode,
        sourceUrl: source.mode === 'url' ? source.url : undefined,
        viewport: previous,
        issues: results.flatMap((r) => r.issues),
        screenshots: results.map((r) => r.screenshotDataUrl).filter(Boolean) as string[],
      }),
    })
    setSessions(saveSession(session))
  }

  const onSelectIssue = (issue: DetectedIssue) => {
    setSelectedIssueId(issue.id)
    setHighlightSelector(issue.selector)
    setSelectedSelector(issue.selector)
    setRightTab('issues')

    const doc = previewRef.current?.getDocument()
    if (!doc) return
    try {
      const el = doc.querySelector(issue.selector)
      if (el) {
        selectedElementRef.current = el as HTMLElement
        setMeasurements(measureElement(el))
      }
    } catch {
      /* ignore invalid selector */
    }
  }

  const onSelectElement = (selector: string | null, element: Element | null) => {
    setSelectedSelector(selector)
    if (!element) {
      setMeasurements(null)
      selectedElementRef.current = null
      return
    }
    selectedElementRef.current = element as HTMLElement
    setMeasurements(measureElement(element))
    setRightTab('element')
  }

  const onApplyStyles = (styles: Record<string, string>) => {
    const el = selectedElementRef.current
    if (!el) return
    revertStylesRef.current?.()
    revertStylesRef.current = applyTemporaryStyles(el, styles)
    setMeasurements(measureElement(el))
    setStatusMessage('Temporary CSS applied to the selected element.')
    setStatusTone('success')
  }

  const onResetStyles = () => {
    revertStylesRef.current?.()
    revertStylesRef.current = null
    if (selectedElementRef.current) {
      setMeasurements(measureElement(selectedElementRef.current))
    }
    setStatusMessage('Temporary CSS edits reset.')
    setStatusTone('info')
  }

  const exportCurrent = (format: 'json' | 'html') => {
    const report = createReport({
      sourceName: sourceDisplayName(source),
      sourceMode: source.mode,
      sourceUrl: source.mode === 'url' ? source.url : undefined,
      viewport,
      issues,
      screenshots:
        multiSummary?.results.map((r) => r.screenshotDataUrl).filter(Boolean) as string[] | undefined,
    })

    if (format === 'json') {
      downloadTextFile(
        `layout-report-${report.id}.json`,
        exportReportJson(report),
        'application/json',
      )
    } else {
      downloadTextFile(`layout-report-${report.id}.html`, exportReportHtml(report), 'text/html')
    }

    const session = createSession({
      name: sourceDisplayName(source),
      source,
      viewport,
      orientation,
      scale,
      issues,
      report,
      multiViewportSummary: multiSummary ?? undefined,
    })
    setSessions(saveSession(session))
    setStatusMessage(`Report exported as ${format.toUpperCase()} and session saved.`)
    setStatusTone('success')
  }

  const handleSaveSession = () => {
    const session = createSession({
      name: sourceDisplayName(source),
      source,
      viewport,
      orientation,
      scale,
      issues,
      multiViewportSummary: multiSummary ?? undefined,
    })
    setSessions(saveSession(session))
    setStatusMessage('Session saved to localStorage.')
    setStatusTone('success')
  }

  const handleLoadSession = (id: string) => {
    const session = sessions.find((s) => s.id === id)
    if (!session) return
    setSource(session.source)
    setViewport(session.viewport)
    setOrientation(session.orientation)
    setScale(session.scale)
    setIssues(session.issues)
    setMultiSummary(session.multiViewportSummary ?? null)
    setLoadedKey((k) => k + 1)
    setStatusMessage(`Loaded session “${session.name}”.`)
    setStatusTone('success')
  }

  const handleDeleteSession = (id: string) => {
    setSessions(deleteSession(id))
  }

  const captureRendered = async () => {
    const iframe = previewRef.current?.getIframe()
    if (!iframe) return null
    return captureIframeScreenshot(iframe)
  }

  const workspaceClass = [
    appStyles.workspace,
    leftCollapsed ? appStyles.leftCollapsed : '',
    rightCollapsed ? appStyles.rightCollapsed : '',
  ]
    .filter(Boolean)
    .join(' ')

  const workspaceStyle = {
    '--left-width': `${leftWidth}px`,
    '--right-width': `${rightWidth}px`,
  } as CSSProperties

  return (
    <div className={appStyles.appShell}>
      <Toolbar
        onLoad={loadPreview}
        onRefresh={refreshPreview}
        onRunAnalysis={() => void runAnalysis()}
        onRunAllViewports={() => void runAllViewports()}
        onToggleGrid={() => setInspection((s) => ({ ...s, showGrid: !s.showGrid }))}
        onToggleOutline={() => setInspection((s) => ({ ...s, outlineMode: !s.outlineMode }))}
        onToggleRulers={() =>
          setInspection((s) => ({
            ...s,
            showRulers: !s.showRulers,
            showBreakpoints: !s.showRulers ? true : s.showBreakpoints,
          }))
        }
        onToggleSpacing={() => setInspection((s) => ({ ...s, spacingMode: !s.spacingMode }))}
        onOpenComparison={() => setComparisonOpen(true)}
        onExportJson={() => exportCurrent('json')}
        onExportHtml={() => exportCurrent('html')}
        onToggleLeft={() => setLeftCollapsed((v) => !v)}
        onToggleRight={() => setRightCollapsed((v) => !v)}
        gridActive={inspection.showGrid}
        outlineActive={inspection.outlineMode}
        rulersActive={inspection.showRulers}
        spacingActive={inspection.spacingMode}
        comparisonActive={comparisonOpen}
        loading={frameLoading || analyzing}
        hasPreview={previewReady || loadedKey > 0}
        hasIssues={issues.length > 0}
      />

      <div className={workspaceClass} style={workspaceStyle}>
        {!leftCollapsed && (
          <LeftSidebar
            source={source}
            onSourceChange={patchSource}
            viewport={viewport}
            onViewportChange={setViewport}
            orientation={orientation}
            onOrientationChange={setOrientation}
            scale={scale}
            onScaleChange={setScale}
            fitToWorkspace={fitToWorkspace}
            onFitToWorkspaceChange={setFitToWorkspace}
            onLoad={loadPreview}
            errors={inputErrors}
            sessions={sessions.map((s) => ({
              id: s.id,
              name: s.name,
              updatedAt: s.updatedAt,
            }))}
            onLoadSession={handleLoadSession}
            onDeleteSession={handleDeleteSession}
            onSaveSession={handleSaveSession}
          />
        )}

        <div
          className={`${appStyles.resizeHandle} ${dragRef.current?.side === 'left' ? appStyles.active : ''}`}
          onMouseDown={(e) => {
            dragRef.current = { side: 'left', startX: e.clientX, startWidth: leftWidth }
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize left panel"
        />

        <main className={appStyles.centerStage}>
          {statusMessage && (
            <div className={`${appStyles.banner} ${appStyles[statusTone]}`} style={{ margin: 8 }}>
              {frameLoading && <span className={appStyles.loadingPulse} style={{ marginRight: 8 }} />}
              {statusMessage}
            </div>
          )}

          <PreviewFrame
            ref={previewRef}
            source={source}
            loadedKey={loadedKey}
            viewport={viewport}
            scale={scale}
            fitToWorkspace={fitToWorkspace}
            inspection={inspection}
            highlightSelector={highlightSelector}
            selectedSelector={selectedSelector}
            onSelectElement={onSelectElement}
            onFrameStatus={handleFrameStatus}
            />

          <div className={appStyles.statusBar}>
            <span>
              {sourceDisplayName(source)} · {viewport.name} · {viewport.width}×{viewport.height}
              {orientation === 'landscape' ? ' landscape' : ' portrait'}
            </span>
            <span>
              {issues.length} issues
              {selectedSelector ? ` · selected ${selectedSelector}` : ''}
            </span>
            <span>
              Scale {fitToWorkspace ? 'fit' : `${Math.round(scale * 100)}%`}
              {frameAccessible ? ' · analyzable' : loadedKey > 0 ? ' · limited access' : ''}
            </span>
          </div>
        </main>

        <div
          className={appStyles.resizeHandle}
          onMouseDown={(e) => {
            dragRef.current = { side: 'right', startX: e.clientX, startWidth: rightWidth }
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize right panel"
        />

        {!rightCollapsed && (
          <RightSidebar
            tab={rightTab}
            onTabChange={setRightTab}
            issues={issues}
            selectedIssueId={selectedIssueId}
            onSelectIssue={onSelectIssue}
            severityFilter={severityFilter}
            typeFilter={typeFilter}
            onSeverityFilter={setSeverityFilter}
            onTypeFilter={setTypeFilter}
            measurements={measurements}
            onApplyStyles={onApplyStyles}
            onResetStyles={onResetStyles}
            multiSummary={multiSummary}
            viewportFilter={viewportFilter}
            onViewportFilter={setViewportFilter}
            analyzing={analyzing}
          />
        )}
      </div>

      <ComparisonPanel
        open={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        renderedScreenshot={null}
        onCaptureRendered={captureRendered}
      />
    </div>
  )
}
