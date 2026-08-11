import type {
  IssueType,
  LayoutIssue,
  MultiViewportSummary,
  Severity,
} from '../models/types'
import { ISSUE_TYPE_LABELS } from '../models/types'
import styles from './MultiViewportResults.module.css'

interface MultiViewportResultsProps {
  summary: MultiViewportSummary | null
  viewportFilter: string | 'all'
  onViewportFilter: (value: string | 'all') => void
  severityFilter: Severity | 'all'
  typeFilter: IssueType | 'all'
  onSeverityFilter: (value: Severity | 'all') => void
  onTypeFilter: (value: IssueType | 'all') => void
  onSelectIssue: (issue: LayoutIssue) => void
}

export function MultiViewportResults(props: MultiViewportResultsProps) {
  if (!props.summary) {
    return (
      <div className={styles.empty}>
        Run <strong>Run All Viewports</strong> to test Mobile, Tablet, Laptop, and Desktop and see a
        summary with screenshots and a Layout Health Score.
      </div>
    )
  }

  const results =
    props.viewportFilter === 'all'
      ? props.summary.results
      : props.summary.results.filter((r) => r.viewport.id === props.viewportFilter)

  const grouped =
    props.viewportFilter === 'all'
      ? props.summary.groupedIssues
      : props.summary.groupedIssues.filter((g) =>
          g.affectedViewports.includes(props.viewportFilter),
        )

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <div>
          <span>Health score</span>
          <strong className={styles.score}>
            {props.summary.overallHealthScore} · {props.summary.scoreLabel}
          </strong>
        </div>
        <div>
          <span>Grouped issues</span>
          <strong>{props.summary.totalIssues}</strong>
        </div>
        <div>
          <span>Critical</span>
          <strong className={styles.critical}>{props.summary.totalCritical}</strong>
        </div>
        <div>
          <span>Overflow / A11y</span>
          <strong>
            {props.summary.totalOverflow} / {props.summary.totalAccessibility}
          </strong>
        </div>
      </div>

      <div className={styles.filters}>
        <label>
          Viewport
          <select
            value={props.viewportFilter}
            onChange={(e) => props.onViewportFilter(e.target.value)}
          >
            <option value="all">All</option>
            {props.summary.results.map((r) => (
              <option key={r.viewport.id} value={r.viewport.id}>
                {r.viewport.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Severity
          <select
            value={props.severityFilter}
            onChange={(e) => props.onSeverityFilter(e.target.value as Severity | 'all')}
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </label>
        <label>
          Type
          <select
            value={props.typeFilter}
            onChange={(e) => props.onTypeFilter(e.target.value as IssueType | 'all')}
          >
            <option value="all">All</option>
            {Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className={styles.card}>
        <header>
          <h3>Grouped recurring issues</h3>
        </header>
        <ul className={styles.issues}>
          {grouped.length === 0 && <li className={styles.emptyItem}>No grouped issues.</li>}
          {grouped
            .filter((g) => {
              if (props.severityFilter !== 'all' && g.severity !== props.severityFilter) return false
              if (props.typeFilter !== 'all' && g.type !== props.typeFilter) return false
              return true
            })
            .map((g) => (
              <li key={g.issueKey}>
                <button type="button" onClick={() => props.onSelectIssue(g.representative)}>
                  <span className={`${styles.sev} ${styles[g.severity]}`}>{g.severity}</span>
                  {g.title} — <code>{g.selector}</code>
                  <div className={styles.groupMeta}>
                    Viewports: {g.affectedViewports.join(', ')}
                    {g.occursEverywhere ? ' · all viewports' : ` · first fail: ${g.firstFailingViewport}`}
                  </div>
                </button>
              </li>
            ))}
        </ul>
      </section>

      {results.map((result) => {
        const issues = result.issues.filter((issue) => {
          if (props.severityFilter !== 'all' && issue.severity !== props.severityFilter) return false
          if (props.typeFilter !== 'all' && issue.type !== props.typeFilter) return false
          return true
        })

        return (
          <section key={result.viewport.id} className={styles.card}>
            <header>
              <h3>
                {result.viewport.name}{' '}
                <span>
                  {result.viewport.width}×{result.viewport.height}
                </span>
              </h3>
              <div className={styles.counts}>
                <span>
                  Score {result.healthScore} ({result.scoreLabel})
                </span>
                <span>{result.issues.length} issues</span>
                <span>{result.criticalCount} critical</span>
                <span>{result.status}</span>
              </div>
            </header>

            {result.screenshotDataUrl ? (
              <img
                src={result.screenshotDataUrl}
                alt={`Screenshot ${result.viewport.name}`}
                className={styles.shot}
              />
            ) : (
              <div className={styles.noShot}>
                {result.errorMessage ?? 'Screenshot unavailable for this viewport.'}
              </div>
            )}

            <ul className={styles.issues}>
              {issues.length === 0 && <li className={styles.emptyItem}>No matching issues.</li>}
              {issues.map((issue) => (
                <li key={issue.id}>
                  <button type="button" onClick={() => props.onSelectIssue(issue)}>
                    <span className={`${styles.sev} ${styles[issue.severity]}`}>{issue.severity}</span>
                    {issue.title} — <code>{issue.selector}</code>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
