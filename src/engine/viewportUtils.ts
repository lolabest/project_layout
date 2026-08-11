import type { Orientation, ViewportSize } from '../models/types'
import { PREDEFINED_VIEWPORTS, VIEWPORT_LIMITS } from '../models/types'

export interface ViewportValidation {
  valid: boolean
  errors: string[]
  width: number
  height: number
}

export function validateViewportDimensions(width: number, height: number): ViewportValidation {
  const errors: string[] = []
  const w = Number(width)
  const h = Number(height)

  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    errors.push('Width and height must be valid numbers.')
    return { valid: false, errors, width: w, height: h }
  }

  if (w < VIEWPORT_LIMITS.minWidth || w > VIEWPORT_LIMITS.maxWidth) {
    errors.push(
      `Width must be between ${VIEWPORT_LIMITS.minWidth} and ${VIEWPORT_LIMITS.maxWidth} px.`,
    )
  }
  if (h < VIEWPORT_LIMITS.minHeight || h > VIEWPORT_LIMITS.maxHeight) {
    errors.push(
      `Height must be between ${VIEWPORT_LIMITS.minHeight} and ${VIEWPORT_LIMITS.maxHeight} px.`,
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    width: Math.round(w),
    height: Math.round(h),
  }
}

export function switchOrientation(
  viewport: ViewportSize,
  orientation: Orientation,
): { viewport: ViewportSize; orientation: Orientation } {
  const shouldSwap =
    (orientation === 'landscape' && viewport.width < viewport.height) ||
    (orientation === 'portrait' && viewport.width > viewport.height)

  if (!shouldSwap) {
    return { viewport: { ...viewport }, orientation }
  }

  return {
    orientation,
    viewport: {
      ...viewport,
      width: viewport.height,
      height: viewport.width,
      id: viewport.predefined ? `${viewport.id}-${orientation}` : viewport.id,
      name: viewport.predefined
        ? `${viewport.name.replace(/ Landscape| Portrait/g, '')}${orientation === 'landscape' ? ' Landscape' : ''}`
        : viewport.name,
    },
  }
}

export function applyPreset(
  preset: ViewportSize,
  orientation: Orientation,
): ViewportSize {
  if (orientation === 'landscape' && preset.width < preset.height) {
    return {
      ...preset,
      id: `${preset.id}-landscape`,
      name: `${preset.name} Landscape`,
      width: preset.height,
      height: preset.width,
    }
  }
  return { ...preset }
}

export function createCustomViewport(width: number, height: number): ViewportSize {
  const check = validateViewportDimensions(width, height)
  return {
    id: 'custom',
    name: 'Custom',
    width: check.width || width,
    height: check.height || height,
    predefined: false,
  }
}

export function getDefaultViewports(): ViewportSize[] {
  return PREDEFINED_VIEWPORTS.map((v) => ({ ...v }))
}

export function clampViewport(viewport: ViewportSize): ViewportSize {
  return {
    ...viewport,
    width: Math.min(
      VIEWPORT_LIMITS.maxWidth,
      Math.max(VIEWPORT_LIMITS.minWidth, Math.round(viewport.width)),
    ),
    height: Math.min(
      VIEWPORT_LIMITS.maxHeight,
      Math.max(VIEWPORT_LIMITS.minHeight, Math.round(viewport.height)),
    ),
  }
}
