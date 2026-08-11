import type { IssueLifecycleState } from '../states/issueStateMachine'

export const SCORING_POLICY_VERSION = '1.0.0'

export type Severity = 'critical' | 'warning' | 'info'
export type ScoreLabel = 'Excellent' | 'Good' | 'Needs attention' | 'Poor'
export type IssueCategory =
  | 'overflow'
  | 'overlap'
  | 'typography'
  | 'media'
  | 'links'
  | 'responsive'
  | 'accessibility'
  | 'structure'

export interface ScoreableIssue {
  ruleId: string
  selector: string
  severity: Severity
  confidence: number
  category: IssueCategory
  lifecycle: IssueLifecycleState | 'open' | 'resolved' | 'ignored' | 'stale' | 'unable-to-verify'
}

export interface ScoreBreakdownLine {
  key: string
  ruleId: string
  selector: string
  severity: Severity
  confidence: number
  baseCost: number
  weightedCost: number
  cappedCost: number
  reason: string
}

export interface ScoreBreakdown {
  policyVersion: string
  startingScore: number
  finalScore: number
  label: ScoreLabel
  lines: ScoreBreakdownLine[]
  categoryScores: Record<IssueCategory, number>
  criticalCount: number
  warningCount: number
  infoCount: number
  disclaimer: string
}

export const SCORE_COSTS: Record<Severity, number> = {
  critical: 15,
  warning: 5,
  info: 1,
}

export const MAX_DEDUCTION_PER_RULE_ELEMENT = 20
export const MAX_DEDUCTION_PER_RULE = 40

export function scoreLabel(score: number): ScoreLabel {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 50) return 'Needs attention'
  return 'Poor'
}

function isActive(lifecycle: ScoreableIssue['lifecycle']): boolean {
  return lifecycle === 'Open' || lifecycle === 'open' || !lifecycle
}

function computeScoreLines(issues: ScoreableIssue[]): {
  finalScore: number
  lines: ScoreBreakdownLine[]
  active: ScoreableIssue[]
} {
  const active = issues.filter((i) => isActive(i.lifecycle))
  const byKey = new Map<string, ScoreableIssue>()

  for (const issue of active) {
    const key = `${issue.ruleId}::${issue.selector}`
    const existing = byKey.get(key)
    if (!existing || SCORE_COSTS[issue.severity] > SCORE_COSTS[existing.severity]) {
      byKey.set(key, issue)
    } else if (
      existing &&
      SCORE_COSTS[issue.severity] === SCORE_COSTS[existing.severity] &&
      issue.confidence > existing.confidence
    ) {
      byKey.set(key, issue)
    }
  }

  const ruleTotals = new Map<string, number>()
  const lines: ScoreBreakdownLine[] = []
  let deduction = 0

  for (const issue of byKey.values()) {
    const base = SCORE_COSTS[issue.severity]
    const confidence = Math.min(1, Math.max(0.3, issue.confidence))
    const weighted = base * confidence
    const ruleSoFar = ruleTotals.get(issue.ruleId) ?? 0
    const room = Math.max(0, MAX_DEDUCTION_PER_RULE - ruleSoFar)
    const capped = Math.min(MAX_DEDUCTION_PER_RULE_ELEMENT, weighted, room)
    ruleTotals.set(issue.ruleId, ruleSoFar + capped)
    deduction += capped
    lines.push({
      key: `${issue.ruleId}::${issue.selector}`,
      ruleId: issue.ruleId,
      selector: issue.selector,
      severity: issue.severity,
      confidence,
      baseCost: base,
      weightedCost: Math.round(weighted * 100) / 100,
      cappedCost: Math.round(capped * 100) / 100,
      reason: `${issue.severity} × confidence ${confidence.toFixed(2)} (capped)`,
    })
  }

  const finalScore = Math.max(0, Math.min(100, Math.round((100 - deduction) * 10) / 10))
  return { finalScore, lines, active }
}

/**
 * Layout Health Score policy v1.0.0
 *
 * Start at 100. Deduplicate by ruleId+selector (cross-viewport safe).
 * Apply confidence weighting, per-rule+element cap, per-rule cap.
 * Ignored/resolved/stale issues excluded.
 * Not an accessibility certification score.
 */
export function calculateScore(issues: ScoreableIssue[]): ScoreBreakdown {
  const { finalScore, lines, active } = computeScoreLines(issues)

  const categories: IssueCategory[] = [
    'overflow',
    'overlap',
    'typography',
    'media',
    'links',
    'responsive',
    'accessibility',
    'structure',
  ]
  const categoryScores = {} as Record<IssueCategory, number>
  for (const category of categories) {
    const subset = active.filter((i) => i.category === category)
    categoryScores[category] =
      subset.length === 0 ? 100 : computeScoreLines(subset).finalScore
  }

  return {
    policyVersion: SCORING_POLICY_VERSION,
    startingScore: 100,
    finalScore,
    label: scoreLabel(finalScore),
    lines,
    categoryScores,
    criticalCount: active.filter((i) => i.severity === 'critical').length,
    warningCount: active.filter((i) => i.severity === 'warning').length,
    infoCount: active.filter((i) => i.severity === 'info').length,
    disclaimer:
      'Layout Health Score is not a formal accessibility compliance or universal website quality certification.',
  }
}
