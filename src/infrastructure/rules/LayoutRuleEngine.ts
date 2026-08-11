import { calculateCoverage, type CoverageResult } from '../../domain/coverage'
import {
  calculateScore,
  type IssueCategory,
  type ScoreBreakdown,
} from '../../domain/scoring/scorePolicy'
import type { AnalysisCapabilities } from '../../domain/capabilities'
import { buildIssueIdentity, createStableIssueId } from '../../domain/issueIdentity'
import type { LayoutIssue } from '../../models/types'
import { DEFAULT_RULE_LIMITS, type RuleContext, type RuleResult } from './types'
import { RuleRegistry } from './RuleRegistry'

/** Minimal diagnostic sink — avoids coupling infrastructure to application layer. */
export interface RuleEngineDiagnostics {
  log(
    type: string,
    message: string,
    meta?: {
      sessionId?: string | undefined
      ruleId?: string | undefined
      viewportId?: string | undefined
      detail?: string | undefined
    },
  ): void
}

export const RULE_ENGINE_VERSION = '1.1.0'

export interface EngineViewport {
  id: string
  name: string
  width: number
  height: number
}

export interface RuleExecutionRecord {
  ruleId: string
  name: string
  version: string
  status: RuleResult['status']
  durationMs: number
  inspectedElements: number
  warnings: string[]
  skipReason?: string | undefined
  diagnostic?: string | undefined
  issueCount: number
}

export interface EngineAnalysisResult {
  issues: LayoutIssue[]
  executions: RuleExecutionRecord[]
  score: ScoreBreakdown
  coverage: CoverageResult
  analyzedAt: string
  truncatedWarnings: string[]
}

function withRuleTimeout(evaluate: () => RuleResult, timeoutMs: number, signal?: AbortSignal): RuleResult {
  if (signal?.aborted) {
    return {
      status: 'failed',
      issues: [],
      inspectedElements: 0,
      durationMs: 0,
      warnings: [],
      diagnostic: 'Aborted before rule start',
    }
  }
  const started = performance.now()
  const result = evaluate()
  const duration = Math.round(performance.now() - started)
  if (duration > timeoutMs) {
    return {
      ...result,
      status: result.status === 'completed' ? 'completed' : result.status,
      durationMs: duration,
      warnings: [
        ...result.warnings,
        `Rule exceeded soft timeout ${timeoutMs}ms (took ${duration}ms); results may be partial.`,
      ],
      diagnostic: result.diagnostic ?? `Soft timeout ${timeoutMs}ms exceeded`,
    }
  }
  return { ...result, durationMs: duration }
}

export class LayoutRuleEngine {
  private readonly registry: RuleRegistry
  private diagnostics: RuleEngineDiagnostics | null = null

  constructor(registry: RuleRegistry = new RuleRegistry()) {
    this.registry = registry
  }

  setDiagnostics(logger: RuleEngineDiagnostics | null): void {
    this.diagnostics = logger
  }

  getRegistry(): RuleRegistry {
    return this.registry
  }

