export interface AnalysisCapabilities {
  previewAvailable: boolean
  domInspectionAvailable: boolean
  screenshotAvailable: boolean
  referenceComparisonAvailable: boolean
}

export function emptyCapabilities(): AnalysisCapabilities {
  return {
    previewAvailable: false,
    domInspectionAvailable: false,
    screenshotAvailable: false,
    referenceComparisonAvailable: false,
  }
}

export function capabilitiesFromPreview(input: {
  loaded: boolean
  blocked: boolean
  accessible: boolean
}): AnalysisCapabilities {
  const previewAvailable = input.loaded && !input.blocked
  const domInspectionAvailable = previewAvailable && input.accessible
  const screenshotAvailable = domInspectionAvailable
  return {
    previewAvailable: input.loaded,
    domInspectionAvailable,
    screenshotAvailable,
    referenceComparisonAvailable: screenshotAvailable,
  }
}

export function describeCapabilities(caps: AnalysisCapabilities): string {
  const parts = [
    caps.previewAvailable ? 'Preview available' : 'Preview unavailable',
    caps.domInspectionAvailable ? 'DOM inspection available' : 'DOM inspection unavailable',
    caps.screenshotAvailable ? 'Screenshots available' : 'Screenshots unavailable',
    caps.referenceComparisonAvailable
      ? 'Reference comparison available'
      : 'Reference comparison unavailable',
  ]
  return parts.join(' · ')
}
