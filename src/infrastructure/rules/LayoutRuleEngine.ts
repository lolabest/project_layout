import { hashString } from '../../domain/fingerprint'
import { calculateCoverage, type CoverageResult } from '../../domain/coverage'
import { calculateScore, type ScoreBreakdown } from '../../domain/scoring/scorePolicy'
import type { AnalysisCapabilities } from '../../domain/capabilities'
import type { LayoutIssue } from '../../models/types'
import { DEFAULT_RULE_LIMITS, type RuleContext, type RuleResult } from './types'
import { RuleRegistry } from './RuleRegistry'

export const RULE_ENGINE_VERSION = '1.0.0'

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
  skipReason?: string
  diagnostic?: string
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

function stableIssueId(input: {
  fingerprint: string
  ruleId: string
  selector: string
  measurementSignature: string
}): string {
  return `issue-${hashString(
    `${input.fingerprint}|${input.ruleId}|${input.selector}|${input.measurementSignature}`,
  )}`
}

export class LayoutRuleEngine {
  private readonly registry: RuleRegistry

  constructor(registry: RuleRegistry = new RuleRegistry()) {
    this.registry = registry
  }

  getRegistry(): RuleRegistry {
    return this.registry
  }

  analyze(input: {
    document: Document
    viewport: EngineViewport
    sourceFingerprint: string
    capabilities: AnalysisCapabilities
    signal?: AbortSignal
    limits?: Partial<RuleContext['limits']>
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
      signal: input.signal,
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
      const result = rule.evaluate(context)
      executions.push({
        ruleId: String(rule.id),
        name: rule.name,
        version: rule.version,
        status: result.status,
        durationMs: result.durationMs,
        inspectedElements: result.inspectedElements,
        warnings: result.warnings,
        skipReason: result.skipReason,
        diagnostic: result.diagnostic,
        issueCount: result.issues.length,
      })

      if (result.status === 'failed') {
        failed++
        continue
      }
      if (result.status === 'skipped') {
        skipped++
        continue
      }
      executed++
      warnings.push(...result.warnings)

      for (const data of result.issues) {
        const id = stableIssueId({
          fingerprint: input.sourceFingerprint,
          ruleId: String(rule.id),
          selector: data.selector,
          measurementSignature: data.measurementSignature,
        })
        const now = new Date().toISOString()
        issues.push({
          id,
          ruleId: String(rule.id),
          type: mapRuleToLegacyType(String(rule.id)),
          severity: data.severity,
          title: data.title,
          description: data.explanation,
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
          lifecycle: 'open',
          issueKey: `${rule.id}::${data.selector}::${input.viewport.id}`,
          tagName: data.tagName,
          boundingRect: data.boundingRect,
        })
        }
    }

    const score = calculateScore(
      issues.map((i) => ({
        ruleId: i.ruleId,
        selector: i.selector,
        severity: i.severity,
        confidence: i.confidence,
        category: executions.find((e) => e.ruleId === i.ruleId)
          ? (this.registry.get(i.ruleId)?.category ?? 'structure')
          : 'structure',
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

function mapRuleToLegacyType(
  ruleId: string,
): LayoutIssue['type'] {
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
    'sticky-obstruction': 'overlapping',
    'unexpected-scrollbar': 'horizontal-overflow',
    'small-text': 'text-clipping',
    'image-layout-shift': 'image-overflow',
  }
  return map[ruleId] ?? 'fixed-width'
}

export const layoutRuleEngine = new LayoutRuleEngine()
