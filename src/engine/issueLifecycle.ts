import type {
  GroupedIssue,
  IssueLifecycle,
  LayoutIssue,
  ViewportSize,
} from '../models/types'
import { buildCrossViewportKey } from './selectors'

export function applyIgnoredState(
  issues: LayoutIssue[],
  ignoredKeys: Record<string, string> | undefined,
): LayoutIssue[] {
  if (!ignoredKeys || Object.keys(ignoredKeys).length === 0) return issues
  return issues.map((issue) => {
    const crossKey = buildCrossViewportKey(issue.ruleId, issue.selector)
    if (ignoredKeys[crossKey] !== undefined || ignoredKeys[issue.issueKey] !== undefined) {
      return {
        ...issue,
        lifecycle: 'ignored' as IssueLifecycle,
        ignoreReason: ignoredKeys[crossKey] ?? ignoredKeys[issue.issueKey],
      }
    }
    return issue
  })
}

export function ignoreIssue(
  issues: LayoutIssue[],
  issueId: string,
  reason = '',
): { issues: LayoutIssue[]; ignoredKeys: Record<string, string> } {
  const ignoredKeys: Record<string, string> = {}
  const next = issues.map((issue) => {
    if (issue.id !== issueId) return issue
    const crossKey = buildCrossViewportKey(issue.ruleId, issue.selector)
    ignoredKeys[crossKey] = reason
    return { ...issue, lifecycle: 'ignored' as IssueLifecycle, ignoreReason: reason }
  })
  return { issues: next, ignoredKeys }
}

export function markStaleIfMissing(
  issues: LayoutIssue[],
  doc: Document | null,
): LayoutIssue[] {
  if (!doc) {
    return issues.map((i) =>
      i.lifecycle === 'ignored' ? i : { ...i, lifecycle: 'stale' as IssueLifecycle },
    )
  }
  return issues.map((issue) => {
    if (issue.lifecycle === 'ignored') return issue
    try {
      const el = doc.querySelector(issue.selector)
      if (!el) return { ...issue, lifecycle: 'stale' as IssueLifecycle }
      if (issue.lifecycle === 'stale') return { ...issue, lifecycle: 'open' }
      return issue
    } catch {
      return { ...issue, lifecycle: 'stale' as IssueLifecycle }
    }
  })
}

export function computeIssueDelta(
  before: LayoutIssue[],
  after: LayoutIssue[],
): { resolved: LayoutIssue[]; introduced: LayoutIssue[]; unchanged: LayoutIssue[] } {
  const beforeKeys = new Map(before.map((i) => [buildCrossViewportKey(i.ruleId, i.selector), i]))
  const afterKeys = new Map(after.map((i) => [buildCrossViewportKey(i.ruleId, i.selector), i]))

  const resolved: LayoutIssue[] = []
  const introduced: LayoutIssue[] = []
  const unchanged: LayoutIssue[] = []

  for (const [key, issue] of beforeKeys) {
    if (!afterKeys.has(key)) {
      resolved.push({ ...issue, lifecycle: 'resolved' })
    } else {
      unchanged.push(afterKeys.get(key)!)
    }
  }
  for (const [key, issue] of afterKeys) {
    if (!beforeKeys.has(key)) introduced.push(issue)
  }

  return { resolved, introduced, unchanged }
}

export function dedupeIssues(issues: LayoutIssue[]): LayoutIssue[] {
  const seen = new Set<string>()
  const result: LayoutIssue[] = []
  for (const issue of issues) {
    if (seen.has(issue.issueKey)) continue
    seen.add(issue.issueKey)
    result.push(issue)
  }
  return result
}

export function groupIssuesAcrossViewports(
  issues: LayoutIssue[],
  viewports: ViewportSize[],
): GroupedIssue[] {
  const map = new Map<string, LayoutIssue[]>()
  for (const issue of issues) {
    const key = buildCrossViewportKey(issue.ruleId, issue.selector)
    const list = map.get(key) ?? []
    list.push(issue)
    map.set(key, list)
  }

  const viewportIds = viewports.map((v) => v.id)
  const groups: GroupedIssue[] = []

  for (const [, list] of map) {
    const representative = list[0]
    const affected = Array.from(new Set(list.map((i) => i.viewport.id)))
    const first = viewportIds.find((id) => affected.includes(id)) ?? affected[0]
    groups.push({
      issueKey: buildCrossViewportKey(representative.ruleId, representative.selector),
      ruleId: representative.ruleId,
      type: representative.type,
      severity: representative.severity,
      title: representative.title,
      selector: representative.selector,
      description: representative.description,
      recommendation: representative.recommendation,
      affectedViewports: affected,
      firstFailingViewport: first,
      occursEverywhere: viewportIds.length > 0 && affected.length === viewportIds.length,
      representative: {
        ...representative,
        affectedViewports: affected,
        firstFailingViewport: first,
        occursEverywhere: viewportIds.length > 0 && affected.length === viewportIds.length,
      },
    })
  }

  return groups
}

export function countActiveIssues(issues: LayoutIssue[]): number {
  return issues.filter((i) => i.lifecycle === 'open' || !i.lifecycle).length
}
