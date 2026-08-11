export type ErrorCode =
  | 'INVALID_SOURCE'
  | 'SOURCE_BLOCKED'
  | 'SOURCE_LOAD'
  | 'INSPECTION_UNAVAILABLE'
  | 'ANALYSIS_TIMEOUT'
  | 'RULE_EXECUTION'
  | 'SESSION_CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'STORAGE'
  | 'EXPORT'
  | 'COMPARISON'
  | 'CANCELLED'

export interface AppError {
  code: ErrorCode
  message: string
  diagnostic: string
  recoverable: boolean
  nextAction: string
  timestamp: string
}

function createError(
  code: ErrorCode,
  message: string,
  diagnostic: string,
  recoverable: boolean,
  nextAction: string,
): AppError {
  return {
    code,
    message,
    diagnostic,
    recoverable,
    nextAction,
    timestamp: new Date().toISOString(),
  }
}

export const Errors = {
  invalidSource: (detail: string) =>
    createError(
      'INVALID_SOURCE',
      'The source input is invalid.',
      detail,
      true,
      'Correct the URL or pasted markup and try again.',
    ),
  sourceBlocked: (detail: string) =>
    createError(
      'SOURCE_BLOCKED',
      'The website blocked preview or inspection.',
      detail,
      true,
      'Switch to HTML/CSS mode. Browser security is not bypassed.',
    ),
  sourceLoad: (detail: string) =>
    createError(
      'SOURCE_LOAD',
      'The preview failed to load.',
      detail,
      true,
      'Check the URL availability or paste markup instead.',
    ),
  inspectionUnavailable: (detail: string) =>
    createError(
      'INSPECTION_UNAVAILABLE',
      'DOM inspection is unavailable for this preview.',
      detail,
      true,
      'Use pasted HTML/CSS for full analysis.',
    ),
  analysisTimeout: (detail: string) =>
    createError(
      'ANALYSIS_TIMEOUT',
      'Analysis timed out before completion.',
      detail,
      true,
      'Retry with a smaller page or adjust timeouts.',
    ),
  ruleExecution: (ruleId: string, detail: string) =>
    createError(
      'RULE_EXECUTION',
      `Rule "${ruleId}" failed and was skipped.`,
      detail,
      true,
      'Review diagnostics. Other rules continued.',
    ),
  sessionConflict: (detail: string) =>
    createError(
      'SESSION_CONFLICT',
      'Another analysis session is already running.',
      detail,
      true,
      'Cancel the active session before starting another.',
    ),
  invalidTransition: (from: string, to: string, machine: string) =>
    createError(
      'INVALID_STATE_TRANSITION',
      `Invalid ${machine} transition from ${from} to ${to}.`,
      `${machine}: ${from} → ${to}`,
      false,
      'Use only allowed state transitions.',
    ),
  storage: (detail: string) =>
    createError(
      'STORAGE',
      'Session storage is unavailable or full.',
      detail,
      true,
      'Clear old sessions or free browser storage.',
    ),
  exportFailed: (detail: string) =>
    createError(
      'EXPORT',
      'Report export failed.',
      detail,
      true,
      'Retry export after analysis completes.',
    ),
  comparison: (detail: string) =>
    createError(
      'COMPARISON',
      'Reference comparison could not be completed.',
      detail,
      true,
      'Ensure both reference and preview captures are available.',
    ),
  cancelled: () =>
    createError(
      'CANCELLED',
      'The analysis was cancelled.',
      'AbortSignal received',
      true,
      'Start a new analysis when ready.',
    ),
}
