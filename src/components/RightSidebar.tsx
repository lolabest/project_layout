import type {
  ElementMeasurements,
  IssueDelta,
  IssueLifecycle,
  IssueType,
  LayoutIssue,
  MultiViewportSummary,
  Severity,
} from '../models/types'
import { ISSUE_TYPE_LABELS } from '../models/types'
import type { IssueSortKey } from '../engine/scoring'
import { ElementInspector } from './ElementInspector'
import { MultiViewportResults } from './MultiViewportResults'
import styles from './RightSidebar.module.css'

type Tab = 'issues' | 'element' | 'results'

interface RightSidebarProps {
  tab: Tab
  onTabChange: (tab: Tab) => void
  issues: LayoutIssue[]
  selectedIssueId: string | null
  onSelectIssue: (issue: LayoutIssue) => void
  onIgnoreIssue: (issue: LayoutIssue) => void
  onRestoreIssue: (issue: LayoutIssue) => void
  severityFilter: Severity | 'all'
  typeFilter: IssueType | 'all'
  lifecycleFilter: IssueLifecycle | 'all'
  ruleFilter: string | 'all'
  sortKey: IssueSortKey
  onSeverityFilter: (value: Severity | 'all') => void
  onTypeFilter: (value: IssueType | 'all') => void
  onLifecycleFilter: (value: IssueLifecycle | 'all') => void
  onRuleFilter: (value: string | 'all') => void
  onSortKey: (value: IssueSortKey) => void
  measurements: ElementMeasurements | null
  onApplyStyles: (styles: Record<string, string>) => void
  onUndo: () => void
  onRedo: () => void
  onResetElement: () => void
  onResetAll: () => void
  canUndo: boolean
  canRedo: boolean
  issueDelta: IssueDelta | null
  scoreBefore: number | null
  scoreAfter: number | null
  multiSummary: MultiViewportSummary | null
  viewportFilter: string | 'all'
  onViewportFilter: (value: string | 'all') => void
  analyzing: boolean
  progress: string | null
  healthScore: number | null
  scoreLabel: string | null
  activeIssueCount: number
  diagnostics: string[]
}

