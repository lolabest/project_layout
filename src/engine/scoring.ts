/**
 * Presentation-facing scoring helpers.
 * Business deductions live in domain/scoring/scorePolicy — this module adapts that policy
 * to HealthScoreResult / sort helpers used by reports and UI display.
 */
import {
  calculateScore,
  scoreLabel as policyScoreLabel,
  type IssueCategory,
} from '../domain/scoring/scorePolicy'
import type {
  GroupedIssue,
  HealthScoreResult,
  LayoutIssue,
  ScoreLabel,
} from '../models/types'

export function scoreLabel(score: number): ScoreLabel {
  return policyScoreLabel(score)
}

function toScoreable(issue: LayoutIssue) {
  return {
    ruleId: issue.ruleId,
    selector: issue.selector,
    severity: issue.severity,
    confidence: issue.confidence,
    category: (issue.category as IssueCategory | undefined) ?? 'structure',
    lifecycle: issue.lifecycle,
  }
}

/**
 * Layout Health Score 0–100 via scoring policy v1.
 * Deduplicates by rule+selector; confidence weighting + caps applied in domain policy.
 * Not a formal accessibility compliance score.
 */
export function calculateHealthScore(issues: LayoutIssue[]): HealthScoreResult {
  const breakdown = calculateScore(issues.map(toScoreable))
  return {
    score: breakdown.finalScore,
    label: breakdown.label,
    deductions: breakdown.lines.map((line) => ({
      ruleId: line.ruleId,
      selector: line.selector,
      amount: line.cappedCost,
      reason: line.reason,
    })),
    criticalCount: breakdown.criticalCount,
    warningCount: breakdown.warningCount,
    infoCount: breakdown.infoCount,
  }
}

export function calculateHealthScoreFromGrouped(grouped: GroupedIssue[]): HealthScoreResult {
  return calculateHealthScore(grouped.map((g) => g.representative))
}

export function sortIssuesBySeverityThenDom(issues: LayoutIssue[]): LayoutIssue[] {
  const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  return [...issues].sort((a, b) => {
    const sev = (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9)
    if (sev !== 0) return sev
    const aTop = a.boundingRect?.top ?? 0
    const bTop = b.boundingRect?.top ?? 0
    if (aTop !== bTop) return aTop - bTop
    const aLeft = a.boundingRect?.left ?? 0
    const bLeft = b.boundingRect?.left ?? 0
    return aLeft - bLeft
  })
}

export type IssueSortKey = 'severity' | 'dom' | 'viewport' | 'rule' | 'newest'

export function sortIssues(issues: LayoutIssue[], key: IssueSortKey): LayoutIssue[] {
  if (key === 'severity' || key === 'dom') return sortIssuesBySeverityThenDom(issues)
  if (key === 'viewport') {
    return [...issues].sort((a, b) => a.viewport.id.localeCompare(b.viewport.id))
  }
  if (key === 'rule') {
    return [...issues].sort((a, b) => a.ruleId.localeCompare(b.ruleId))
  }
  return [...issues].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