  analyze(input: {
    document: Document
    viewport: EngineViewport
    sourceFingerprint: string
    capabilities: AnalysisCapabilities
    signal?: AbortSignal | undefined
    limits?: Partial<RuleContext['limits']> | undefined
    sessionId?: string | undefined
  }): EngineAnalysisResult {
    const limits = { ...DEFAULT_RULE_LIMITS, ...input.limits }
    const context: RuleContext = {
      document: input.document,
      viewport: input.viewport,
      sourceFingerprint: input.sourceFingerprint,
      capabilities: {
        previewAvailable: input.capabilities.previewAvailable,
        domInspectionAvailable: input.capabilities.domInspectionAvailable,
        screenshotAvailable: input.capabilities.screenshotAvailable,
      },
      ...(input.signal ? { signal: input.signal } : {}),
      limits,
    }

    const executions: RuleExecutionRecord[] = []
    const issues: LayoutIssue[] = []
    const warnings: string[] = []
    let applicable = 0
    let executed = 0
    let skipped = 0
    let failed = 0

    for (const rule of this.registry.listEnabled()) {
      if (input.signal?.aborted) break
      const support = rule.supports(context)
      if (!support.applicable) {
        skipped++
        applicable++
        this.diagnostics?.log('rule_skipped', rule.name, {
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          ruleId: String(rule.id),
          viewportId: input.viewport.id,
          detail: support.reason ?? 'Not applicable',
        })
        executions.push({
          ruleId: String(rule.id),
          name: rule.name,
          version: rule.version,
          status: 'skipped',
          durationMs: 0,
          inspectedElements: 0,
          warnings: [],
          skipReason: support.reason ?? 'Not applicable',
          issueCount: 0,
        })
        continue
      }

      applicable++
      this.diagnostics?.log('rule_started', rule.name, {
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ruleId: String(rule.id),
        viewportId: input.viewport.id,
      })

      let result: RuleResult
      try {
        result = withRuleTimeout(() => rule.evaluate(context), limits.ruleTimeoutMs, input.signal)
      } catch (error) {
        failed++
        const diagnostic = error instanceof Error ? error.message : String(error)
        this.diagnostics?.log('rule_failed', rule.name, {
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          ruleId: String(rule.id),
          detail: diagnostic,
        })
        executions.push({
          ruleId: String(rule.id),
          name: rule.name,
          version: rule.version,
          status: 'failed',
          durationMs: 0,
          inspectedElements: 0,
          warnings: [],
          diagnostic,
          issueCount: 0,
        })
        continue
      }

      const execution: RuleExecutionRecord = {
        ruleId: String(rule.id),
        name: rule.name,
        version: rule.version,
        status: result.status,
        durationMs: result.durationMs,
        inspectedElements: result.inspectedElements,
        warnings: result.warnings,
        issueCount: result.issues.length,
      }
      if (result.skipReason !== undefined) execution.skipReason = result.skipReason
      if (result.diagnostic !== undefined) execution.diagnostic = result.diagnostic
      executions.push(execution)

      if (result.status === 'failed') {
        failed++
        this.diagnostics?.log('rule_failed', rule.name, {
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          ruleId: String(rule.id),
          detail: result.diagnostic ?? 'Rule failed',
        })
        continue
      }
      if (result.status === 'skipped') {
        skipped++
        this.diagnostics?.log('rule_skipped', rule.name, {
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          ruleId: String(rule.id),
          detail: result.skipReason ?? 'Skipped',
        })
        continue
      }

      executed++
      this.diagnostics?.log('rule_completed', rule.name, {
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ruleId: String(rule.id),
        viewportId: input.viewport.id,
        detail: `${result.issues.length} issues, ${result.durationMs}ms`,
      })
      warnings.push(...result.warnings)

      const now = new Date().toISOString()
      for (const data of result.issues) {
        const id = String(
          createStableIssueId({
            fingerprint: input.sourceFingerprint,
            ruleId: String(rule.id),
            selector: data.selector,
            measurementSignature: data.measurementSignature,
          }),
        )
        const issue: LayoutIssue = {
          id,
          ruleId: String(rule.id),
          ruleVersion: rule.version,
          type: mapRuleToLegacyType(String(rule.id)),
          category: data.category,
          severity: data.severity,
          title: data.title,
          description: data.explanation,
          explanation: data.explanation,
          selector: data.selector,
          elementPath: data.elementPath,
          viewport: {
            id: input.viewport.id,
            name: input.viewport.name,
            width: input.viewport.width,
            height: input.viewport.height,
          },
          measuredValues: data.actual,
          expectedValues: data.expected,
          recommendation: rule.getRecommendation(data),
          confidence: data.confidence,
          timestamp: now,
          firstDetectedAt: now,
          lastDetectedAt: now,
          lifecycle: 'open',
          issueKey: `${rule.id}::${data.selector}::${input.viewport.id}`,
          identitySignature: buildIssueIdentity({
            fingerprint: input.sourceFingerprint,
            ruleId: String(rule.id),
            selector: data.selector,
            measurementSignature: data.measurementSignature,
          }),
          sourceFingerprint: input.sourceFingerprint,
        }
        if (data.tagName !== undefined) issue.tagName = data.tagName
        if (data.boundingRect !== undefined) issue.boundingRect = data.boundingRect
        if (data.evidenceStyles !== undefined) issue.evidenceStyles = data.evidenceStyles
        if (data.overflowArea !== undefined) issue.overflowArea = data.overflowArea
        if (data.intersectionArea !== undefined) issue.intersectionArea = data.intersectionArea
        issues.push(issue)
      }
    }

    const score = calculateScore(
      issues.map((i) => ({
        ruleId: i.ruleId,
        selector: i.selector,
        severity: i.severity,
        confidence: i.confidence,
        category:
          (i.category as IssueCategory | undefined) ??
          this.registry.get(i.ruleId)?.category ??
          'structure',
        lifecycle: i.lifecycle,
      })),
    )

    const coverage = calculateCoverage({
      applicableRules: applicable,
      executedRules: executed,
      skippedRules: skipped,
      failedRules: failed,
      domAccessible: input.capabilities.domInspectionAvailable,
      stabilizationTimedOut: false,
    })

    return {
      issues,
      executions,
      score,
      coverage,
      analyzedAt: new Date().toISOString(),
      truncatedWarnings: warnings,
    }
  }
}

function mapRuleToLegacyType(ruleId: string): LayoutIssue['type'] {
  const map: Record<string, LayoutIssue['type']> = {
    'horizontal-overflow': 'horizontal-overflow',
    'outside-viewport': 'outside-viewport',
    overlapping: 'overlapping',
    'text-clipping': 'text-clipping',
    'image-overflow': 'image-overflow',
    'missing-alt': 'missing-alt',
    'broken-image': 'broken-image',
    'broken-link': 'broken-link',
    'fixed-width': 'fixed-width',
    'small-touch-target': 'small-touch-target',
    'inaccessible-control': 'inaccessible-control',
    'duplicate-id': 'duplicate-id',
    'invalid-aria': 'invalid-aria',
    'unlabelled-control': 'unlabelled-control',
    'sticky-obstruction': 'sticky-obstruction',
    'unexpected-scrollbar': 'unexpected-scrollbar',
    'small-text': 'small-text',
    'image-layout-shift': 'image-layout-shift',
  }
  return map[ruleId] ?? 'fixed-width'
}

export const layoutRuleEngine = new LayoutRuleEngine()
