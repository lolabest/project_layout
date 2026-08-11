import type {
  DetectedIssue,
  ElementMeasurements,
  IssueType,
  MultiViewportSummary,
  Severity,
} from '../models/types'
import { ISSUE_TYPE_LABELS } from '../models/types'
import { ElementInspector } from './ElementInspector'
import { MultiViewportResults } from './MultiViewportResults'
import styles from './RightSidebar.module.css'

type Tab = 'issues' | 'element' | 'results'

interface RightSidebarProps {
  tab: Tab
  onTabChange: (tab: Tab) => void
  issues: DetectedIssue[]
  selectedIssueId: string | null
  onSelectIssue: (issue: DetectedIssue) => void
  severityFilter: Severity | 'all'
  typeFilter: IssueType | 'all'
  onSeverityFilter: (value: Severity | 'all') => void
  onTypeFilter: (value: IssueType | 'all') => void
  measurements: ElementMeasurements | null
  onApplyStyles: (styles: Record<string, string>) => void
  onResetStyles: () => void
  multiSummary: MultiViewportSummary | null
  viewportFilter: string | 'all'
  onViewportFilter: (value: string | 'all') => void
  analyzing: boolean
}

export function RightSidebar(props: RightSidebarProps) {
  const filtered = props.issues.filter((issue) => {
    if (props.severityFilter !== 'all' && issue.severity !== props.severityFilter) return false
    if (props.typeFilter !== 'all' && issue.type !== props.typeFilter) return false
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
          Issues ({props.issues.length})
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
            </div>

            {props.analyzing && (
              <div className={styles.status}>
                <span className={styles.pulse} /> Analyzing layout…
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
                      <span className={styles.type}>{ISSUE_TYPE_LABELS[issue.type]}</span>
                    </div>
                    <code className={styles.selector}>{issue.selector}</code>
                    <p>{issue.explanation}</p>
                    <p className={styles.fix}>
                      <strong>Fix:</strong> {issue.recommendation}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {props.tab === 'element' && (
          <ElementInspector
            measurements={props.measurements}
            onApplyStyles={props.onApplyStyles}
            onResetStyles={props.onResetStyles}
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
