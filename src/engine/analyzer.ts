import type { AnalysisResult, AnalyzerOptions, LayoutIssue, Severity, ViewportSize } from '../models/types'
import { capabilitiesFromPreview } from '../domain/capabilities'
import { layoutRuleEngine } from '../infrastructure/rules/LayoutRuleEngine'
import {
  brokenImageRule,
  brokenLinkRule,
  fixedWidthRule,
  horizontalOverflowRule,
  inaccessibleControlRule,
  imageOverflowRule,
  missingAltRule,
  outsideViewportRule,
  overlappingRule,
  smallTouchTargetRule,
  textClippingRule,
} from '../infrastructure/rules/builtinRules'
import type { RuleContext } from '../infrastructure/rules/types'
import { DEFAULT_RULE_LIMITS } from '../infrastructure/rules/types'

function toViewport(options: AnalyzerOptions | { viewportWidth: number; viewportHeight: number }): ViewportSize {
  if ('viewport' in options) return options.viewport
  return {
    id: 'custom',
    name: 'Custom',
    width: options.viewportWidth,
    height: options.viewportHeight,
  }
}

function ruleContext(doc: Document, viewport: ViewportSize, signal?: AbortSignal): RuleContext {
  return {
    document: doc,
    viewport,
    sourceFingerprint: 'test',
    capabilities: {
      previewAvailable: true,
      domInspectionAvailable: true,
      screenshotAvailable: true,
    },
    signal,
    limits: DEFAULT_RULE_LIMITS,
  }
}

function issuesFromRule(
  rule: { evaluate: (ctx: RuleContext) => { issues: Array<Omit<LayoutIssue, 'id' | 'ruleId' | 'type' | 'description' | 'timestamp' | 'lifecycle' | 'issueKey'> & { explanation: string; actual: LayoutIssue['measuredValues']; expected: LayoutIssue['expectedValues'] }> } },
  // simplified: use engine path instead
): LayoutIssue[] {
  void rule
  return []
}

void issuesFromRule

function runSingleRule(
  rule: typeof missingAltRule,
  doc: Document,
  viewport: ViewportSize,
): LayoutIssue[] {
  const ctx = ruleContext(doc, viewport)
  const support = rule.supports(ctx)
  if (!support.applicable) return []
  const result = rule.evaluate(ctx)
  return result.issues.map((data) => ({
    id: `issue-${rule.id}-${data.selector}`,
    ruleId: String(rule.id),
    type: String(rule.id) as LayoutIssue['type'],
    severity: data.severity,
    title: data.title,
    description: data.explanation,
    selector: data.selector,
    elementPath: data.elementPath,
    viewport,
    measuredValues: data.actual,
    expectedValues: data.expected,
    recommendation: rule.getRecommendation(data),
    confidence: data.confidence,
    timestamp: new Date().toISOString(),
    lifecycle: 'open' as const,
    issueKey: `${rule.id}::${data.selector}::${viewport.id}`,
    tagName: data.tagName,
    boundingRect: data.boundingRect,
  }))
}

export function detectHorizontalOverflow(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(horizontalOverflowRule, doc, viewport)
}
export function detectOutsideViewport(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(outsideViewportRule, doc, viewport)
}
export function detectOverlapping(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(overlappingRule, doc, viewport)
}
export function detectTextClipping(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(textClippingRule, doc, viewport)
}
export function detectImageOverflow(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(imageOverflowRule, doc, viewport)
}
export function detectMissingAlt(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(missingAltRule, doc, viewport)
}
export function detectBrokenImages(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(brokenImageRule, doc, viewport)
}
export function detectBrokenLinks(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(brokenLinkRule, doc, viewport)
}
export function detectFixedWidths(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(fixedWidthRule, doc, viewport)
}
export function detectSmallTouchTargets(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(smallTouchTargetRule, doc, viewport)
}
export function detectInaccessibleControls(doc: Document, viewport: ViewportSize): LayoutIssue[] {
  return runSingleRule(inaccessibleControlRule, doc, viewport)
}

/** @deprecated Prefer LayoutRuleEngine via AnalysisApplicationService */
export class LayoutAnalyzer {
  analyze(doc: Document, options: AnalyzerOptions): AnalysisResult {
    return analyzeDocument(doc, options)
  }
}

export const layoutAnalyzer = new LayoutAnalyzer()

export function analyzeDocument(
  doc: Document,
  options:
    | AnalyzerOptions
    | {
        viewportWidth: number
        viewportHeight: number
        minTouchTarget?: number
        fixedWidthThreshold?: number
      },
): AnalysisResult {
  const viewport = toViewport(options)
  const signal = 'signal' in options ? options.signal : undefined

  if (!doc.body) {
    return {
      issues: [],
      analyzedAt: new Date().toISOString(),
      accessible: false,
      errorMessage: 'Document body is not available for analysis.',
    }
  }

  const result = layoutRuleEngine.analyze({
    document: doc,
    viewport,
    sourceFingerprint: 'legacy-analyzeDocument',
    capabilities: capabilitiesFromPreview({ loaded: true, blocked: false, accessible: true }),
    signal,
  })

  return {
    issues: result.issues,
    analyzedAt: result.analyzedAt,
    accessible: true,
    ruleErrors: result.executions
      .filter((e) => e.status === 'failed')
      .map((e) => ({
        category: 'rule-execution-failed' as const,
        message: `Rule "${e.ruleId}" failed and was skipped.`,
        diagnostic: e.diagnostic,
        timestamp: new Date().toISOString(),
      })),
    truncated: result.truncatedWarnings.length > 0,
    healthScore: {
      score: result.score.finalScore,
      label: result.score.label,
      deductions: result.score.lines.map((l) => ({
        ruleId: l.ruleId,
        selector: l.selector,
        amount: l.cappedCost,
        reason: l.reason,
      })),
      criticalCount: result.score.criticalCount,
      warningCount: result.score.warningCount,
      infoCount: result.score.infoCount,
    },
    errorMessage: result.coverage.warning ?? undefined,
  }
}

export function countBySeverity(issues: LayoutIssue[]): Record<Severity, number> {
  return {
    critical: issues.filter((i) => i.severity === 'critical' && i.lifecycle !== 'ignored').length,
    warning: issues.filter((i) => i.severity === 'warning' && i.lifecycle !== 'ignored').length,
    info: issues.filter((i) => i.severity === 'info' && i.lifecycle !== 'ignored').length,
  }
}
