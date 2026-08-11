export interface CoverageInput {
  applicableRules: number
  executedRules: number
  skippedRules: number
  failedRules: number
  domAccessible: boolean
  stabilizationTimedOut: boolean
}

export interface CoverageResult {
  /** 0–100 */
  percent: number
  warning: string | null
  detail: string
}

/**
 * Analysis Coverage — how much of the applicable check surface completed.
 * High health score + low coverage must warn the user.
 */
export function calculateCoverage(input: CoverageInput): CoverageResult {
  if (!input.domAccessible) {
    return {
      percent: 0,
      warning:
        'DOM inspection is unavailable. The health score may not represent the complete layout.',
      detail: '0 applicable checks could run because the preview is not inspectable.',
    }
  }

  const applicable = Math.max(0, input.applicableRules)
  if (applicable === 0) {
    return {
      percent: 100,
      warning: null,
      detail: 'No rules were applicable for this viewport.',
    }
  }

  const successWeight = input.executedRules
  const skipPenalty = input.skippedRules * 0.35
  const failPenalty = input.failedRules * 0.75
  const raw = ((successWeight - skipPenalty - failPenalty) / applicable) * 100
  let percent = Math.max(0, Math.min(100, Math.round(raw)))

  if (input.stabilizationTimedOut) {
    percent = Math.max(0, percent - 10)
  }

  const warning =
    percent < 70
      ? `Only ${percent}% of available checks could be completed. The health score may not represent the complete layout.`
      : null

  return {
    percent,
    warning,
    detail: `executed=${input.executedRules}, skipped=${input.skippedRules}, failed=${input.failedRules}, applicable=${applicable}`,
  }
}
