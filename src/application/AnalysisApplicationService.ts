import { Errors, type AppError } from '../domain/errors'
import { fingerprintSource } from '../domain/fingerprint'
import { buildIgnoredIdentityKey } from '../domain/issueIdentity'
import { err, ok, type Result } from '../domain/result'
import {
  fromUiSessionStatus,
  isSessionTerminal,
  toUiSessionStatus,
  transitionSession,
  type SessionLifecycleState,
} from '../domain/states/sessionStateMachine'
import {
  mapLegacySourceState,
  toLegacySourceState,
  transitionSource,
  type SourceLifecycleState,
} from '../domain/states/sourceStateMachine'
import { transitionIssue } from '../domain/states/issueStateMachine'
import {
  transitionViewportRun,
  type ViewportRunState,
} from '../domain/states/viewportRunStateMachine'
import { capabilitiesFromPreview, describeCapabilities } from '../domain/capabilities'
import { calculateCoverage } from '../domain/coverage'
import { asSessionId, createId } from '../domain/ids'
import { validateSource, sourceDisplayName } from '../engine/validation'
import { waitForLayoutStabilization } from '../engine/stabilize'
import {
  buildViewportResult,
  createReport,
  createSession,
  exportReportHtml,
  exportReportJson,
  finalizeSessionStatus,
  summarizeMultiViewport,
  downloadTextFile,
} from '../engine/reports'
import { layoutRuleEngine, type EngineAnalysisResult } from '../infrastructure/rules/LayoutRuleEngine'
import {
  sessionRepository,
  type SessionRepository,
} from '../infrastructure/persistence/LocalStorageSessionRepository'
import { diagnosticLogger, type DiagnosticEventType, type DiagnosticLogger } from './diagnostics'
import type {
  LayoutIssue,
  PreviewSource,
  TestSession,
  ViewportSize,
} from '../models/types'
import { PREDEFINED_VIEWPORTS } from '../models/types'
import { applyIgnoredState, groupIssuesAcrossViewports } from '../engine/issueLifecycle'
import { SCORING_POLICY_VERSION } from '../domain/scoring/scorePolicy'
import { RULE_ENGINE_VERSION } from '../infrastructure/rules/LayoutRuleEngine'
import { buildCrossViewportKey } from '../engine/selectors'

export interface AnalysisConfigSnapshot {
  enabledRuleIds: string[]
  ruleEngineVersion: string
  scoringPolicyVersion: string
  maxElements: number
  maxOverlapCandidates: number
  maxIssuesPerRule: number
  ruleTimeoutMs: number
  viewportTimeoutMs: number
}

export interface ActiveSessionRuntime {
  sessionId: string
  state: SessionLifecycleState
  sourceState: SourceLifecycleState
  source: PreviewSource
  fingerprint: string
  config: AnalysisConfigSnapshot
  ignoredKeys: Record<string, string>
  controller: AbortController | null
  viewportRunState: ViewportRunState
}

function mustTransitionViewport(
  from: ViewportRunState,
  to: ViewportRunState,
): ViewportRunState {
  const result = transitionViewportRun(from, to)
  return result.ok ? result.value : from
}

export class AnalysisApplicationService {
  private runtime: ActiveSessionRuntime | null = null
  private readonly repo: SessionRepository
  private readonly diagnostics: DiagnosticLogger
  private readonly engine: typeof layoutRuleEngine

  constructor(
    repo: SessionRepository = sessionRepository,
    diagnostics: DiagnosticLogger = diagnosticLogger,
    engine: typeof layoutRuleEngine = layoutRuleEngine,
  ) {
    this.repo = repo
    this.diagnostics = diagnostics
    this.engine = engine
    this.engine.setDiagnostics({
      log: (type, message, meta) => {
        this.diagnostics.log(type as DiagnosticEventType, message, {
          ...(meta?.sessionId ? { sessionId: meta.sessionId } : {}),
          ...(meta?.ruleId ? { ruleId: meta.ruleId } : {}),
          ...(meta?.viewportId ? { viewportId: meta.viewportId } : {}),
          ...(meta?.detail ? { data: { detail: meta.detail } } : {}),
        })
      },
    })
  }

