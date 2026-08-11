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

export type IssueLifecycle = 'open' | 'resolved' | 'ignored' | 'stale'

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
  predefined?: boolean
}

export interface MeasuredValues {
  [key: string]: number | string | boolean | null | undefined
}

/** Normalized layout issue returned by LayoutAnalyzer. */
export interface LayoutIssue {
  id: string
  ruleId: string
  type: IssueType
  severity: Severity
  title: string
  description: string
  selector: string
  elementPath: string
  viewport: ViewportSize
  measuredValues: MeasuredValues
  expectedValues: MeasuredValues
  recommendation: string
  confidence: number
  timestamp: string
  lifecycle: IssueLifecycle
  ignoreReason?: string
  issueKey: string
  tagName?: string
  boundingRect?: {
    top: number
    left: number
    width: number
    height: number
  }
  affectedViewports?: string[]
  firstFailingViewport?: string
  occursEverywhere?: boolean
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
  errorMessage?: string
  referenceImage?: ReferenceImage | null
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
  diagnostic?: string
  timestamp: string
}

export interface TestReport {
  id: string
  sourceName: string
  sourceMode: SourceMode
  sourceUrl?: string
  testedAt: string
  viewport: ViewportSize
  viewports?: ViewportSize[]
  screenshots: string[]
  issues: LayoutIssue[]
  groupedIssues?: GroupedIssue[]
  recommendations: string[]
  overallHealthScore?: number
  scoreLabel?: ScoreLabel
  ignoredIssues?: LayoutIssue[]
  temporaryFixes?: TemporaryStyleChange[]
  knownLimitations?: string[]
  measurements?: ElementMeasurements | null
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
  healthScore?: number
  scoreLabel?: ScoreLabel
  report?: TestReport
  multiViewportSummary?: MultiViewportSummary
  ignoredIssueKeys?: Record<string, string>
  temporaryFixes?: TemporaryStyleChange[]
  /** Legacy fields retained for older stored sessions */
  viewport?: ViewportSize
  orientation?: Orientation
  scale?: number
  issues?: LayoutIssue[]
}

export interface AnalysisResult {
  issues: LayoutIssue[]
  analyzedAt: string
  accessible: boolean
  errorMessage?: string
  ruleErrors?: AppError[]
  truncated?: boolean
  healthScore?: HealthScoreResult
}

export interface AnalyzerOptions {
  viewport: ViewportSize
  minTouchTarget?: number
  fixedWidthThreshold?: number
  maxElements?: number
  enabledRules?: string[]
  signal?: AbortSignal
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
  'inaccessible-control': 'Inaccessible Form Control',
}

export const ACCESSIBILITY_ISSUE_TYPES: IssueType[] = [
  'missing-alt',
  'broken-image',
  'broken-link',
  'small-touch-target',
  'inaccessible-control',
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