export function RightSidebar(props: RightSidebarProps) {
  const rules = Array.from(new Set(props.issues.map((i) => i.ruleId))).sort()

  const filtered = props.issues.filter((issue) => {
    if (props.severityFilter !== 'all' && issue.severity !== props.severityFilter) return false
    if (props.typeFilter !== 'all' && issue.type !== props.typeFilter) return false
    if (props.lifecycleFilter !== 'all' && issue.lifecycle !== props.lifecycleFilter) return false
    if (props.ruleFilter !== 'all' && issue.ruleId !== props.ruleFilter) return false
    if (props.viewportFilter !== 'all' && issue.viewport.id !== props.viewportFilter) return false
    return true
  })

  return (
    <aside className={styles.sidebar}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={props.tab === 'issues' ? styles.active : ''}
          onClick={() => props.onTabChange('issues')}
        >
          Issues ({props.activeIssueCount})
        </button>
        <button
          type="button"
          className={props.tab === 'element' ? styles.active : ''}
          onClick={() => props.onTabChange('element')}
        >
          Element
        </button>
        <button
          type="button"
          className={props.tab === 'results' ? styles.active : ''}
          onClick={() => props.onTabChange('results')}
        >
          Results
        </button>
      </div>

      <div className={styles.body}>
        {props.tab === 'issues' && (
          <>
            {props.healthScore !== null && (
              <div className={styles.scoreBox}>
                <strong>{props.healthScore}</strong>
                <span>{props.scoreLabel} · Layout Health Score (not a compliance score)</span>
              </div>
            )}

            <div className={styles.filters}>
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
              <label>
                Status
                <select
                  value={props.lifecycleFilter}
                  onChange={(e) =>
                    props.onLifecycleFilter(e.target.value as IssueLifecycle | 'all')
                  }
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="ignored">Ignored</option>
                  <option value="stale">Stale</option>
                </select>
              </label>
              <label>
                Rule
                <select
                  value={props.ruleFilter}
                  onChange={(e) => props.onRuleFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  {rules.map((rule) => (
                    <option key={rule} value={rule}>
                      {rule}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sort
                <select
                  value={props.sortKey}
                  onChange={(e) => props.onSortKey(e.target.value as IssueSortKey)}
                >
                  <option value="severity">Severity + DOM</option>
                  <option value="dom">DOM order</option>
                  <option value="viewport">Viewport</option>
                  <option value="rule">Rule</option>
                  <option value="newest">Newest</option>
                </select>
              </label>
            </div>

            {props.analyzing && (
              <div className={styles.status}>
                <span className={styles.pulse} /> {props.progress ?? 'Analyzing layout…'}
              </div>
            )}

            {!props.analyzing && filtered.length === 0 && (
              <div className={styles.empty}>
                {props.issues.length === 0
                  ? 'No issues yet. Load a preview and run Analyze Layout.'
                  : 'No issues match the current filters.'}
              </div>
            )}

            <ul className={styles.issueList}>
              {filtered.map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    className={`${styles.issue} ${props.selectedIssueId === issue.id ? styles.selected : ''}`}
                    onClick={() => props.onSelectIssue(issue)}
                  >
                    <div className={styles.issueTop}>
                      <span className={`${styles.sev} ${styles[issue.severity]}`}>
                        {issue.severity}
                      </span>
                      <span className={styles.type}>{issue.title}</span>
                      <span className={styles.life}>{issue.lifecycle}</span>
                    </div>
                    <code className={styles.selector}>{issue.selector}</code>
                    <div className={styles.path}>{issue.elementPath}</div>
                    <p>{issue.description}</p>
                    <p className={styles.fix}>
                      <strong>Fix:</strong> {issue.recommendation}
                    </p>
                    <div className={styles.meta}>
                      {issue.viewport?.name ?? 'viewport'} · confidence{' '}
                      {Math.round((issue.confidence ?? 0) * 100)}%
                      {issue.affectedViewports && issue.affectedViewports.length > 1
                        ? ` · ${issue.affectedViewports.length} viewports`
                        : ''}
                    </div>
                  </button>
                  {issue.lifecycle === 'open' && (
                    <button
                      type="button"
                      className={styles.ignoreBtn}
                      onClick={() => props.onIgnoreIssue(issue)}
                    >
                      Ignore
                    </button>
                  )}
                  {issue.lifecycle === 'ignored' && (
                    <button
                      type="button"
                      className={styles.ignoreBtn}
                      onClick={() => props.onRestoreIssue(issue)}
                    >
                      Restore
                    </button>
                  )}
                  {issue.lifecycle === 'stale' && (
                    <div className={styles.staleNote}>
                      Element no longer found — rerun analysis to refresh.
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {props.diagnostics.length > 0 && (
              <details className={styles.diagnostics}>
                <summary>Diagnostics</summary>
                <ul>
                  {props.diagnostics.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        {props.tab === 'element' && (
          <ElementInspector
            measurements={props.measurements}
            onApplyStyles={props.onApplyStyles}
            onUndo={props.onUndo}
            onRedo={props.onRedo}
            onResetElement={props.onResetElement}
            onResetAll={props.onResetAll}
            canUndo={props.canUndo}
            canRedo={props.canRedo}
            issueDelta={props.issueDelta}
            scoreBefore={props.scoreBefore}
            scoreAfter={props.scoreAfter}
          />
        )}

        {props.tab === 'results' && (
          <MultiViewportResults
            summary={props.multiSummary}
            viewportFilter={props.viewportFilter}
            onViewportFilter={props.onViewportFilter}
            severityFilter={props.severityFilter}
            typeFilter={props.typeFilter}
            onSeverityFilter={props.onSeverityFilter}
            onTypeFilter={props.onTypeFilter}
            onSelectIssue={props.onSelectIssue}
          />
        )}
      </div>
    </aside>
  )
}