  getRuntime(): ActiveSessionRuntime | null {
    return this.runtime
  }

  validateSource(source: PreviewSource): Result<{ source: PreviewSource; fingerprint: string }, AppError> {
    this.diagnostics.log('source_validated', 'Validating source')
    const validation = validateSource(source)
    if (!validation.valid) {
      return err(Errors.invalidSource(validation.errors.join('; ')))
    }
    return ok({ source, fingerprint: String(fingerprintSource(source)) })
  }

  createAnalysisSession(source: PreviewSource, viewports: ViewportSize[] = PREDEFINED_VIEWPORTS): Result<TestSession, AppError> {
    if (this.runtime && !isSessionTerminal(this.runtime.state) && this.runtime.state === 'Running') {
      return err(Errors.sessionConflict(`Session ${this.runtime.sessionId} is ${this.runtime.state}`))
    }
    const validated = this.validateSource(source)
    if (!validated.ok) return validated

    const config: AnalysisConfigSnapshot = {
      enabledRuleIds: this.engine.getRegistry().listEnabled().map((r) => String(r.id)),
      ruleEngineVersion: RULE_ENGINE_VERSION,
      scoringPolicyVersion: SCORING_POLICY_VERSION,
      maxElements: 500,
      maxOverlapCandidates: 120,
      maxIssuesPerRule: 40,
      ruleTimeoutMs: 2000,
      viewportTimeoutMs: 15000,
    }

    const session = createSession({
      name: sourceDisplayName(source),
      source,
      selectedViewports: viewports,
      status: 'Draft',
      issues: [],
    })

    this.runtime = {
      sessionId: session.id,
      state: 'Draft',
      sourceState: 'Ready',
      source,
      fingerprint: validated.value.fingerprint,
      config,
      ignoredKeys: {},
      controller: null,
      viewportRunState: 'Pending',
    }
    this.diagnostics.log('session_created', `Session ${session.id} created`, {
      sessionId: session.id,
    })
    return ok(session)
  }

  transitionSourceState(to: SourceLifecycleState): Result<SourceLifecycleState, AppError> {
    if (!this.runtime) {
      this.runtime = {
        sessionId: String(asSessionId(createId('session'))),
        state: 'Draft',
        sourceState: 'Empty',
        source: { mode: 'markup', url: '', html: '', css: '', name: '' },
        fingerprint: '',
        config: {
          enabledRuleIds: [],
          ruleEngineVersion: RULE_ENGINE_VERSION,
          scoringPolicyVersion: SCORING_POLICY_VERSION,
          maxElements: 500,
          maxOverlapCandidates: 120,
          maxIssuesPerRule: 40,
          ruleTimeoutMs: 2000,
          viewportTimeoutMs: 15000,
        },
        ignoredKeys: {},
        controller: null,
        viewportRunState: 'Pending',
      }
    }
    const result = transitionSource(this.runtime.sourceState, to)
    if (result.ok) this.runtime.sourceState = result.value
    return result
  }

  mapUiSourceState(legacy: Parameters<typeof mapLegacySourceState>[0]): void {
    if (!this.runtime) return
    this.runtime.sourceState = mapLegacySourceState(legacy)
  }

  getUiSourceState(): ReturnType<typeof toLegacySourceState> {
    return toLegacySourceState(this.runtime?.sourceState ?? 'Empty')
  }

