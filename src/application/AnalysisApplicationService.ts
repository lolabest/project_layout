import { Errors, type AppError } from '../domain/errors'
import { fingerprintSource } from '../domain/fingerprint'
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
import { diagnosticLogger, type DiagnosticLogger } from './diagnostics'
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

export interface AnalysisConfigSnapshot {
  enabledRuleIds: string[]
  ruleEngineVersion: string
  scoringPolicyVersion: string
  maxElements: number
  maxOverlapCandidates: number
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
    if (this.runtime && !isSessionTerminal(this.runtime.state)) {
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
        },
        ignoredKeys: {},
        controller: null,
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
    const toCancelling = transitionSession(this.runtime.state, 'Cancelling')
    if (!toCancelling.ok) {
      // Allow cancel from Draft quietly
      if (this.runtime.state === 'Draft') {
        this.runtime.state = 'Cancelled'
        return ok({ state: 'Cancelled' })
      }
      return toCancelling
    }
    this.runtime.state = 'Cancelling'
    this.runtime.controller?.abort()
    const cancelled = transitionSession(this.runtime.state, 'Cancelled')
    if (cancelled.ok) this.runtime.state = cancelled.value
    this.diagnostics.log('analysis_cancelled', 'Analysis cancelled', {
      sessionId: this.runtime.sessionId,
    })
    return ok({ state: this.runtime.state })
  }

  async runActiveViewportAnalysis(input: {
    document: Document | null
    viewport: ViewportSize
    preview: { loaded: boolean; blocked: boolean; accessible: boolean }
    ignoredKeys?: Record<string, string>
  }): Promise<Result<{
    issues: LayoutIssue[]
    engine: EngineAnalysisResult
    capabilitiesMessage: string
    sessionStatus: string
  }, AppError>> {
    if (this.runtime && !isSessionTerminal(this.runtime.state) && this.runtime.state === 'Running') {
      return err(Errors.sessionConflict('Analysis already running'))
    }

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

    const start = transitionSession(this.runtime!.state === 'Draft' ? 'Draft' : 'Draft', 'Running')
    // Force runtime to Running from Draft/Queued
    if (this.runtime!.state === 'Draft' || this.runtime!.state === 'Queued') {
      const t = transitionSession(this.runtime!.state, 'Running')
      if (!t.ok) return t
      this.runtime!.state = t.value
    } else if (isSessionTerminal(this.runtime!.state)) {
      this.runtime!.state = 'Running'
    } else if (this.runtime!.state !== 'Running') {
      if (!start.ok) {
        this.runtime!.state = 'Running'
      }
    }

    const controller = new AbortController()
    this.runtime!.controller = controller
    this.diagnostics.log('viewport_started', `Viewport ${input.viewport.name}`, {
      sessionId: this.runtime!.sessionId,
      viewportId: input.viewport.id,
    })

    try {
      const stable = await waitForLayoutStabilization(input.document, {
        signal: controller.signal,
        timeoutMs: 5000,
      })
      this.diagnostics.log('viewport_stabilised', stable.timedOut ? 'Stabilisation timed out' : 'Stabilised', {
        sessionId: this.runtime!.sessionId,
        viewportId: input.viewport.id,
      })

      const engineResult = this.engine.analyze({
        document: input.document,
        viewport: input.viewport,
        sourceFingerprint: this.runtime!.fingerprint || 'unknown',
        capabilities: caps,
        signal: controller.signal,
        limits: {
          maxElements: this.runtime!.config.maxElements,
          maxOverlapCandidates: this.runtime!.config.maxOverlapCandidates,
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
      }

      const ignored = applyIgnoredState(engineResult.issues, input.ignoredKeys ?? this.runtime!.ignoredKeys)
      for (const issue of ignored) {
        this.diagnostics.log('issue_detected', issue.title, {
          sessionId: this.runtime!.sessionId,
          ruleId: issue.ruleId,
        })
      }

      const completed = transitionSession(this.runtime!.state, 'Completed')
      if (completed.ok) this.runtime!.state = completed.value
      else this.runtime!.state = 'Completed'

      return ok({
        issues: ignored,
        engine: { ...engineResult, issues: ignored },
        capabilitiesMessage: describeCapabilities(caps),
        sessionStatus: toUiSessionStatus(this.runtime!.state),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.runtime!.state = 'Cancelled'
        return err(Errors.cancelled())
      }
      this.runtime!.state = 'Failed'
      return err(
        Errors.analysisTimeout(error instanceof Error ? error.message : 'Analysis failed'),
      )
    } finally {
      this.runtime!.controller = null
    }
  }

  async runAllViewportsAnalysis(input: {
    getDocument: () => Document | null
    setViewport: (vp: ViewportSize) => void
    reloadPreview: () => Promise<void>
    preview: { loaded: boolean; blocked: boolean; accessible: boolean }
    source: PreviewSource
    ignoredKeys?: Record<string, string>
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
        const single = await this.runActiveViewportAnalysis({
          document: doc,
          viewport: vp,
          preview: input.preview,
          ignoredKeys: input.ignoredKeys,
        })
        // runActiveViewportAnalysis sets state Completed — keep Running for multi
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
      const grouped = groupIssuesAcrossViewports(issues, PREDEFINED_VIEWPORTS)
      void grouped
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
          sourceUrl: input.source.mode === 'url' ? input.source.url : undefined,
          viewport: PREDEFINED_VIEWPORTS[0]!,
          viewports: PREDEFINED_VIEWPORTS,
          issues,
          screenshots: results.map((r) => r.screenshotDataUrl).filter(Boolean) as string[],
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
    const ignoredKeys: Record<string, string> = { ...(this.runtime?.ignoredKeys ?? {}) }
    const next = issues.map((issue) => {
      if (issue.id !== issueId) return issue
      const transitioned = transitionIssue('Open', 'Ignored')
      if (!transitioned.ok) return issue
      ignoredKeys[`${issue.ruleId}::${issue.selector}`] = reason
      return { ...issue, lifecycle: 'ignored' as const, ignoreReason: reason }
    })
    if (this.runtime) this.runtime.ignoredKeys = ignoredKeys
    return ok({ issues: next, ignoredKeys })
  }

  restoreIgnoredIssue(
    issues: LayoutIssue[],
    issueId: string,
  ): Result<{ issues: LayoutIssue[]; ignoredKeys: Record<string, string> }, AppError> {
    const ignoredKeys = { ...(this.runtime?.ignoredKeys ?? {}) }
    const next = issues.map((issue) => {
      if (issue.id !== issueId) return issue
      delete ignoredKeys[`${issue.ruleId}::${issue.selector}`]
      return { ...issue, lifecycle: 'open' as const, ignoreReason: undefined }
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
  }): Result<{ filename: string }, AppError> {
    if (input.sessionStatus === 'Draft' || input.sessionStatus === 'Running') {
      return err(Errors.exportFailed('Export requires a completed or partially completed session.'))
    }
    try {
      const report = createReport({
        sourceName: sourceDisplayName(input.source),
        sourceMode: input.source.mode,
        sourceUrl: input.source.mode === 'url' ? input.source.url : undefined,
        viewport: input.viewport,
        issues: input.issues,
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
      this.diagnostics.log('report_generated', `Exported ${input.format}`, {
        sessionId: this.runtime?.sessionId,
      })
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
