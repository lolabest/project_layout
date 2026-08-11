import type {
  DetectedIssue,
  MultiViewportSummary,
  SourceMode,
  TestReport,
  TestSession,
  ViewportSize,
} from '../models/types'
import { createId } from './domUtils'

const SESSIONS_KEY = 'layout-tester.sessions'
const MAX_SESSIONS = 20

export function createReport(input: {
  sourceName: string
  sourceMode: SourceMode
  sourceUrl?: string
  viewport: ViewportSize
  issues: DetectedIssue[]
  screenshots?: string[]
}): TestReport {
  const recommendations = Array.from(
    new Set(input.issues.map((issue) => issue.recommendation)),
  )

  return {
    id: createId('report'),
    sourceName: input.sourceName,
    sourceMode: input.sourceMode,
    sourceUrl: input.sourceUrl,
    testedAt: new Date().toISOString(),
    viewport: input.viewport,
    screenshots: input.screenshots ?? [],
    issues: input.issues,
    recommendations,
  }
}

export function exportReportJson(report: TestReport): string {
  return JSON.stringify(report, null, 2)
}

export function exportReportHtml(report: TestReport): string {
  const issueRows = report.issues
    .map(
      (issue) => `
      <tr>
        <td>${escapeHtml(issue.type)}</td>
        <td class="sev-${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</td>
        <td><code>${escapeHtml(issue.selector)}</code></td>
        <td>${escapeHtml(issue.explanation)}</td>
        <td>${escapeHtml(issue.recommendation)}</td>
      </tr>`,
    )
    .join('')

  const screenshots = report.screenshots
    .map(
      (src, index) =>
        `<figure><img src="${src}" alt="Screenshot ${index + 1}" /><figcaption>Screenshot ${index + 1}</figcaption></figure>`,
    )
    .join('')

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
    table { width: 100%; border-collapse: collapse; margin: 16px 0 32px; }
    th, td { border: 1px solid #2a3140; padding: 10px; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #1b2130; }
    .sev-critical { color: #ff6b6b; font-weight: 600; }
    .sev-warning { color: #ffb020; font-weight: 600; }
    .sev-info { color: #6cb6ff; font-weight: 600; }
    code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; }
    img { max-width: 100%; border: 1px solid #2a3140; }
    figure { margin: 0 0 16px; }
  </style>
</head>
<body>
  <h1>Layout Test Report</h1>
  <div class="meta">
    <div><strong>Source:</strong> ${escapeHtml(report.sourceName)}</div>
    <div><strong>Mode:</strong> ${escapeHtml(report.sourceMode)}</div>
    ${report.sourceUrl ? `<div><strong>URL:</strong> ${escapeHtml(report.sourceUrl)}</div>` : ''}
    <div><strong>Tested:</strong> ${escapeHtml(new Date(report.testedAt).toLocaleString())}</div>
    <div><strong>Viewport:</strong> ${report.viewport.width} × ${report.viewport.height} (${escapeHtml(report.viewport.name)})</div>
    <div><strong>Issues:</strong> ${report.issues.length}</div>
  </div>
  <h2>Detected Issues</h2>
  <table>
    <thead>
      <tr>
        <th>Type</th>
        <th>Severity</th>
        <th>Selector</th>
        <th>Explanation</th>
        <th>Recommended Fix</th>
      </tr>
    </thead>
    <tbody>
      ${issueRows || '<tr><td colspan="5">No issues detected.</td></tr>'}
    </tbody>
  </table>
  <h2>Recommended Fixes</h2>
  <ul>
    ${report.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('') || '<li>None</li>'}
  </ul>
  <h2>Screenshots</h2>
  ${screenshots || '<p>No screenshots captured.</p>'}
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

export function loadSessions(): TestSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TestSession[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveSession(session: TestSession): TestSession[] {
  const sessions = loadSessions().filter((s) => s.id !== session.id)
  const next = [{ ...session, updatedAt: new Date().toISOString() }, ...sessions].slice(
    0,
    MAX_SESSIONS,
  )
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(next))
  return next
}

export function deleteSession(id: string): TestSession[] {
  const next = loadSessions().filter((s) => s.id !== id)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(next))
  return next
}

export function createSession(partial: Omit<TestSession, 'id' | 'createdAt' | 'updatedAt'>): TestSession {
  const now = new Date().toISOString()
  return {
    ...partial,
    id: createId('session'),
    createdAt: now,
    updatedAt: now,
  }
}

export function summarizeMultiViewport(
  sourceName: string,
  results: MultiViewportSummary['results'],
): MultiViewportSummary {
  return {
    id: createId('multi'),
    createdAt: new Date().toISOString(),
    sourceName,
    results,
    totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
    totalCritical: results.reduce((sum, r) => sum + r.criticalCount, 0),
    totalOverflow: results.reduce((sum, r) => sum + r.overflowCount, 0),
    totalAccessibility: results.reduce((sum, r) => sum + r.accessibilityCount, 0),
  }
}
