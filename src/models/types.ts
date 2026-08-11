/** Typed domain models for the layout testing tool. */

export type Severity = 'critical' | 'warning' | 'info'

export type IssueType =
  | 'horizontal-overflow'
  | 'outside-viewport'
  | 'overlapping'
  | 'text-clipping'
  | 'image-overflow'
  | 'missing-alt'
  | 'broken-image'
  | 'broken-link'
  | 'fixed-width'
  | 'small-touch-target'
  | 'inaccessible-control'
  | 'duplicate-id'
  | 'invalid-aria'
  | 'unlabelled-control'
  | 'sticky-obstruction'
  | 'unexpected-scrollbar'
  | 'small-text'
  | 'image-layout-shift'

export type SourceMode = 'url' | 'markup'

export type Orientation = 'portrait' | 'landscape'

export type SourceState =
  | 'empty'
  | 'ready'
  | 'loading'
  | 'loaded'
  | 'invalid'
  | 'blocked'
  | 'failed'
  | 'modified'

export type TestStatus =
  | 'Draft'
  | 'Queued'
  | 'Running'
  | 'Cancelling'
  | 'Cancelled'
  | 'Completed'
  | 'Completed with errors'
  | 'Failed'

export type IssueLifecycle = 'open' | 'resolved' | 'ignored' | 'stale' | 'unable-to-verify'

export type ErrorCategory =
  | 'invalid-source'
  | 'preview-blocked'
  | 'preview-load-failed'
  | 'preview-inspection-unavailable'
  | 'analysis-timeout'
  | 'rule-execution-failed'
  | 'storage-unavailable'
  | 'export-failed'

export type ScoreLabel = 'Excellent' | 'Good' | 'Needs attention' | 'Poor'

export interface ViewportSize {
  id: string
  name: string
  width: number
  height: number
  predefined?: boolean | undefined
}

export interface MeasuredValues {
  [key: string]: number | string | boolean | null | undefined
}

/** Normalized layout issue returned by the rule engine / application layer. */
export interface LayoutIssue {
  id: string
  ruleId: string
  ruleVersion?: string | undefined
  type: IssueType
  category?: string | undefined
  severity: Severity
  title: string
  description: string
  /** Plain-language why this is a problem (may equal description). */
  explanation?: string | undefined
  selector: string
  elementPath: string
  viewport: ViewportSize
  measuredValues: MeasuredValues
  expectedValues: MeasuredValues
  recommendation: string
  confidence: number
  timestamp: string
  firstDetectedAt?: string | undefined
  lastDetectedAt?: string | undefined
  lifecycle: IssueLifecycle
  ignoreReason?: string | undefined
  issueKey: string
  identitySignature?: string | undefined
  sourceFingerprint?: string | undefined
  tagName?: string | undefined
  boundingRect?: {
    top: number
    left: number
    width: number
    height: number
  } | undefined
  evidenceStyles?: Record<string, string> | undefined
  overflowArea?: number | undefined
  intersectionArea?: number | undefined
  affectedViewports?: string[] | undefined
  firstFailingViewport?: string | undefined
  occursEverywhere?: boolean | undefined
  resolutionType?: 'manual' | 'temporary-fix' | 'unsure' | 'wont-fix' | undefined
}

/** @deprecated Prefer LayoutIssue — kept for gradual UI migration aliases. */
export type DetectedIssue = LayoutIssue

export interface ElementMeasurements {
  selector: string
  tagName: string
  width: number
  height: number
  margin: BoxSides
  padding: BoxSides
  border: BoxSides
  position: {
    top: number
    left: number
    right: number
    bottom: number
  }
  display: string
  positionType: string
  zIndex: string
  fontFamily: string
  fontSize: string
  lineHeight: string
  color: string
  backgroundColor: string
  overflow: string
  overflowX: string
  overflowY: string
  accessibleName: string
  computedStyles: Record<string, string>
}

