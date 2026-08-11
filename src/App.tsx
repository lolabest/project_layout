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
import {
  applyTemporaryStyles,
  createStyleEditSession,
  measureElement,
  resetAllStyles,
  resetElementStyles,
  undoLastChange,
  type StyleEditSession,
} from './engine/measurements'
import { captureIframeScreenshot } from './engine/screenshot'
import {
  buildViewportResult,
  createReport,
  createSession,
  deleteSession,
  downloadTextFile,
  exportReportHtml,
  exportReportJson,
  finalizeSessionStatus,
  loadSessions,
  saveSession,
  summarizeMultiViewport,
} from './engine/reports'
import { sourceDisplayName } from './engine/validation'
import { waitForLayoutStabilization, createAnalysisController } from './engine/stabilize'
import {
  beginSourceLoad,
  canAnalyzeStrict,
  completeSourceLoad,
  createInitialSourceState,
  markSourceEdited,
} from './engine/sourceState'
import {
  applyIgnoredState,
  computeIssueDelta,
  countActiveIssues,
  ignoreIssue,
  markStaleIfMissing,
} from './engine/issueLifecycle'
import { calculateHealthScore, sortIssues, type IssueSortKey } from './engine/scoring'
import { validateViewportDimensions } from './engine/viewportUtils'
import type {
  AppError,
  ElementMeasurements,
  InspectionSettings,
  IssueDelta,
  IssueLifecycle,
  IssueType,
  LayoutIssue,
  MultiViewportSummary,
  Orientation,
  PreviewSource,
  Severity,
  TestSession,
  ViewportSize,
} from './models/types'
import { PREDEFINED_VIEWPORTS } from './models/types'
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
      <label>Name <input id="dup" type="text" /></label>
      <input id="dup" type="email" aria-labelledby="missing-label" />
      <button></button>
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
}`

export default function App() {
  const previewRef = useRef<PreviewFrameHandle>(null)
  const selectedElementRef = useRef<HTMLElement | null>(null)
  const styleSessionRef = useRef<StyleEditSession>(createStyleEditSession())
  const analysisRef = useRef<ReturnType<typeof createAnalysisController> | null>(null)
  const viewportDebounceRef = useRef<number | null>(null)
  const runningSessionRef = useRef(false)

  const [source, setSource] = useState<PreviewSource>({
    mode: 'markup',
    url: 'https://example.com',
    html: SAMPLE_HTML,
    css: SAMPLE_CSS,
    name: 'Sample layout',
  })
  const [sourceCtrl, setSourceCtrl] = useState(() =>
    createInitialSourceState({
      mode: 'markup',
      url: 'https://example.com',
      html: SAMPLE_HTML,
      css: SAMPLE_CSS,
      name: 'Sample layout',
    }),
  )

  const [viewport, setViewport] = useState<ViewportSize>(PREDEFINED_VIEWPORTS[0])
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [scale, setScale] = useState(0.75)
  const [fitToWorkspace, setFitToWorkspace] = useState(true)
  const [loadedKey, setLoadedKey] = useState(0)
  const [frameAccessible, setFrameAccessible] = useState(false)
  const [autoAnalyze, setAutoAnalyze] = useState(false)

  const [inspection, setInspection] = useState<InspectionSettings>({
    showGrid: false,
    showRulers: true,
    showBreakpoints: true,
    outlineMode: false,
    spacingMode: false,
    gridSize: 8,
  })

  const [issues, setIssues] = useState<LayoutIssue[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [highlightSelector, setHighlightSelector] = useState<string | null>(null)
  const [selectedSelector, setSelectedSelector] = useState<string | null>(null)
  const [measurements, setMeasurements] = useState<ElementMeasurements | null>(null)
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<IssueType | 'all'>('all')
  const [lifecycleFilter, setLifecycleFilter] = useState<IssueLifecycle | 'all'>('open')
  const [ruleFilter, setRuleFilter] = useState<string | 'all'>('all')
  const [sortKey, setSortKey] = useState<IssueSortKey>('severity')
  const [rightTab, setRightTab] = useState<'issues' | 'element' | 'results'>('issues')

  const [multiSummary, setMultiSummary] = useState<MultiViewportSummary | null>(null)
  const [viewportFilter, setViewportFilter] = useState<string | 'all'>('all')
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [ignoredKeys, setIgnoredKeys] = useState<Record<string, string>>({})
  const [issueDelta, setIssueDelta] = useState<IssueDelta | null>(null)
  const [scoreBefore, setScoreBefore] = useState<number | null>(null)
  const [scoreAfter, setScoreAfter] = useState<number | null>(null)
  const [diagnostics, setDiagnostics] = useState<string[]>([])
  const [sessionStatus, setSessionStatus] = useState<string>('Draft')
  const [canUndo, setCanUndo] = useState(false)

  const [leftWidth, setLeftWidth] = useState(300)
  const [rightWidth, setRightWidth] = useState(360)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [sessions, setSessions] = useState<TestSession[]>(() => loadSessions())
  const [statusTone, setStatusTone] = useState<'info' | 'error' | 'warning' | 'success'>('info')

  const dragRef = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(
    null,
  )

  const health = calculateHealthScore(issues)
  const activeCount = countActiveIssues(issues)
  const sortedIssues = sortIssues(issues, sortKey)

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
    setSource((prev) => {
      const next = { ...prev, ...patch }
      setSourceCtrl((ctrl) => markSourceEdited(ctrl, next))
      return next
    })
  }

  const handleFrameStatus = useCallback(
    (status: {
      loading: boolean
      loaded: boolean
      blocked: boolean
      accessible: boolean
      message?: string
    }) => {
      setFrameAccessible(status.accessible)
      if (status.loading) {
        setSourceCtrl((ctrl) => ({ ...ctrl, state: 'loading', message: 'Loading preview…' }))
        setStatusTone('info')
        return
      }
      setSourceCtrl((ctrl) =>
        completeSourceLoad(ctrl, {
          blocked: status.blocked,
          accessible: status.accessible,
          failed: status.loaded === false,
          message: status.message,
        }),
      )
      setStatusTone(status.blocked ? 'warning' : status.accessible ? 'success' : 'info')
    },
    [],
  )

  const cancelAnalysis = () => {
    analysisRef.current?.cancel()
    runningSessionRef.current = false
    setAnalyzing(false)
    setProgress(null)
    setSessionStatus('Failed')
    setSourceCtrl((c) => ({ ...c, message: 'Analysis cancelled.' }))
    setStatusTone('warning')
  }

  const loadPreview = () => {
    const next = beginSourceLoad(sourceCtrl, source)
    setSourceCtrl(next)
    if (next.state === 'invalid') {
      setStatusTone('error')
      return
    }
    setIssues([])
    setSelectedIssueId(null)
    setHighlightSelector(null)
    setSelectedSelector(null)
    setMeasurements(null)
    setIssueDelta(null)
    selectedElementRef.current = null
    styleSessionRef.current = createStyleEditSession()
    setCanUndo(false)
    setLoadedKey((k) => k + 1)
    setStatusTone('info')
  }

  const runAnalysisForDoc = async (
    doc: Document,
    vp: ViewportSize,
    signal?: AbortSignal,
  ) => {
    const stable = await waitForLayoutStabilization(doc, { signal, timeoutMs: 5000 })
    const result = analyzeDocument(doc, { viewport: vp, signal })
    const withIgnored = applyIgnoredState(result.issues, ignoredKeys)
    const diag = [
      ...(result.ruleErrors ?? []).map((e: AppError) => `${e.message}${e.diagnostic ? ` (${e.diagnostic})` : ''}`),
      ...(stable.timedOut ? ['Layout stabilization timed out — analysis continued with available content.'] : []),
      ...(result.truncated ? [result.errorMessage ?? 'Element sampling truncated for performance.'] : []),
    ]
    return { issues: withIgnored, diagnostics: diag, health: result.healthScore }
  }

  const runAnalysis = async () => {
    if (runningSessionRef.current) {
      setSourceCtrl((c) => ({
        ...c,
        message: 'A test session is already running. Cancel it before starting another.',
      }))
      setStatusTone('warning')
      return
    }
    if (!canAnalyzeStrict(sourceCtrl.state, frameAccessible)) {
      setSourceCtrl((c) => ({
        ...c,
        message:
          'Cannot analyze until the preview is fully loaded and inspectable. External sites often block cross-origin inspection — switch to HTML/CSS mode.',
      }))
      setStatusTone('warning')
      return
    }

    const doc = previewRef.current?.getDocument()
    if (!doc) {
      setSourceCtrl((c) => ({
        ...c,
        message: 'Preview inspection unavailable. Paste HTML/CSS to analyse locally.',
      }))
      setStatusTone('warning')
      return
    }

    const controller = createAnalysisController()
    analysisRef.current = controller
    runningSessionRef.current = true
    setAnalyzing(true)
    setProgress('Stabilizing layout…')
    setSessionStatus('Running')
    setStatusTone('info')

    try {
      const { issues: nextIssues, diagnostics: diag } = await runAnalysisForDoc(
        doc,
        viewport,
        controller.controller.signal,
      )
      if (controller.isStale()) return
      setIssues(nextIssues)
      setDiagnostics(diag)
      setRightTab('issues')
      const counts = countBySeverity(nextIssues)
      setSourceCtrl((c) => ({
        ...c,
        message: `Analysis complete: ${countActiveIssues(nextIssues)} active issues (${counts.critical} critical, ${counts.warning} warnings, ${counts.info} info).`,
      }))
      setStatusTone(counts.critical > 0 ? 'warning' : 'success')
      setSessionStatus('Completed')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setDiagnostics([error instanceof Error ? error.message : 'Analysis failed'])
      setSessionStatus('Failed')
      setStatusTone('error')
      setSourceCtrl((c) => ({ ...c, message: 'Analysis failed. See diagnostics for details.' }))
    } finally {
      runningSessionRef.current = false
      setAnalyzing(false)
      setProgress(null)
      analysisRef.current = null
    }
  }

  const runAllViewports = async () => {
    if (runningSessionRef.current) {
      setSourceCtrl((c) => ({
        ...c,
        message: 'A test session is already running. Cancel it before starting another.',
      }))
      setStatusTone('warning')
      return
    }
    if (sourceCtrl.state !== 'loaded' && sourceCtrl.state !== 'blocked') {
      setSourceCtrl((c) => ({ ...c, message: 'Load a valid preview before running all viewports.' }))
      setStatusTone('error')
      return
    }
    if (source.mode === 'url' && !frameAccessible) {
      setSourceCtrl((c) => ({
        ...c,
        message:
          'Multi-viewport analysis requires same-origin document access. Switch to HTML/CSS mode.',
      }))
      setStatusTone('warning')
      return
    }

    const controller = createAnalysisController()
    analysisRef.current = controller
    runningSessionRef.current = true
    setAnalyzing(true)
    setSessionStatus('Running')
    setStatusTone('info')

    const previous = viewport
    const results = []
    const allDiag: string[] = []

    try {
      for (let i = 0; i < PREDEFINED_VIEWPORTS.length; i++) {
        if (controller.isStale()) break
        const vp = PREDEFINED_VIEWPORTS[i]
        setViewport(vp)
        setProgress(`Testing ${vp.name} (${i + 1}/${PREDEFINED_VIEWPORTS.length})…`)
        await new Promise((r) => setTimeout(r, 120))

        if (source.mode === 'markup') {
          setLoadedKey((k) => k + 1)
          await new Promise<void>((resolve) => {
            const started = Date.now()
            const poll = () => {
              const doc = previewRef.current?.getDocument()
              if (doc?.body || Date.now() - started > 3000) {
                setTimeout(() => resolve(), 200)
                return
              }
              setTimeout(poll, 50)
            }
            poll()
          })
        } else {
          await new Promise((r) => setTimeout(r, 250))
        }

        const iframe = previewRef.current?.getIframe()
        const doc = previewRef.current?.getDocument()
        if (!doc || !iframe || controller.isStale()) {
          results.push(buildViewportResult(vp, [], null, 'failed', 'Preview unavailable'))
          continue
        }

        try {
          const { issues: vpIssues, diagnostics: diag } = await runAnalysisForDoc(
            doc,
            vp,
            controller.controller.signal,
          )
          allDiag.push(...diag.map((d) => `[${vp.name}] ${d}`))
          const shot = await captureIframeScreenshot(iframe)
          results.push(buildViewportResult(vp, vpIssues, shot, 'success'))
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') break
          results.push(
            buildViewportResult(
              vp,
              [],
              null,
              'failed',
              error instanceof Error ? error.message : 'Viewport analysis failed',
            ),
          )
        }
      }

      if (controller.isStale()) {
        setSessionStatus('Failed')
        return
      }

      setViewport(previous)
      const summary = summarizeMultiViewport(sourceDisplayName(source), results)
      setMultiSummary(summary)
      const flat = applyIgnoredState(
        results.flatMap((r) => r.issues),
        ignoredKeys,
      )
      setIssues(flat)
      setDiagnostics(allDiag)
      setAnalyzing(false)
      setRightTab('results')
      const status = finalizeSessionStatus(results)
      setSessionStatus(status)
      setSourceCtrl((c) => ({
        ...c,
        message: `All viewports finished (${status}): ${summary.totalIssues} grouped issues, score ${summary.overallHealthScore}.`,
      }))
      setStatusTone(status === 'Failed' ? 'error' : summary.totalCritical > 0 ? 'warning' : 'success')

      const session = createSession({
        name: sourceDisplayName(source),
        source,
        selectedViewports: PREDEFINED_VIEWPORTS,
        status,
        results,
        ignoredIssueKeys: ignoredKeys,
        temporaryFixes: styleSessionRef.current.changes,
        multiViewportSummary: summary,
        viewport: previous,
        orientation,
        scale,
        issues: flat,
        report: createReport({
          sourceName: sourceDisplayName(source),
          sourceMode: source.mode,
          sourceUrl: source.mode === 'url' ? source.url : undefined,
          viewport: previous,
          viewports: PREDEFINED_VIEWPORTS,
          issues: flat,
          screenshots: results.map((r) => r.screenshotDataUrl).filter(Boolean) as string[],
          temporaryFixes: styleSessionRef.current.changes,
        }),
      })
      setSessions(saveSession(session))
    } finally {
      runningSessionRef.current = false
      setAnalyzing(false)
      setProgress(null)
      analysisRef.current = null
    }
  }

  // Debounced viewport change → optional auto-analyze
  const handleViewportChange = (next: ViewportSize) => {
    const check = validateViewportDimensions(next.width, next.height)
    if (!check.valid) {
      setSourceCtrl((c) => ({
        ...c,
        errors: check.errors,
        message: check.errors[0] ?? 'Invalid viewport',
      }))
      setStatusTone('error')
      // still apply clamped-ish values for UX
    }
    setViewport(next)
    if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current)
    viewportDebounceRef.current = window.setTimeout(() => {
      if (autoAnalyze && canAnalyzeStrict(sourceCtrl.state, frameAccessible)) {
        void runAnalysis()
      }
    }, 350)
  }

  const onSelectIssue = (issue: LayoutIssue) => {
    setSelectedIssueId(issue.id)
    setHighlightSelector(issue.selector)
    setSelectedSelector(issue.selector)
    setRightTab('issues')
    if (issue.viewport.id !== viewport.id) {
      setViewport(issue.viewport)
    }

    const doc = previewRef.current?.getDocument()
    if (!doc) return
    try {
      const el = doc.querySelector(issue.selector)
      if (el) {
        selectedElementRef.current = el as HTMLElement
        setMeasurements(measureElement(el))
        setIssues((prev) =>
          prev.map((i) =>
            i.id === issue.id && i.lifecycle === 'stale' ? { ...i, lifecycle: 'open' } : i,
          ),
        )
      } else {
        setIssues((prev) =>
          prev.map((i) => (i.id === issue.id ? { ...i, lifecycle: 'stale' } : i)),
        )
        setSourceCtrl((c) => ({
          ...c,
          message: 'Issue element no longer exists — marked stale. Rerun analysis.',
        }))
        setStatusTone('warning')
      }
    } catch {
      setIssues((prev) => prev.map((i) => (i.id === issue.id ? { ...i, lifecycle: 'stale' } : i)))
    }
  }

  const onIgnoreIssue = (issue: LayoutIssue) => {
    const reason = window.prompt('Optional reason for ignoring this issue:', '') ?? ''
    const result = ignoreIssue(issues, issue.id, reason)
    setIssues(result.issues)
    setIgnoredKeys((prev) => ({ ...prev, ...result.ignoredKeys }))
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

  const reanalyzeAfterCss = async () => {
    const doc = previewRef.current?.getDocument()
    if (!doc || !canAnalyzeStrict(sourceCtrl.state, frameAccessible)) return
    const before = issues
    const beforeScore = calculateHealthScore(before).score
    setScoreBefore(beforeScore)
    const { issues: next } = await runAnalysisForDoc(doc, viewport)
    setIssues(next)
    setIssueDelta(computeIssueDelta(before, next))
    setScoreAfter(calculateHealthScore(next).score)
  }

  const onApplyStyles = (styles: Record<string, string>) => {
    const el = selectedElementRef.current
    if (!el) return
    applyTemporaryStyles(el, styles, styleSessionRef.current)
    setCanUndo(styleSessionRef.current.changes.length > 0)
    setMeasurements(measureElement(el))
    setSourceCtrl((c) => ({
      ...c,
      message: 'Temporary CSS applied (source unchanged). Re-analysing…',
    }))
    void reanalyzeAfterCss()
  }

  const onUndo = () => {
    const doc = previewRef.current?.getDocument()
    if (!doc) return
    undoLastChange(doc, styleSessionRef.current)
    setCanUndo(styleSessionRef.current.changes.length > 0)
    if (selectedElementRef.current) setMeasurements(measureElement(selectedElementRef.current))
    void reanalyzeAfterCss()
  }

  const onResetElement = () => {
    const doc = previewRef.current?.getDocument()
    if (!doc || !selectedSelector) return
    resetElementStyles(doc, styleSessionRef.current, selectedSelector)
    setCanUndo(styleSessionRef.current.changes.length > 0)
    if (selectedElementRef.current) setMeasurements(measureElement(selectedElementRef.current))
    void reanalyzeAfterCss()
  }

  const onResetAll = () => {
    const doc = previewRef.current?.getDocument()
    if (!doc) return
    resetAllStyles(doc, styleSessionRef.current)
    setCanUndo(false)
    if (selectedElementRef.current) setMeasurements(measureElement(selectedElementRef.current))
    void reanalyzeAfterCss()
  }

  const exportCurrent = (format: 'json' | 'html') => {
    if (sessionStatus === 'Draft' || sessionStatus === 'Running') {
      setSourceCtrl((c) => ({
        ...c,
        message: 'Export is available for completed or partially completed sessions. Run a test first.',
      }))
      setStatusTone('warning')
      return
    }
    const report = createReport({
      sourceName: sourceDisplayName(source),
      sourceMode: source.mode,
      sourceUrl: source.mode === 'url' ? source.url : undefined,
      viewport,
      viewports: multiSummary?.results.map((r) => r.viewport) ?? [viewport],
      issues,
      screenshots:
        (multiSummary?.results.map((r) => r.screenshotDataUrl).filter(Boolean) as string[]) ?? [],
      temporaryFixes: styleSessionRef.current.changes,
      measurements,
    })

    try {
      if (format === 'json') {
        downloadTextFile(
          `layout-report-${report.id}.json`,
          exportReportJson(report),
          'application/json',
        )
      } else {
        downloadTextFile(`layout-report-${report.id}.html`, exportReportHtml(report), 'text/html')
      }
    } catch (error) {
      setDiagnostics([
        `Export failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      ])
      setStatusTone('error')
      return
    }

    const session = createSession({
      name: sourceDisplayName(source),
      source,
      selectedViewports: multiSummary?.results.map((r) => r.viewport) ?? [viewport],
      status: sessionStatus === 'Failed' ? 'Failed' : 'Completed',
      results: multiSummary?.results ?? [
        buildViewportResult(viewport, issues, null, 'success'),
      ],
      ignoredIssueKeys: ignoredKeys,
      temporaryFixes: styleSessionRef.current.changes,
      report,
      multiViewportSummary: multiSummary ?? undefined,
      viewport,
      orientation,
      scale,
      issues,
    })
    setSessions(saveSession(session))
    setSourceCtrl((c) => ({
      ...c,
      message: `Report exported as ${format.toUpperCase()} and session saved.`,
    }))
    setStatusTone('success')
  }

  const handleSaveSession = () => {
    const session = createSession({
      name: sourceDisplayName(source),
      source,
      selectedViewports: [viewport],
      status: sessionStatus === 'Running' ? 'Draft' : (sessionStatus as TestSession['status']),
      results: multiSummary?.results ?? [buildViewportResult(viewport, issues, null)],
      ignoredIssueKeys: ignoredKeys,
      temporaryFixes: styleSessionRef.current.changes,
      multiViewportSummary: multiSummary ?? undefined,
      viewport,
      orientation,
      scale,
      issues,
    })
    try {
      setSessions(saveSession(session))
      setSourceCtrl((c) => ({ ...c, message: 'Session saved to localStorage.' }))
      setStatusTone('success')
    } catch {
      setDiagnostics(['Storage unavailable — could not save session.'])
      setStatusTone('error')
    }
  }

  const handleLoadSession = (id: string) => {
    const session = sessions.find((s) => s.id === id)
    if (!session) return
    setSource(session.source)
    setSourceCtrl(createInitialSourceState(session.source))
    setViewport(session.viewport ?? session.selectedViewports[0] ?? PREDEFINED_VIEWPORTS[0])
    setOrientation(session.orientation ?? 'portrait')
    setScale(session.scale ?? 0.75)
    setIssues(session.issues ?? session.results.flatMap((r) => r.issues))
    setMultiSummary(session.multiViewportSummary ?? null)
    setIgnoredKeys(session.ignoredIssueKeys ?? {})
    setSessionStatus(session.status)
    setLoadedKey((k) => k + 1)
    setSourceCtrl((c) => ({
      ...c,
      message: `Loaded session “${session.name}”.`,
      appliedSnapshot: '',
    }))
    setStatusTone('success')
  }

  const captureRendered = async () => {
    const iframe = previewRef.current?.getIframe()
    if (!iframe) return null
    return captureIframeScreenshot(iframe)
  }

  useEffect(() => {
    const doc = previewRef.current?.getDocument()
    if (!doc) return
    setIssues((prev) => (prev.length === 0 ? prev : markStaleIfMissing(prev, doc)))
  }, [loadedKey, viewport.width, viewport.height])

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

  const previewReady = sourceCtrl.state === 'loaded' || sourceCtrl.state === 'blocked'

  return (
    <div className={appStyles.appShell}>
      <Toolbar
        onLoad={loadPreview}
        onRefresh={loadPreview}
        onRunAnalysis={() => void runAnalysis()}
        onRunAllViewports={() => void runAllViewports()}
        onCancel={cancelAnalysis}
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
        onToggleAutoAnalyze={() => setAutoAnalyze((v) => !v)}
        gridActive={inspection.showGrid}
        outlineActive={inspection.outlineMode}
        rulersActive={inspection.showRulers}
        spacingActive={inspection.spacingMode}
        comparisonActive={comparisonOpen}
        autoAnalyze={autoAnalyze}
        loading={sourceCtrl.state === 'loading'}
        analyzing={analyzing}
        hasPreview={previewReady || loadedKey > 0}
        canExport={sessionStatus === 'Completed' || sessionStatus === 'Completed with errors' || (issues.length > 0 && sessionStatus !== 'Running')}
        healthScore={issues.length ? health.score : null}
        scoreLabel={issues.length ? health.label : null}
      />

      <div className={workspaceClass} style={workspaceStyle}>
        {!leftCollapsed && (
          <LeftSidebar
            source={source}
            onSourceChange={patchSource}
            sourceState={sourceCtrl.state}
            sourceMessage={sourceCtrl.message}
            viewport={viewport}
            onViewportChange={handleViewportChange}
            orientation={orientation}
            onOrientationChange={setOrientation}
            scale={scale}
            onScaleChange={setScale}
            fitToWorkspace={fitToWorkspace}
            onFitToWorkspaceChange={setFitToWorkspace}
            onLoad={loadPreview}
            errors={sourceCtrl.errors}
            sessions={sessions.map((s) => ({
              id: s.id,
              name: s.name,
              updatedAt: s.updatedAt,
              status: s.status,
            }))}
            onLoadSession={handleLoadSession}
            onDeleteSession={(id) => setSessions(deleteSession(id))}
            onSaveSession={handleSaveSession}
            onSwitchToMarkup={() => patchSource({ mode: 'markup' })}
          />
        )}

        <div
          className={appStyles.resizeHandle}
          onMouseDown={(e) => {
            dragRef.current = { side: 'left', startX: e.clientX, startWidth: leftWidth }
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize left panel"
        />

        <main className={appStyles.centerStage}>
          {sourceCtrl.message && (
            <div className={`${appStyles.banner} ${appStyles[statusTone]}`} style={{ margin: 8 }}>
              {sourceCtrl.state === 'loading' && (
                <span className={appStyles.loadingPulse} style={{ marginRight: 8 }} />
              )}
              {sourceCtrl.message}
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
              {orientation === 'landscape' ? ' landscape' : ' portrait'} · session {sessionStatus}
            </span>
            <span>
              {activeCount} active issues
              {selectedSelector ? ` · selected ${selectedSelector}` : ''}
            </span>
            <span>
              Scale {fitToWorkspace ? 'fit' : `${Math.round(scale * 100)}%`}
              {frameAccessible ? ' · analyzable' : loadedKey > 0 ? ' · limited access' : ''}
              {autoAnalyze ? ' · auto-analyze' : ''}
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
            issues={sortedIssues}
            selectedIssueId={selectedIssueId}
            onSelectIssue={onSelectIssue}
            onIgnoreIssue={onIgnoreIssue}
            severityFilter={severityFilter}
            typeFilter={typeFilter}
            lifecycleFilter={lifecycleFilter}
            ruleFilter={ruleFilter}
            sortKey={sortKey}
            onSeverityFilter={setSeverityFilter}
            onTypeFilter={setTypeFilter}
            onLifecycleFilter={setLifecycleFilter}
            onRuleFilter={setRuleFilter}
            onSortKey={setSortKey}
            measurements={measurements}
            onApplyStyles={onApplyStyles}
            onUndo={onUndo}
            onResetElement={onResetElement}
            onResetAll={onResetAll}
            canUndo={canUndo}
            issueDelta={issueDelta}
            scoreBefore={scoreBefore}
            scoreAfter={scoreAfter}
            multiSummary={multiSummary}
            viewportFilter={viewportFilter}
            onViewportFilter={setViewportFilter}
            analyzing={analyzing}
            progress={progress}
            healthScore={issues.length ? health.score : null}
            scoreLabel={issues.length ? health.label : null}
            activeIssueCount={activeCount}
            diagnostics={diagnostics}
          />
        )}
      </div>

      <ComparisonPanel
        open={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        renderedScreenshot={null}
        onCaptureRendered={captureRendered}
        viewport={viewport}
      />
    </div>
  )
}