  cancelAnalysisSession(): Result<{ state: SessionLifecycleState }, AppError> {
    if (!this.runtime) return err(Errors.sessionConflict('No active session'))
    if (this.runtime.state === 'Draft') {
      this.runtime.state = 'Cancelled'
      this.runtime.viewportRunState = 'Cancelled'
      return ok({ state: 'Cancelled' })
    }
    const toCancelling = transitionSession(this.runtime.state, 'Cancelling')
    if (!toCancelling.ok) return toCancelling
    this.runtime.state = 'Cancelling'
    this.runtime.controller?.abort()
    this.runtime.viewportRunState = mustTransitionViewport(
      this.runtime.viewportRunState === 'Completed' ||
        this.runtime.viewportRunState === 'Failed' ||
        this.runtime.viewportRunState === 'Skipped' ||
        this.runtime.viewportRunState === 'Cancelled'
        ? 'Pending'
        : this.runtime.viewportRunState,
      'Cancelled',
    )
    // If already terminal viewport state, force Cancelled for bookkeeping
    if (
      this.runtime.viewportRunState !== 'Cancelled' &&
      transitionViewportRun(this.runtime.viewportRunState, 'Cancelled').ok
    ) {
      this.runtime.viewportRunState = 'Cancelled'
    } else if (this.runtime.viewportRunState !== 'Cancelled') {
      this.runtime.viewportRunState = 'Cancelled'
    }
    const cancelled = transitionSession(this.runtime.state, 'Cancelled')
    if (cancelled.ok) this.runtime.state = cancelled.value
    this.diagnostics.log('analysis_cancelled', 'Analysis cancelled', {
      sessionId: this.runtime.sessionId,
    })
    return ok({ state: this.runtime.state })
  }

  private beginSessionRunning(): Result<void, AppError> {
    if (!this.runtime) return err(Errors.sessionConflict('No active session'))
    if (this.runtime.state === 'Running') {
      return err(Errors.sessionConflict('Analysis already running'))
    }
    if (isSessionTerminal(this.runtime.state)) {
      // Rerun / new work creates a fresh non-terminal Draft→Running path
      this.runtime.state = 'Draft'
    }
    if (this.runtime.state === 'Draft' || this.runtime.state === 'Queued') {
      const t = transitionSession(this.runtime.state, 'Running')
      if (!t.ok) return t
      this.runtime.state = t.value
      return ok(undefined)
    }
    return err(Errors.sessionConflict(`Cannot start from ${this.runtime.state}`))
  }

