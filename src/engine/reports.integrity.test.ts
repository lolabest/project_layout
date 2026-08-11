import { describe, expect, it } from 'vitest'
import { createReport, createReportIntegrityHash } from './reports'
import { MOBILE_VIEWPORT } from '../models/types'

describe('report integrity', () => {
  it('embeds schema version, policy versions, and stable integrity hash', () => {
    const report = createReport({
      sourceName: 'fixture',
      sourceMode: 'markup',
      viewport: MOBILE_VIEWPORT,
      issues: [],
      sessionId: 'session-1',
      sourceFingerprint: 'fp-abc',
      coveragePercent: 90,
    })
    expect(report.schemaVersion).toBe(1)
    expect(report.ruleEngineVersion).toBeTruthy()
    expect(report.scoringPolicyVersion).toBeTruthy()
    expect(report.integrityHash).toBeTruthy()
    const { integrityHash, ...draft } = report
    const recomputed = createReportIntegrityHash(draft)
    expect(recomputed).toBe(integrityHash)
  })
})
