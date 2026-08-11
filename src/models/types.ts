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

export type SourceMode = 'url' | 'markup'

export type Orientation = 'portrait' | 'landscape'

export interface ViewportSize {
  id: string
  name: string
  width: number
  height: number
  predefined?: boolean
}

export interface DetectedIssue {
  id: string
  type: IssueType
  severity: Severity
  selector: string
  explanation: string
  recommendation: string
  boundingRect?: {
    top: number
    left: number
    width: number
    height: number
  }
  tagName?: string
}

export interface ElementMeasurements {
  selector: string
  tagName: string
  width: number
  height: number
  margin: BoxSides
  padding: BoxSides
  position: {
    top: number
    left: number
    right: number
    bottom: number
  }
  fontSize: string
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

export interface ComparisonState {
  referenceImageDataUrl: string | null
  opacity: number
  mode: 'side-by-side' | 'overlay' | 'difference'
  similarity: number | null
  renderedScreenshot: string | null
}

export interface ViewportTestResult {
  viewport: ViewportSize
  issues: DetectedIssue[]
  screenshotDataUrl: string | null
  criticalCount: number
  overflowCount: number
  accessibilityCount: number
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
}

export interface TestReport {
  id: string
  sourceName: string
  sourceMode: SourceMode
  sourceUrl?: string
  testedAt: string
  viewport: ViewportSize
  screenshots: string[]
  issues: DetectedIssue[]
  recommendations: string[]
}

export interface TestSession {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  source: PreviewSource
  viewport: ViewportSize
  orientation: Orientation
  scale: number
  issues: DetectedIssue[]
  report?: TestReport
  multiViewportSummary?: MultiViewportSummary
}

export interface AnalysisResult {
  issues: DetectedIssue[]
  analyzedAt: string
  accessible: boolean
  errorMessage?: string
}

export const PREDEFINED_VIEWPORTS: ViewportSize[] = [
  { id: 'mobile', name: 'Mobile', width: 375, height: 812, predefined: true },
  { id: 'tablet', name: 'Tablet', width: 768, height: 1024, predefined: true },
  { id: 'laptop', name: 'Laptop', width: 1440, height: 900, predefined: true },
  { id: 'desktop', name: 'Desktop', width: 1920, height: 1080, predefined: true },
]

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
}

export const ACCESSIBILITY_ISSUE_TYPES: IssueType[] = [
  'missing-alt',
  'broken-image',
  'broken-link',
  'small-touch-target',
]

export const OVERFLOW_ISSUE_TYPES: IssueType[] = [
  'horizontal-overflow',
  'outside-viewport',
  'image-overflow',
]