  async runActiveViewportAnalysis(input: {
    document: Document | null
    viewport: ViewportSize
    preview: { loaded: boolean; blocked: boolean; accessible: boolean }
    ignoredKeys?: Record<string, string> | undefined
  }): Promise<Result<{
    issues: LayoutIssue[]
    engine: EngineAnalysisResult
    capabilitiesMessage: string
    sessionStatus: string
    viewportRunState: ViewportRunState
  }, AppError>> {
    const caps = capabilitiesFromPreview(input.preview)
    if (!caps.domInspectionAvailable || !input.document) {
      return err(
        Errors.inspectionUnavailable(
          describeCapabilities(caps) + ' — browser security limitation, not an app failure.',
        ),
      )
    }

    if (!this.runtime) {
      const created = this.createAnalysisSession(
        { mode: 'markup', url: '', html: '', css: '', name: 'adhoc' },
        [input.viewport],
      )
      if (!created.ok) return created
    }

    const started = this.beginSessionRunning()
    if (!started.ok) return started

    this.runtime!.viewportRunState = 'Pending'
    this.runtime!.viewportRunState = mustTransitionViewport(this.runtime!.viewportRunState, 'Preparing')

    const controller = new AbortController()
    this.runtime!.controller = controller
    this.diagnostics.log('viewport_started', `Viewport ${input.viewport.name}`, {
      sessionId: this.runtime!.sessionId,
      viewportId: input.viewport.id,
    })

    const viewportTimeout = window.setTimeout(() => {
      controller.abort()
    }, this.runtime!.config.viewportTimeoutMs)

    try {
      this.runtime!.viewportRunState = mustTransitionViewport(
        this.runtime!.viewportRunState,
        'Stabilising',
      )
      const stable = await waitForLayoutStabilization(input.document, {
        signal: controller.signal,
        timeoutMs: 5000,
      })
      this.diagnostics.log(
        'viewport_stabilised',
        stable.timedOut ? 'Stabilisation timed out' : 'Stabilised',
        {
          sessionId: this.runtime!.sessionId,
          viewportId: input.viewport.id,
          data: {
            durationMs: stable.durationMs,
            mutationCount: stable.mutationCount,
            timedOut: stable.timedOut,
          },
        },
      )

      this.runtime!.viewportRunState = mustTransitionViewport(
        this.runtime!.viewportRunState,
        'Analysing',
      )

      const engineResult = this.engine.analyze({
        document: input.document,
        viewport: input.viewport,
        sourceFingerprint: this.runtime!.fingerprint || 'unknown',
        capabilities: caps,
        signal: controller.signal,
        sessionId: this.runtime!.sessionId,
        limits: {
          maxElements: this.runtime!.config.maxElements,
          maxOverlapCandidates: this.runtime!.config.maxOverlapCandidates,
          maxIssuesPerRule: this.runtime!.config.maxIssuesPerRule,
          ruleTimeoutMs: this.runtime!.config.ruleTimeoutMs,
        },
      })

      if (stable.timedOut) {
        engineResult.coverage = calculateCoverage({
          applicableRules: engineResult.executions.length,
          executedRules: engineResult.executions.filter((e) => e.status === 'completed').length,
          skippedRules: engineResult.executions.filter((e) => e.status === 'skipped').length,
          failedRules: engineResult.executions.filter((e) => e.status === 'failed').length,
          domAccessible: true,
          stabilizationTimedOut: true,
        })
        engineResult.truncatedWarnings.push(
          'DOM stabilization timed out — analysis continued with a coverage penalty.',
        )
      }

      const ignored = applyIgnoredState(
        engineResult.issues,
        input.ignoredKeys ?? this.runtime!.ignoredKeys,
      )
      for (const issue of ignored.filter((i) => i.lifecycle === 'open')) {
        this.diagnostics.log('issue_detected', issue.title, {
          sessionId: this.runtime!.sessionId,
          ruleId: issue.ruleId,
        })
      }

      this.runtime!.viewportRunState = mustTransitionViewport(
        this.runtime!.viewportRunState,
        'Completed',
      )

      const completed = transitionSession(this.runtime!.state, 'Completed')
      if (completed.ok) this.runtime!.state = completed.value
      else this.runtime!.state = 'Completed'

      return ok({
        issues: ignored,
        engine: { ...engineResult, issues: ignored },
        capabilitiesMessage: describeCapabilities(caps),
        sessionStatus: toUiSessionStatus(this.runtime!.state),
        viewportRunState: this.runtime!.viewportRunState,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.runtime!.state = 'Cancelled'
        this.runtime!.viewportRunState = 'Cancelled'
        return err(Errors.cancelled())
      }
      this.runtime!.state = 'Failed'
      this.runtime!.viewportRunState = mustTransitionViewport(
        this.runtime!.viewportRunState,
        'Failed',
      )
      return err(
        Errors.analysisTimeout(error instanceof Error ? error.message : 'Analysis failed'),
      )
    } finally {
      window.clearTimeout(viewportTimeout)
      this.runtime!.controller = null
    }
  }

  /** Rerun against the same source fingerprint / ignored-key scope. */
  async rerunAnalysis(input: {
    document: Document | null
    viewport: ViewportSize
    preview: { loaded: boolean; blocked: boolean; accessible: boolean }
    ignoredKeys?: Record<string, string> | undefined
  }): Promise<Result<{
    issues: LayoutIssue[]
    engine: EngineAnalysisResult
    capabilitiesMessage: string
    sessionStatus: string
    viewportRunState: ViewportRunState
  }, AppError>> {
    if (this.runtime && isSessionTerminal(this.runtime.state)) {
      this.runtime.state = 'Draft'
      this.runtime.viewportRunState = 'Pending'
    }
    return this.runActiveViewportAnalysis(input)
  }

  async runAllViewportsAnalysis(input: {
    getDocument: () => Document | null
    setViewport: (vp: ViewportSize) => void
    reloadPreview: () => Promise<void>
    preview: { loaded: boolean; blocked: boolean; accessible: boolean }
    source: PreviewSource
    ignoredKeys?: Record<string, string> | undefined
    captureScreenshot: () => Promise<string | null>
  }): Promise<Result<{
    summary: ReturnType<typeof summarizeMultiViewport>
    issues: LayoutIssue[]
    sessionStatus: string
    session: TestSession
  }, AppError>> {
    if (this.runtime && this.runtime.state === 'Running') {
      return err(Errors.sessionConflict('Analysis already running'))
    }

    const created = this.createAnalysisSession(input.source, PREDEFINED_VIEWPORTS)
    if (!created.ok) return created
    const running = transitionSession(this.runtime!.state, 'Running')
    if (running.ok) this.runtime!.state = running.value
    else this.runtime!.state = 'Running'

    const controller = new AbortController()
    this.runtime!.controller = controller
    const results = []

    try {
      for (const vp of PREDEFINED_VIEWPORTS) {
        if (controller.signal.aborted) break
        input.setViewport(vp)
        await input.reloadPreview()
        const doc = input.getDocument()
        const caps = capabilitiesFromPreview(input.preview)
        if (!doc || !caps.domInspectionAvailable) {
          results.push(buildViewportResult(vp, [], null, 'failed', 'Inspection unavailable'))
          continue
        }
        // Nested single-viewport analysis — temporarily release Running guard
        this.runtime!.state = 'Draft'
        const single = await this.runActiveViewportAnalysis({
          document: doc,
          viewport: vp,
          preview: input.preview,
          ...(input.ignoredKeys ? { ignoredKeys: input.ignoredKeys } : {}),
        })
        this.runtime!.state = 'Running'
        this.runtime!.controller = controller
        if (!single.ok) {
          results.push(buildViewportResult(vp, [], null, 'failed', single.error.message))
          continue
        }
        const shot = caps.screenshotAvailable ? await input.captureScreenshot() : null
        results.push(buildViewportResult(vp, single.value.issues, shot, 'success'))
      }

      if (controller.signal.aborted) {
        this.runtime!.state = 'Cancelled'
        return err(Errors.cancelled())
      }

      const status = finalizeSessionStatus(results)
      this.runtime!.state = fromUiSessionStatus(status)
      const summary = summarizeMultiViewport(sourceDisplayName(input.source), results)
      const issues = results.flatMap((r) => r.issues)
      void groupIssuesAcrossViewports(issues, PREDEFINED_VIEWPORTS)
      const session = createSession({
        name: sourceDisplayName(input.source),
        source: input.source,
        selectedViewports: PREDEFINED_VIEWPORTS,
        status,
        results,
        ignoredIssueKeys: input.ignoredKeys ?? this.runtime!.ignoredKeys,
        multiViewportSummary: summary,
        issues,
        report: createReport({
          sourceName: sourceDisplayName(input.source),
          sourceMode: input.source.mode,
          ...(input.source.mode === 'url' ? { sourceUrl: input.source.url } : {}),
          viewport: PREDEFINED_VIEWPORTS[0]!,
          viewports: PREDEFINED_VIEWPORTS,
          issues,
          screenshots: results.map((r) => r.screenshotDataUrl).filter(Boolean) as string[],
          sessionId: this.runtime!.sessionId,
          sourceFingerprint: this.runtime!.fingerprint,
          analysisConfiguration: {
            maxElements: this.runtime!.config.maxElements,
            maxOverlapCandidates: this.runtime!.config.maxOverlapCandidates,
            ruleTimeoutMs: this.runtime!.config.ruleTimeoutMs,
          },
        }),
      })
      this.repo.save(session)
      this.diagnostics.log('report_generated', 'Multi-viewport session persisted', {
        sessionId: session.id,
      })
      return ok({
        summary,
        issues,
        sessionStatus: status,
        session,
      })
    } finally {
      this.runtime!.controller = null
    }
  }

  ignoreIssue(
    issues: LayoutIssue[],
    issueId: string,
    reason: string,
  ): Result<{ issues: LayoutIssue[]; ignoredKeys: Record<string, string> }, AppError> {
    const fingerprint = this.runtime?.fingerprint ?? ''
    const ignoredKeys: Record<string, string> = { ...(this.runtime?.ignoredKeys ?? {}) }
    const next = issues.map((issue) => {
      if (issue.id !== issueId) return issue
      const transitioned = transitionIssue('Open', 'Ignored')
      if (!transitioned.ok) return issue
      const scoped = buildIgnoredIdentityKey({
        fingerprint: fingerprint || issue.sourceFingerprint || '',
        ruleId: issue.ruleId,
        selector: issue.selector,
      })
      ignoredKeys[scoped] = reason
      ignoredKeys[buildCrossViewportKey(issue.ruleId, issue.selector)] = reason
      return { ...issue, lifecycle: 'ignored' as const, ignoreReason: reason }
    })
    if (this.runtime) this.runtime.ignoredKeys = ignoredKeys
    return ok({ issues: next, ignoredKeys })
  }

  restoreIgnoredIssue(
    issues: LayoutIssue[],
    issueId: string,
  ): Result<{ issues: LayoutIssue[]; ignoredKeys: Record<string, string> }, AppError> {
    const fingerprint = this.runtime?.fingerprint ?? ''
    const ignoredKeys = { ...(this.runtime?.ignoredKeys ?? {}) }
    const next = issues.map((issue) => {
      if (issue.id !== issueId) return issue
      const transitioned = transitionIssue('Ignored', 'Open')
      if (!transitioned.ok && issue.lifecycle !== 'ignored') return issue
      delete ignoredKeys[buildCrossViewportKey(issue.ruleId, issue.selector)]
      delete ignoredKeys[
        buildIgnoredIdentityKey({
          fingerprint: fingerprint || issue.sourceFingerprint || '',
          ruleId: issue.ruleId,
          selector: issue.selector,
        })
      ]
      const { ignoreReason: _removed, ...rest } = issue
      void _removed
      return { ...rest, lifecycle: 'open' as const }
    })
    if (this.runtime) this.runtime.ignoredKeys = ignoredKeys
    return ok({ issues: next, ignoredKeys })
  }

  generateReport(input: {
    source: PreviewSource
    viewport: ViewportSize
    issues: LayoutIssue[]
    format: 'json' | 'html'
    sessionStatus: string
    coveragePercent?: number | undefined
    coverageWarning?: string | null | undefined
  }): Result<{ filename: string }, AppError> {
    if (input.sessionStatus === 'Draft' || input.sessionStatus === 'Running') {
      return err(Errors.exportFailed('Export requires a completed or partially completed session.'))
    }
    try {
      const report = createReport({
        sourceName: sourceDisplayName(input.source),
        sourceMode: input.source.mode,
        ...(input.source.mode === 'url' ? { sourceUrl: input.source.url } : {}),
        viewport: input.viewport,
        issues: input.issues,
        ...(this.runtime?.sessionId ? { sessionId: this.runtime.sessionId } : {}),
        ...(this.runtime?.fingerprint ? { sourceFingerprint: this.runtime.fingerprint } : {}),
        ...(input.coveragePercent !== undefined ? { coveragePercent: input.coveragePercent } : {}),
        ...(input.coverageWarning !== undefined ? { coverageWarning: input.coverageWarning } : {}),
        diagnosticSummary: this.diagnostics.summary(),
        ...(this.runtime
          ? {
              analysisConfiguration: {
                maxElements: this.runtime.config.maxElements,
                maxOverlapCandidates: this.runtime.config.maxOverlapCandidates,
                ruleTimeoutMs: this.runtime.config.ruleTimeoutMs,
              },
            }
          : {}),
      })
      if (input.format === 'json') {
        downloadTextFile(
          `layout-report-${report.id}.json`,
          exportReportJson(report),
          'application/json',
        )
      } else {
        downloadTextFile(`layout-report-${report.id}.html`, exportReportHtml(report), 'text/html')
      }
      this.diagnostics.log(
        'report_generated',
        `Exported ${input.format}`,
        this.runtime?.sessionId ? { sessionId: this.runtime.sessionId } : {},
      )
      return ok({ filename: `layout-report-${report.id}.${input.format}` })
    } catch (error) {
      return err(Errors.exportFailed(error instanceof Error ? error.message : 'export failed'))
    }
  }

  listSessions(): Result<TestSession[], AppError> {
    return this.repo.list()
  }

  restorePreviousSession(id: string): Result<TestSession, AppError> {
    const listed = this.repo.list()
    if (!listed.ok) return listed
    const found = listed.value.find((s) => s.id === id)
    if (!found) return err(Errors.storage(`Session ${id} not found`))
    return ok(found)
  }

  deleteSession(id: string): Result<TestSession[], AppError> {
    return this.repo.delete(id)
  }

  saveSession(session: TestSession): Result<TestSession[], AppError> {
    return this.repo.save(session)
  }
}

export const analysisApp = new AnalysisApplicationService()
