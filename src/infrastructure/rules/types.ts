import type { RuleId } from '../../domain/ids'
import type { IssueCategory, Severity } from '../../domain/scoring/scorePolicy'

export type RuleExecutionStatus = 'completed' | 'skipped' | 'failed'

export interface RuleContext {
  document: Document
  viewport: { id: string; name: string; width: number; height: number }
  sourceFingerprint: string
  capabilities: {
    previewAvailable: boolean
    domInspectionAvailable: boolean
    screenshotAvailable: boolean
  }
  signal?: AbortSignal | undefined
  limits: {
    maxElements: number
    maxOverlapCandidates: number
    maxIssuesPerRule: number
    ruleTimeoutMs: number
  }
}

export interface RuleIssueData {
  severity: Severity
  title: string
  explanation: string
  selector: string
  elementPath: string
  tagName?: string | undefined
  category: IssueCategory
  confidence: number
  actual: Record<string, number | string | boolean | null>
  expected: Record<string, number | string | boolean | null>
  evidenceStyles?: Record<string, string> | undefined
  overflowArea?: number | undefined
  intersectionArea?: number | undefined
  boundingRect?: { top: number; left: number; width: number; height: number } | undefined
  recommendation: string
  measurementSignature: string
}

export interface RuleResult {
  status: RuleExecutionStatus
  issues: RuleIssueData[]
  inspectedElements: number
  durationMs: number
  warnings: string[]
  skipReason?: string | undefined
  diagnostic?: string | undefined
}

export interface AnalysisRule {
  id: RuleId
  name: string
  description: string
  category: IssueCategory
  defaultSeverity: Severity
  version: string
  supports(context: RuleContext): { applicable: boolean; reason?: string | undefined }
  evaluate(context: RuleContext): RuleResult
  getRecommendation(issueData: RuleIssueData): string
}

export const DEFAULT_RULE_LIMITS: RuleContext['limits'] = {
  maxElements: 500,
  maxOverlapCandidates: 120,
  maxIssuesPerRule: 40,
  ruleTimeoutMs: 2000,
}
