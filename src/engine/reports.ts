import { hashString } from '../domain/fingerprint'
import { SCORING_POLICY_VERSION } from '../domain/scoring/scorePolicy'
import { RULE_ENGINE_VERSION } from '../infrastructure/rules/LayoutRuleEngine'
import type {
  LayoutIssue,
  MultiViewportSummary,
  SourceMode,
  TestReport,
  TestSession,
  TestStatus,
  ViewportSize,
  ViewportTestResult,
} from '../models/types'
import { ACCESSIBILITY_ISSUE_TYPES, KNOWN_ANALYSIS_LIMITATIONS, OVERFLOW_ISSUE_TYPES } from '../models/types'
import { createId } from './domUtils'
import { countActiveIssues, groupIssuesAcrossViewports } from './issueLifecycle'
import { calculateHealthScore, calculateHealthScoreFromGrouped } from './scoring'

export function createReportIntegrityHash(report: Omit<TestReport, 'integrityHash'>): string {
  const payload = [
    report.schemaVersion,
    report.sessionId ?? '',
    report.sourceFingerprint ?? '',
    report.ruleEngineVersion ?? '',
    report.scoringPolicyVersion ?? '',
    String(report.overallHealthScore ?? ''),
    String(report.coveragePercent ?? ''),
    report.issues.map((i) => i.id).sort().join(','),
    report.ignoredIssues?.map((i) => i.id).sort().join(',') ?? '',
  ].join('|')
  return hashString(payload)
}

export function createReport(input: {
  sourceName: string
  sourceMode: SourceMode
  sourceUrl?: string | undefined
  viewport: ViewportSize
  viewports?: ViewportSize[] | undefined
  issues: LayoutIssue[]
  screenshots?: string[] | undefined
  temporaryFixes?: TestReport['temporaryFixes']
  measurements?: TestReport['measurements']
  sessionId?: string | undefined
  sourceFingerprint?: string | undefined
  coveragePercent?: number | undefined
  coverageWarning?: string | null | undefined
  failedRules?: TestReport['failedRules']
  skippedRules?: TestReport['skippedRules']
  diagnosticSummary?: string[] | undefined
  analysisConfiguration?: TestReport['analysisConfiguration']
}): TestReport {
  const active = input.issues.filter((i) => i.lifecycle !== 'ignored' && i.lifecycle !== 'resolved')
  const ignored = input.issues.filter((i) => i.lifecycle === 'ignored')
  const resolved = input.issues.filter((i) => i.lifecycle === 'resolved')
  const recommendations = Array.from(new Set(active.map((issue) => issue.recommendation)))
  const viewports = input.viewports ?? [input.viewport]
  const grouped = groupIssuesAcrossViewports(active, viewports)
  const health = calculateHealthScoreFromGrouped(grouped)
  const healthDetail = calculateHealthScore(active)

  const draft: Omit<TestReport, 'integrityHash'> = {
    schemaVersion: 1,
    id: createId('report'),
    sessionId: input.sessionId,
    sourceFingerprint: input.sourceFingerprint ?? active[0]?.sourceFingerprint,
    sourceName: input.sourceName,
    sourceMode: input.sourceMode,
    sourceUrl: input.sourceUrl,
    testedAt: new Date().toISOString(),
    viewport: input.viewport,
    viewports,
    screenshots: input.screenshots ?? [],
    issues: active,
    groupedIssues: grouped,
    recommendations,
    overallHealthScore: health.score,
    scoreLabel: health.label,
    scoreBreakdown: {
      policyVersion: SCORING_POLICY_VERSION,
      startingScore: 100,
      finalScore: healthDetail.score,
      lines: healthDetail.deductions.map((d) => ({
        key: `${d.ruleId}::${d.selector}`,
        amount: d.amount,
        reason: d.reason,
      })),
    },
    coveragePercent: input.coveragePercent,
    coverageWarning: input.coverageWarning,
    ignoredIssues: ignored,
    resolvedIssues: resolved,
    temporaryFixes: input.temporaryFixes ?? [],
    knownLimitations: KNOWN_ANALYSIS_LIMITATIONS,
    measurements: input.measurements ?? null,
    ruleEngineVersion: RULE_ENGINE_VERSION,
    scoringPolicyVersion: SCORING_POLICY_VERSION,
    failedRules: input.failedRules ?? [],
    skippedRules: input.skippedRules ?? [],
    diagnosticSummary: input.diagnosticSummary ?? [],
    analysisConfiguration: input.analysisConfiguration,
  }

  return {
    ...draft,
    integrityHash: createReportIntegrityHash(draft),
  }
}

