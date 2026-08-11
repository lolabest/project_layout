import type { PreviewSource, SourceState } from '../models/types'
import { validateSource } from './validation'

export interface SourceControllerState {
  state: SourceState
  errors: string[]
  message: string | null
  appliedSnapshot: string
}

export function snapshotSource(source: PreviewSource): string {
  return JSON.stringify({
    mode: source.mode,
    url: source.url,
    html: source.html,
    css: source.css,
    name: source.name,
  })
}

export function createInitialSourceState(source: PreviewSource): SourceControllerState {
  const hasContent =
    source.mode === 'url' ? Boolean(source.url.trim()) : Boolean(source.html.trim() || source.css.trim())
  return {
    state: hasContent ? 'ready' : 'empty',
    errors: [],
    message: null,
    appliedSnapshot: '',
  }
}

export function markSourceEdited(
  current: SourceControllerState,
  source: PreviewSource,
): SourceControllerState {
  const snap = snapshotSource(source)
  if (!snap) {
    return { ...current, state: 'empty', errors: [], message: null }
  }
  if (current.appliedSnapshot && snap !== current.appliedSnapshot) {
    return {
      ...current,
      state: 'modified',
      errors: [],
      message: 'Source changed — click Load Preview to apply.',
    }
  }
  const hasContent =
    source.mode === 'url' ? Boolean(source.url.trim()) : Boolean(source.html.trim() || source.css.trim())
  return {
    ...current,
    state: hasContent ? (current.appliedSnapshot ? current.state === 'loaded' ? 'modified' : 'ready' : 'ready') : 'empty',
    errors: [],
  }
}

export function beginSourceLoad(
  current: SourceControllerState,
  source: PreviewSource,
): SourceControllerState {
  const validation = validateSource(source)
  if (!validation.valid) {
    return {
      ...current,
      state: 'invalid',
      errors: validation.errors,
      message: validation.errors[0] ?? 'Invalid source',
    }
  }
  return {
    ...current,
    state: 'loading',
    errors: [],
    message: 'Loading preview…',
    appliedSnapshot: snapshotSource(source),
  }
}

export function completeSourceLoad(
  current: SourceControllerState,
  result: {
    blocked: boolean
    accessible: boolean
    failed?: boolean | undefined
    message?: string | undefined
  },
): SourceControllerState {
  if (result.failed) {
    return {
      ...current,
      state: 'failed',
      message: result.message ?? 'Preview failed to load.',
    }
  }
  if (result.blocked) {
    return {
      ...current,
      state: 'blocked',
      message:
        result.message ??
        'This website blocked iframe embedding or cross-origin access (X-Frame-Options, CSP, or CORS). Switch to HTML/CSS mode to analyse markup locally. Browser security is not bypassed.',
    }
  }
  return {
    ...current,
    state: 'loaded',
    message: result.message ?? 'Preview loaded. Layout analysis is available.',
  }
}

export function canAnalyze(state: SourceState, accessible: boolean): boolean {
  return (state === 'loaded' || state === 'blocked') && accessible && state !== 'blocked'
}

export function canAnalyzeStrict(state: SourceState, accessible: boolean): boolean {
  return state === 'loaded' && accessible
}
