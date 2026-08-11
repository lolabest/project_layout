import type {
  GroupedIssue,
  HealthScoreResult,
  LayoutIssue,
  ScoreLabel,
} from '../models/types'

const CRITICAL_COST = 15
const WARNING_COST = 5
const INFO_COST = 1
const MAX_DEDUCTION_PER_KEY = 20

export function scoreLabel(score: number): ScoreLabel {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 50) return 'Needs attention'
  return 'Poor'
}

function severityCost(severity: LayoutIssue['severity']): number {
  if (severity === 'critical') return CRITICAL_COST
  if (severity === 'warning') return WARNING_COST
  return INFO_COST
}

/**
 * Layout Health Score 0–100.
 * Deduplicates by rule+selector so cross-viewport repeats do not stack unfairly.
 * Caps deduction per rule+element.
 * Not a formal accessibility compliance score.
 */
export function calculateHealthScore(issues: LayoutIssue[]): HealthScoreResult {
  const active = issues.filter((i) => i.lifecycle === 'open' || !i.lifecycle)
  const byKey = new Map<string, LayoutIssue>()

  for (const issue of active) {
    const key = `${issue.ruleId}::${issue.selector}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, issue)
      continue
    }
    // Keep highest severity for scoring
    if (severityCost(issue.severity) > severityCost(existing.severity)) {
      byKey.set(key, issue)
    }
  }

  let score = 100
  const deductions: HealthScoreResult['deductions'] = []

  for (const issue of byKey.values()) {
    const amount = Math.min(MAX_DEDUCTION_PER_KEY, severityCost(issue.severity))
    score -= amount
    deductions.push({
      ruleId: issue.ruleId,
      selector: issue.selector,
      amount,
      reason: `${issue.severity} · ${issue.title}`,
    })
  }

  score = Math.max(0, Math.min(100, score))

  return {
    score,
    label: scoreLabel(score),
    deductions,
    criticalCount: active.filter((i) => i.severity === 'critical').length,
    warningCount: active.filter((i) => i.severity === 'warning').length,
    infoCount: active.filter((i) => i.severity === 'info').length,
  }
}

export function calculateHealthScoreFromGrouped(grouped: GroupedIssue[]): HealthScoreResult {
  const asIssues = grouped.map((g) => g.representative)
  return calculateHealthScore(asIssues)
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
