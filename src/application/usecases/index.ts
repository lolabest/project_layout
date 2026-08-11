/**
 * Explicit application use cases.
 * Each function validates input, returns Result, and delegates to AnalysisApplicationService.
 */
import type { AnalysisApplicationService } from '../AnalysisApplicationService'
import type { AppError } from '../../domain/errors'
import type { Result } from '../../domain/result'
import type {
  LayoutIssue,
  PreviewSource,
  TestSession,
  ViewportSize,
} from '../../models/types'
import type { StyleEditSession } from '../../engine/measurements'
import {
  applyTemporaryStyles,
  redoLastChange,
  resetAllStyles,
  resetElementStyles,
  undoLastChange,
} from '../../engine/measurements'
import { compareImages, fileToDataUrl } from '../../engine/comparison'
import { Errors } from '../../domain/errors'
import { err, ok } from '../../domain/result'
import { fingerprintSource } from '../../domain/fingerprint'

export function LoadSource(
  app: AnalysisApplicationService,
  source: PreviewSource,
): Result<{ source: PreviewSource; fingerprint: string }, AppError> {
  const validated = app.validateSource(source)
  if (!validated.ok) return validated
  const loading = app.transitionSourceState('Loading')
  if (!loading.ok && app.getRuntime()?.sourceState !== 'Ready') {
    // Allow load from Ready/Dirty after validate path
  }
  return ok({ source, fingerprint: validated.value.fingerprint })
}

export function ValidateSource(
  app: AnalysisApplicationService,
  source: PreviewSource,
): Result<{ source: PreviewSource; fingerprint: string }, AppError> {
  return app.validateSource(source)
}

export function CreateAnalysisSession(
  app: AnalysisApplicationService,
  source: PreviewSource,
  viewports?: ViewportSize[],
): Result<TestSession, AppError> {
  return app.createAnalysisSession(source, viewports)
}

export function RunActiveViewportAnalysis(
  app: AnalysisApplicationService,
  input: Parameters<AnalysisApplicationService['runActiveViewportAnalysis']>[0],
): ReturnType<AnalysisApplicationService['runActiveViewportAnalysis']> {
  return app.runActiveViewportAnalysis(input)
}

export function RunAllViewportsAnalysis(
  app: AnalysisApplicationService,
  input: Parameters<AnalysisApplicationService['runAllViewportsAnalysis']>[0],
): ReturnType<AnalysisApplicationService['runAllViewportsAnalysis']> {
  return app.runAllViewportsAnalysis(input)
}

export function CancelAnalysisSession(
  app: AnalysisApplicationService,
): Result<{ state: string }, AppError> {
  return app.cancelAnalysisSession()
}

export function RerunAnalysis(
  app: AnalysisApplicationService,
  input: Parameters<AnalysisApplicationService['runActiveViewportAnalysis']>[0],
): ReturnType<AnalysisApplicationService['runActiveViewportAnalysis']> {
  return app.rerunAnalysis(input)
}

export function ApplyTemporaryStyle(input: {
  element: HTMLElement
  styles: Record<string, string>
  session: StyleEditSession
  sessionId?: string | undefined
  viewportId?: string | undefined
}): Result<{ applied: number }, AppError> {
  if (!input.element) return err(Errors.invalidSource('No element selected for temporary style'))
  applyTemporaryStyles(input.element, input.styles, input.session)
  const last = input.session.changes[input.session.changes.length - 1]
  if (last) {
    if (input.sessionId !== undefined) last.sessionId = input.sessionId
    if (input.viewportId !== undefined) last.viewportId = input.viewportId
  }
  return ok({ applied: Object.keys(input.styles).length })
}

export function UndoTemporaryStyle(input: {
  document: Document
  session: StyleEditSession
}): Result<{ undone: boolean }, AppError> {
  const change = undoLastChange(input.document, input.session)
  if (!change) return err(Errors.invalidSource('Nothing to undo'))
  return ok({ undone: true })
}

export function RedoTemporaryStyle(input: {
  document: Document
  session: StyleEditSession
}): Result<{ redone: boolean }, AppError> {
  const change = redoLastChange(input.document, input.session)
  if (!change) return err(Errors.invalidSource('Nothing to redo'))
  return ok({ redone: true })
}

export function ResetTemporaryStyles(input: {
  document: Document
  session: StyleEditSession
  selector?: string | undefined
}): Result<{ reset: 'element' | 'all' }, AppError> {
  if (input.selector) {
    resetElementStyles(input.document, input.session, input.selector)
    return ok({ reset: 'element' })
  }
  resetAllStyles(input.document, input.session)
  return ok({ reset: 'all' })
}

export function IgnoreIssue(
  app: AnalysisApplicationService,
  issues: LayoutIssue[],
  issueId: string,
  reason: string,
): Result<{ issues: LayoutIssue[]; ignoredKeys: Record<string, string> }, AppError> {
  return app.ignoreIssue(issues, issueId, reason)
}

export function RestoreIgnoredIssue(
  app: AnalysisApplicationService,
  issues: LayoutIssue[],
  issueId: string,
): Result<{ issues: LayoutIssue[]; ignoredKeys: Record<string, string> }, AppError> {
  return app.restoreIgnoredIssue(issues, issueId)
}

export async function CompareWithReference(input: {
  referenceFile: File
  renderedDataUrl: string | null
  maxBytes?: number
}): Promise<
  Result<{ similarity: number; differenceDataUrl: string | null; referenceDataUrl: string }, AppError>
> {
  const maxBytes = input.maxBytes ?? 8 * 1024 * 1024
  if (!input.renderedDataUrl) {
    return err(Errors.comparison('No rendered screenshot available for comparison'))
  }
  if (input.referenceFile.size > maxBytes) {
    return err(Errors.comparison(`Reference image exceeds ${maxBytes} byte limit`))
  }
  try {
    const referenceDataUrl = await fileToDataUrl(input.referenceFile)
    const result = await compareImages(referenceDataUrl, input.renderedDataUrl)
    return ok({
      similarity: result.similarity,
      differenceDataUrl: result.differenceDataUrl,
      referenceDataUrl,
    })
  } catch (error) {
    return err(
      Errors.comparison(error instanceof Error ? error.message : 'Comparison failed'),
    )
  }
}

export function GenerateReport(
  app: AnalysisApplicationService,
  input: Parameters<AnalysisApplicationService['generateReport']>[0],
): Result<{ filename: string }, AppError> {
  return app.generateReport(input)
}

export function RestorePreviousSession(
  app: AnalysisApplicationService,
  id: string,
): Result<TestSession, AppError> {
  return app.restorePreviousSession(id)
}

export function DeleteSession(
  app: AnalysisApplicationService,
  id: string,
): Result<TestSession[], AppError> {
  return app.deleteSession(id)
}

export function ComputeSourceFingerprint(source: PreviewSource): string {
  return String(fingerprintSource(source))
}