export interface BoxSides {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PreviewSource {
  mode: SourceMode
  url: string
  html: string
  css: string
  name: string
}

export interface InspectionSettings {
  showGrid: boolean
  showRulers: boolean
  showBreakpoints: boolean
  outlineMode: boolean
  spacingMode: boolean
  gridSize: number
}

export interface ReferenceImage {
  dataUrl: string
  width: number
  height: number
  viewportId: string
  opacity: number
  offsetX: number
  offsetY: number
  scaleMode: 'fill' | 'contain' | 'stretch'
}

export interface ComparisonState {
  referencesByViewport: Record<string, ReferenceImage>
  mode: 'side-by-side' | 'overlay' | 'difference'
  similarity: number | null
  renderedScreenshot: string | null
  differenceDataUrl: string | null
}

export interface ViewportTestResult {
  viewport: ViewportSize
  issues: LayoutIssue[]
  screenshotDataUrl: string | null
  criticalCount: number
  overflowCount: number
  accessibilityCount: number
  healthScore: number
  scoreLabel: ScoreLabel
  status: 'success' | 'failed' | 'cancelled'
  errorMessage?: string | undefined
  referenceImage?: ReferenceImage | null | undefined
}

export interface MultiViewportSummary {
  id: string
  createdAt: string
  sourceName: string
  results: ViewportTestResult[]
  totalIssues: number
  totalCritical: number
  totalOverflow: number
  totalAccessibility: number
  overallHealthScore: number
  scoreLabel: ScoreLabel
  groupedIssues: GroupedIssue[]
}

export interface GroupedIssue {
  issueKey: string
  ruleId: string
  type: IssueType
  severity: Severity
  title: string
  selector: string
  description: string
  recommendation: string
  affectedViewports: string[]
  firstFailingViewport: string
  occursEverywhere: boolean
  representative: LayoutIssue
}

export interface TemporaryStyleChange {
  id: string
  selector: string
  property: string
  originalValue: string
  modifiedValue: string
  appliedAt: string
  sessionId?: string | undefined
  viewportId?: string | undefined
  affectedIssueIds?: string[] | undefined
  introducedIssueIds?: string[] | undefined
  scoreBefore?: number | undefined
  scoreAfter?: number | undefined
}

export interface IssueDelta {
  resolved: LayoutIssue[]
  introduced: LayoutIssue[]
  unchanged: LayoutIssue[]
}

export interface HealthScoreResult {
  score: number
  label: ScoreLabel
  deductions: Array<{ ruleId: string; selector: string; amount: number; reason: string }>
  criticalCount: number
  warningCount: number
  infoCount: number
}

export interface AppError {
  category: ErrorCategory
  message: string
  diagnostic?: string | undefined
  timestamp: string
}

export interface TestReport {
  schemaVersion: 1
  id: string
  sessionId?: string | undefined
  sourceFingerprint?: string | undefined
  sourceName: string
  sourceMode: SourceMode
  sourceUrl?: string | undefined
  testedAt: string
  viewport: ViewportSize
  viewports?: ViewportSize[] | undefined
  screenshots: string[]
  issues: LayoutIssue[]
  groupedIssues?: GroupedIssue[] | undefined
  recommendations: string[]
  overallHealthScore?: number | undefined
  scoreLabel?: ScoreLabel | undefined
  scoreBreakdown?: {
    policyVersion: string
    startingScore: number
    finalScore: number
    lines: Array<{ key: string; amount: number; reason: string }>
  } | undefined
  coveragePercent?: number | undefined
  coverageWarning?: string | null | undefined
  ignoredIssues?: LayoutIssue[] | undefined
  resolvedIssues?: LayoutIssue[] | undefined
  temporaryFixes?: TemporaryStyleChange[] | undefined
  knownLimitations?: string[] | undefined
  measurements?: ElementMeasurements | null | undefined
  ruleEngineVersion?: string | undefined
  scoringPolicyVersion?: string | undefined
  failedRules?: Array<{ ruleId: string; diagnostic?: string | undefined }> | undefined
  skippedRules?: Array<{ ruleId: string; reason?: string | undefined }> | undefined
  diagnosticSummary?: string[] | undefined
  integrityHash?: string | undefined
  analysisConfiguration?: Record<string, number | string | boolean> | undefined
}

export interface TestSession {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  sourceType: SourceMode
  source: PreviewSource
  selectedViewports: ViewportSize[]
  results: ViewportTestResult[]
  totalIssueCount: number
  issueCountBySeverity: Record<Severity, number>
  status: TestStatus
  healthScore?: number | undefined
  scoreLabel?: ScoreLabel | undefined
  report?: TestReport | undefined
  multiViewportSummary?: MultiViewportSummary | undefined
  ignoredIssueKeys?: Record<string, string> | undefined
  temporaryFixes?: TemporaryStyleChange[] | undefined
  /** Legacy fields retained for older stored sessions */
  viewport?: ViewportSize | undefined
  orientation?: Orientation | undefined
  scale?: number | undefined
  issues?: LayoutIssue[] | undefined
}

export interface AnalysisResult {
  issues: LayoutIssue[]
  analyzedAt: string
  accessible: boolean
  errorMessage?: string | undefined
  ruleErrors?: AppError[] | undefined
  truncated?: boolean | undefined
  healthScore?: HealthScoreResult | undefined
}

export interface AnalyzerOptions {
  viewport: ViewportSize
  minTouchTarget?: number | undefined
  fixedWidthThreshold?: number | undefined
  maxElements?: number | undefined
  enabledRules?: string[] | undefined
  signal?: AbortSignal | undefined
}

export const PREDEFINED_VIEWPORTS: ViewportSize[] = [
  { id: 'mobile', name: 'Mobile', width: 375, height: 812, predefined: true },
  { id: 'tablet', name: 'Tablet', width: 768, height: 1024, predefined: true },
  { id: 'laptop', name: 'Laptop', width: 1440, height: 900, predefined: true },
  { id: 'desktop', name: 'Desktop', width: 1920, height: 1080, predefined: true },
]

export const MOBILE_VIEWPORT: ViewportSize = PREDEFINED_VIEWPORTS[0]!
export const TABLET_VIEWPORT: ViewportSize = PREDEFINED_VIEWPORTS[1]!
export const LAPTOP_VIEWPORT: ViewportSize = PREDEFINED_VIEWPORTS[2]!
export const DESKTOP_VIEWPORT: ViewportSize = PREDEFINED_VIEWPORTS[3]!

export const VIEWPORT_LIMITS = {
  minWidth: 240,
  maxWidth: 3840,
  minHeight: 320,
  maxHeight: 2160,
} as const

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  'horizontal-overflow': 'Horizontal Overflow',
  'outside-viewport': 'Outside Viewport',
  overlapping: 'Overlapping Elements',
  'text-clipping': 'Text Clipping',
  'image-overflow': 'Image Exceeds Container',
  'missing-alt': 'Missing Alt Attribute',
  'broken-image': 'Broken Image',
  'broken-link': 'Broken Link',
  'fixed-width': 'Fixed Width',
  'small-touch-target': 'Small Touch Target',
  'inaccessible-control': 'Inaccessible Interactive Control',
  'duplicate-id': 'Duplicate DOM ID',
  'invalid-aria': 'Invalid ARIA Reference',
  'unlabelled-control': 'Unlabelled Form Control',
  'sticky-obstruction': 'Hidden Behind Sticky/Fixed',
  'unexpected-scrollbar': 'Unexpected Scrollbar',
  'small-text': 'Unreadable Small Text',
  'image-layout-shift': 'Image Layout Shift Risk',
}

export const ACCESSIBILITY_ISSUE_TYPES: IssueType[] = [
  'missing-alt',
  'broken-image',
  'broken-link',
  'small-touch-target',
  'inaccessible-control',
  'duplicate-id',
  'invalid-aria',
  'unlabelled-control',
]

export const OVERFLOW_ISSUE_TYPES: IssueType[] = [
  'horizontal-overflow',
  'outside-viewport',
  'image-overflow',
]

export const KNOWN_ANALYSIS_LIMITATIONS = [
  'External websites may block iframe embedding (X-Frame-Options / CSP frame-ancestors).',
  'Cross-origin documents cannot be inspected or screenshotted due to browser security.',
  'Broken external link destinations are not validated with network requests.',
  'Layout Health Score is not a formal accessibility compliance score.',
  'Overlap detection uses spatial sampling and may skip dense pages beyond the element cap.',
]
