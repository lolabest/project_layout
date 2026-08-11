import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageSessionRepository } from './LocalStorageSessionRepository'
import { createSession } from '../../engine/reports'
import { MOBILE_VIEWPORT } from '../../models/types'

describe('LocalStorageSessionRepository', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and lists sessions with schema version', () => {
    const repo = new LocalStorageSessionRepository()
    const session = createSession({
      name: 'persist-test',
      source: { mode: 'markup', url: '', html: '<p>x</p>', css: '', name: 'x' },
      selectedViewports: [MOBILE_VIEWPORT],
      status: 'Completed',
      issues: [],
    })
    const saved = repo.save(session)
    expect(saved.ok).toBe(true)
    const listed = repo.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.value.some((s) => s.id === session.id)).toBe(true)
  })

  it('rejects corrupted storage safely', () => {
    localStorage.setItem('layout-tester.sessions.v2', '{not-json')
    const repo = new LocalStorageSessionRepository()
    const listed = repo.list()
    expect(listed.ok).toBe(false)
  })

  it('migrates legacy array storage', () => {
    const legacy = createSession({
      name: 'legacy',
      source: { mode: 'markup', url: '', html: '<p>y</p>', css: '', name: 'y' },
      selectedViewports: [MOBILE_VIEWPORT],
      status: 'Draft',
    })
    localStorage.setItem('layout-tester.sessions', JSON.stringify([legacy]))
    const repo = new LocalStorageSessionRepository()
    const listed = repo.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.value.some((s) => s.id === legacy.id)).toBe(true)
  })

  it('keeps at most 20 sessions', () => {
    const repo = new LocalStorageSessionRepository()
    for (let i = 0; i < 25; i++) {
      repo.save(
        createSession({
          name: `s-${i}`,
          source: { mode: 'markup', url: '', html: `<p>${i}</p>`, css: '', name: `s-${i}` },
          selectedViewports: [MOBILE_VIEWPORT],
          status: 'Completed',
        }),
      )
    }
    const listed = repo.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.value.length).toBeLessThanOrEqual(20)
  })
})