export function exportReportJson(report: TestReport): string {
  return JSON.stringify(
    {
      ...report,
      exportFormatVersion: 1,
    },
    null,
    2,
  )
}

export function exportReportHtml(report: TestReport): string {
  const issueRows = (report.groupedIssues ?? report.issues.map((i) => ({
    type: i.type,
    severity: i.severity,
    selector: i.selector,
    description: i.description,
    recommendation: i.recommendation,
    affectedViewports: i.affectedViewports ?? [i.viewport.name],
  })))
    .map(
      (issue) => `
      <tr>
        <td>${escapeHtml(String(issue.type))}</td>
        <td class="sev-${escapeHtml(String(issue.severity))}">${escapeHtml(String(issue.severity))}</td>
        <td><code>${escapeHtml(issue.selector)}</code></td>
        <td>${escapeHtml('description' in issue ? issue.description : '')}</td>
        <td>${escapeHtml(issue.recommendation)}</td>
        <td>${escapeHtml(('affectedViewports' in issue ? issue.affectedViewports : []).join(', '))}</td>
      </tr>`,
    )
    .join('')

  const screenshots = report.screenshots
    .map(
      (src, index) =>
        `<figure><img src="${src}" alt="Screenshot ${index + 1}" /><figcaption>Screenshot ${index + 1}</figcaption></figure>`,
    )
    .join('')

  const coverageLine =
    report.coveragePercent != null
      ? `<div><strong>Analysis coverage:</strong> ${report.coveragePercent}%${
          report.coverageWarning ? ` — ${escapeHtml(report.coverageWarning)}` : ''
        }</div>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Layout Test Report — ${escapeHtml(report.sourceName)}</title>
  <style>
    :root { color-scheme: dark; font-family: "IBM Plex Sans", Segoe UI, sans-serif; }
    body { margin: 0; background: #12141a; color: #e8eaed; padding: 32px; }
    h1, h2 { font-family: "IBM Plex Sans", sans-serif; }
    .meta { display: grid; gap: 8px; margin-bottom: 24px; color: #a8b0bd; }
    .score { font-size: 28px; color: #3dd68c; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 32px; }
    th, td { border: 1px solid #2a3140; padding: 10px; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #1b2130; }
    .sev-critical { color: #ff6b6b; font-weight: 600; }
    .sev-warning { color: #ffb020; font-weight: 600; }
    .sev-info { color: #6cb6ff; font-weight: 600; }
    code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; }
    img { max-width: 100%; border: 1px solid #2a3140; }
    figure { margin: 0 0 16px; }
    .limitations { color: #9aa3b2; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Layout Test Report</h1>
  <div class="meta">
    <div><strong>Source:</strong> ${escapeHtml(report.sourceName)}</div>
    <div><strong>Mode:</strong> ${escapeHtml(report.sourceMode)}</div>
    ${report.sourceUrl ? `<div><strong>URL:</strong> ${escapeHtml(report.sourceUrl)}</div>` : ''}
    ${report.sessionId ? `<div><strong>Session:</strong> ${escapeHtml(report.sessionId)}</div>` : ''}
    ${report.sourceFingerprint ? `<div><strong>Fingerprint:</strong> <code>${escapeHtml(report.sourceFingerprint)}</code></div>` : ''}
    <div><strong>Tested:</strong> ${escapeHtml(new Date(report.testedAt).toLocaleString())}</div>
    <div><strong>Viewport:</strong> ${report.viewport.width} × ${report.viewport.height} (${escapeHtml(report.viewport.name)})</div>
    <div><strong>Issues (active):</strong> ${report.issues.length}</div>
    <div><strong>Ignored:</strong> ${report.ignoredIssues?.length ?? 0}</div>
    <div><strong>Resolved:</strong> ${report.resolvedIssues?.length ?? 0}</div>
    ${coverageLine}
    <div class="score">Health score: ${report.overallHealthScore ?? '—'} (${escapeHtml(report.scoreLabel ?? 'n/a')}) — not a formal a11y compliance score</div>
    <div><strong>Rule engine:</strong> ${escapeHtml(report.ruleEngineVersion ?? 'n/a')} · <strong>Scoring policy:</strong> ${escapeHtml(report.scoringPolicyVersion ?? 'n/a')}</div>
    ${report.integrityHash ? `<div><strong>Integrity:</strong> <code>${escapeHtml(report.integrityHash)}</code></div>` : ''}
  </div>
  <h2>Grouped Issues</h2>
  <table>
    <thead>
      <tr>
        <th>Type</th>
        <th>Severity</th>
        <th>Selector</th>
        <th>Explanation</th>
        <th>Recommended Fix</th>
        <th>Viewports</th>
      </tr>
    </thead>
    <tbody>
      ${issueRows || '<tr><td colspan="6">No issues detected.</td></tr>'}
    </tbody>
  </table>
  <h2>Recommended Fixes</h2>
  <ul>
    ${report.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('') || '<li>None</li>'}
  </ul>
  <h2>Temporary CSS Fixes</h2>
  <ul>
    ${(report.temporaryFixes ?? [])
      .map(
        (f) =>
          `<li><code>${escapeHtml(f.selector)}</code> · ${escapeHtml(f.property)}: ${escapeHtml(f.modifiedValue)}</li>`,
      )
      .join('') || '<li>None</li>'}
  </ul>
  <h2>Screenshots</h2>
  ${screenshots || '<p>No screenshots captured.</p>'}
  <h2>Known Analysis Limitations</h2>
  <ul class="limitations">
    ${(report.knownLimitations ?? KNOWN_ANALYSIS_LIMITATIONS).map((l) => `<li>${escapeHtml(l)}</li>`).join('')}
  </ul>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function createSession(partial: {
  name: string
  source: TestSession['source']
  selectedViewports: ViewportSize[]
  status?: TestStatus | undefined
  results?: ViewportTestResult[] | undefined
  ignoredIssueKeys?: Record<string, string> | undefined
  temporaryFixes?: TestSession['temporaryFixes']
  report?: TestReport | undefined
  multiViewportSummary?: MultiViewportSummary | undefined
  viewport?: ViewportSize | undefined
  orientation?: TestSession['orientation']
  scale?: number | undefined
  issues?: LayoutIssue[] | undefined
}): TestSession {
  const now = new Date().toISOString()
  const results = partial.results ?? []
  const issues = partial.issues ?? results.flatMap((r) => r.issues)
  const bySeverity = {
    critical: issues.filter((i) => i.severity === 'critical' && i.lifecycle !== 'ignored').length,
    warning: issues.filter((i) => i.severity === 'warning' && i.lifecycle !== 'ignored').length,
    info: issues.filter((i) => i.severity === 'info' && i.lifecycle !== 'ignored').length,
  }
  const health = calculateHealthScore(issues)

  return {
    id: createId('session'),
    name: partial.name,
    createdAt: now,
    updatedAt: now,
    sourceType: partial.source.mode,
    source: partial.source,
    selectedViewports: partial.selectedViewports,
    results,
    totalIssueCount: countActiveIssues(issues),
    issueCountBySeverity: bySeverity,
    status: partial.status ?? 'Draft',
    healthScore: health.score,
    scoreLabel: health.label,
    report: partial.report,
    multiViewportSummary: partial.multiViewportSummary,
    ignoredIssueKeys: partial.ignoredIssueKeys,
    temporaryFixes: partial.temporaryFixes,
    viewport: partial.viewport ?? partial.selectedViewports[0],
    orientation: partial.orientation,
    scale: partial.scale,
    issues,
  }
}

export function summarizeMultiViewport(
  sourceName: string,
  results: ViewportTestResult[],
): MultiViewportSummary {
  const issues = results.flatMap((r) => r.issues)
  const viewports = results.map((r) => r.viewport)
  const grouped = groupIssuesAcrossViewports(
    issues.filter((i) => i.lifecycle !== 'ignored'),
    viewports,
  )
  const health = calculateHealthScoreFromGrouped(grouped)
  const a11y = new Set<string>(ACCESSIBILITY_ISSUE_TYPES)
  const overflow = new Set<string>(OVERFLOW_ISSUE_TYPES)

  return {
    id: createId('multi'),
    createdAt: new Date().toISOString(),
    sourceName,
    results,
    totalIssues: grouped.length,
    totalCritical: grouped.filter((g) => g.severity === 'critical').length,
    totalOverflow: grouped.filter((g) => overflow.has(g.type)).length,
    totalAccessibility: grouped.filter((g) => a11y.has(g.type)).length,
    overallHealthScore: health.score,
    scoreLabel: health.label,
    groupedIssues: grouped,
  }
}

export function buildViewportResult(
  viewport: ViewportSize,
  issues: LayoutIssue[],
  screenshotDataUrl: string | null,
  status: ViewportTestResult['status'] = 'success',
  errorMessage?: string | undefined,
): ViewportTestResult {
  const active = issues.filter((i) => i.lifecycle !== 'ignored')
  const health = calculateHealthScore(active)
  const a11y = new Set<string>(ACCESSIBILITY_ISSUE_TYPES)
  const overflow = new Set<string>(OVERFLOW_ISSUE_TYPES)
  const result: ViewportTestResult = {
    viewport,
    issues,
    screenshotDataUrl,
    criticalCount: active.filter((i) => i.severity === 'critical').length,
    overflowCount: active.filter((i) => overflow.has(i.type)).length,
    accessibilityCount: active.filter((i) => a11y.has(i.type)).length,
    healthScore: health.score,
    scoreLabel: health.label,
    status,
  }
  if (errorMessage !== undefined) result.errorMessage = errorMessage
  return result
}

export function finalizeSessionStatus(results: ViewportTestResult[]): TestStatus {
  if (results.length === 0) return 'Failed'
  const successes = results.filter((r) => r.status === 'success').length
  if (successes === results.length) return 'Completed'
  if (successes > 0) return 'Completed with errors'
  return 'Failed'
}

/** @deprecated Prefer sessionRepository via AnalysisApplicationService — kept for tests. */
export function loadSessions(): TestSession[] {
  try {
    const raw = localStorage.getItem('layout-tester.sessions.v2')
    if (raw) {
      const parsed = JSON.parse(raw) as Array<{ schemaVersion: number; session: TestSession }>
      if (Array.isArray(parsed)) {
        return parsed.map((e) => e.session).filter(Boolean)
      }
    }
    const legacy = JSON.parse(localStorage.getItem('layout-tester.sessions') ?? '[]') as TestSession[]
    return Array.isArray(legacy) ? legacy : []
  } catch {
    return []
  }
}

/** @deprecated Prefer AnalysisApplicationService.saveSession */
export function saveSession(session: TestSession): TestSession[] {
  const sessions = loadSessions().filter((s) => s.id !== session.id)
  const next = [{ ...session, updatedAt: new Date().toISOString() }, ...sessions].slice(0, 20)
  try {
    localStorage.setItem(
      'layout-tester.sessions.v2',
      JSON.stringify(next.map((s) => ({ schemaVersion: 2, session: s }))),
    )
  } catch {
    return loadSessions()
  }
  return next
}
