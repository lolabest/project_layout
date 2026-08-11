/**
 * Explicit domain entities for the layout analysis system.
 * Persistence boundaries use ISO date strings; domain services may use Date.
 */
import type {
  ElementId,
  IssueId,
  RuleId,
  SessionId,
  SourceFingerprint,
  TransactionId,
  ViewportId,
} from '../ids'
import type { IssueCategory, ScoreBreakdown, Severity } from '../scoring/scorePolicy'
import type { CoverageResult } from '../coverage'
import type { AnalysisCapabilities } from '../capabilities'
import type { IssueLifecycleState } from '../states/issueStateMachine'
import type { SessionLifecycleState } from '../states/sessionStateMachine'
import type { SourceLifecycleState } from '../states/sourceStateMachine'
import type { ViewportRunState } from '../states/viewportRunStateMachine'

export interface SourceDocument {
  mode: 'url' | 'markup'
  url: string
  html: string
  css: string
  name: string
  fingerprint: SourceFingerprint
  state: SourceLifecycleState
  metadata?: string
}

export interface Viewport {
  id: ViewportId
  name: string
  width: number
  height: number
  predefined: boolean
}

export interface AnalysisRuleDefinition {
  id: RuleId
  name: string
  description: string
  category: IssueCategory
  defaultSeverity: Severity
  version: string
  enabled: boolean
}

export interface ElementReference {
  elementId: ElementId
  selector: string
  domPath: string
  tagName: string
}

export interface ElementMeasurement {
  width: number
  height: number
  top: number
  left: number
  right: number
  bottom: number
  computedStyles: Record<string, string>
  capturedAt: string
}

export interface RuleExecution {
  ruleId: RuleId
  ruleVersion: string
  status: 'completed' | 'skipped' | 'failed'
  durationMs: number
  inspectedElements: number
  warnings: string[]
  skipReason?: string
  diagnostic?: string
  issueCount: number
}

export interface IssueResolution {
  type: 'manual' | 'temporary-fix' | 'unsure' | 'wont-fix'
  reason: string
  userComment: string
  resolvedAt: string
  temporaryStyleTransactionId?: TransactionId
}

export interface LayoutIssueEntity {
  id: IssueId
  ruleId: RuleId
  ruleVersion: string
  category: IssueCategory
  severity: Severity
  confidence: number
  title: string
  explanation: string
  element: ElementReference
  viewportId: ViewportId
  actual: Record<string, number | string | boolean | null>
  expected: Record<string, number | string | boolean | null>
  overflowArea?: number
  intersectionArea?: number
  evidenceStyles: Record<string, string>
  recommendation: string
  state: IssueLifecycleState
  firstDetectedAt: string
  lastDetectedAt: string
  affectedViewportIds: ViewportId[]
  sourceFingerprint: SourceFingerprint
  identitySignature: string
  measurementEvidence: Record<string, number | string | boolean | null>
  resolution?: IssueResolution
}

export interface TemporaryStyleChangeEntity {
  id: TransactionId
  sessionId: SessionId
  viewportId: ViewportId
  element: ElementReference
  property: string
  previousValue: string
  newValue: string
  timestamp: string
  affectedIssueIds: IssueId[]
  introducedIssueIds: IssueId[]
  scoreBefore: number
  scoreAfter: number
}

export interface ViewportRun {
  id: string
  viewportId: ViewportId
  state: ViewportRunState
  startedAt?: string
  completedAt?: string
  executions: RuleExecution[]
  issues: LayoutIssueEntity[]
  score?: ScoreBreakdown
  coverage?: CoverageResult
  stabilization?: {
    durationMs: number
    fontStatus: string
    imageStatus: string
    mutationCount: number
    timedOut: boolean
  }
  errorMessage?: string
}

export interface AnalysisSession {
  id: SessionId
  state: SessionLifecycleState
  createdAt: string
  updatedAt: string
  source: SourceDocument
  viewports: Viewport[]
  enabledRuleIds: RuleId[]
  ruleEngineVersion: string
  scoringPolicyVersion: string
  config: {
    maxElements: number
    maxOverlapCandidates: number
    maxIssuesPerRule: number
    ruleTimeoutMs: number
    viewportTimeoutMs: number
    maxSessionDurationMs: number
  }
  runs: ViewportRun[]
  ignoredIdentityKeys: Record<string, string>
  temporaryChanges: TemporaryStyleChangeEntity[]
  capabilities: AnalysisCapabilities
  coverage?: CoverageResult
  score?: ScoreBreakdown
}

export interface ReferenceComparison {
  id: string
  sessionId: SessionId
  viewportId: ViewportId
  referenceFingerprint: string
  similarity: number
  mode: 'side-by-side' | 'overlay' | 'difference'
  createdAt: string
  differenceDataUrl?: string
  limitations: string[]
}

export interface AnalysisReport {
  schemaVersion: 1
  id: string
  sessionId: SessionId
  sourceFingerprint: SourceFingerprint
  createdAt: string
  configuration: AnalysisSession['config']
  ruleEngineVersion: string
  scoringPolicyVersion: string
  testedViewports: Viewport[]
  coverage: CoverageResult
  score: ScoreBreakdown
  openIssues: LayoutIssueEntity[]
  ignoredIssues: LayoutIssueEntity[]
  resolvedIssues: LayoutIssueEntity[]
  failedRules: RuleExecution[]
  skippedRules: RuleExecution[]
  knownLimitations: string[]
  temporaryChanges: TemporaryStyleChangeEntity[]
  diagnosticSummary: string[]
  integrityHash: string
  capabilities: AnalysisCapabilities
}
