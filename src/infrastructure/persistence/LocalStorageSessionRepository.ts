import { Errors } from '../../domain/errors'
import { err, ok, type Result } from '../../domain/result'
import type { AppError } from '../../domain/errors'
import type { TestSession } from '../../models/types'

export const SESSION_SCHEMA_VERSION = 2
const STORAGE_KEY = 'layout-tester.sessions.v2'
const LEGACY_KEY = 'layout-tester.sessions'
const MAX_SESSIONS = 20

export interface PersistedSessionEnvelope {
  schemaVersion: number
  session: TestSession
}

export interface SessionRepository {
  list(): Result<TestSession[], AppError>
  save(session: TestSession): Result<TestSession[], AppError>
  delete(id: string): Result<TestSession[], AppError>
  clear(): Result<void, AppError>
}

function isSession(value: unknown): value is TestSession {
  if (!value || typeof value !== 'object') return false
  const s = value as TestSession
  return typeof s.id === 'string' && typeof s.name === 'string' && !!s.source
}

function migrateLegacy(raw: string): TestSession[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSession).map((s) => ({
      ...s,
      sourceType: s.sourceType ?? s.source.mode,
      selectedViewports: s.selectedViewports ?? (s.viewport ? [s.viewport] : []),
      results: s.results ?? [],
      totalIssueCount: s.totalIssueCount ?? (s.issues?.length ?? 0),
      issueCountBySeverity: s.issueCountBySeverity ?? {
        critical: 0,
        warning: 0,
        info: 0,
      },
      status: s.status ?? 'Draft',
    }))
  } catch {
    return []
  }
}

export class LocalStorageSessionRepository implements SessionRepository {
  list(): Result<TestSession[], AppError> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_KEY)
        if (!legacy) return ok([])
        const migrated = migrateLegacy(legacy)
        if (migrated.length) {
          this.saveAll(migrated)
          localStorage.removeItem(LEGACY_KEY)
        }
        return ok(migrated)
      }
      const parsed = JSON.parse(raw) as PersistedSessionEnvelope[]
      if (!Array.isArray(parsed)) return ok([])
      const sessions = parsed
        .filter((e) => e && e.schemaVersion <= SESSION_SCHEMA_VERSION && isSession(e.session))
        .map((e) => e.session)
      return ok(sessions)
    } catch (error) {
      return err(
        Errors.storage(error instanceof Error ? error.message : 'Failed to read sessions'),
      )
    }
  }

  save(session: TestSession): Result<TestSession[], AppError> {
    const listed = this.list()
    if (!listed.ok) return listed
    const next = [session, ...listed.value.filter((s) => s.id !== session.id)]
      .filter((s) => s.status !== 'Running')
      .slice(0, MAX_SESSIONS)
    return this.saveAll(next)
  }

  delete(id: string): Result<TestSession[], AppError> {
    const listed = this.list()
    if (!listed.ok) return listed
    return this.saveAll(listed.value.filter((s) => s.id !== id))
  }

  clear(): Result<void, AppError> {
    try {
      localStorage.removeItem(STORAGE_KEY)
      return ok(undefined)
    } catch (error) {
      return err(Errors.storage(error instanceof Error ? error.message : 'clear failed'))
    }
  }

  private saveAll(sessions: TestSession[]): Result<TestSession[], AppError> {
    try {
      const payload: PersistedSessionEnvelope[] = sessions.map((session) => ({
        schemaVersion: SESSION_SCHEMA_VERSION,
        session,
      }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      return ok(sessions)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'quota or serialisation failure'
      // Oldest-first eviction retry once
      if (sessions.length > 1) {
        try {
          const reduced = sessions.slice(0, Math.max(1, sessions.length - 5))
          const payload: PersistedSessionEnvelope[] = reduced.map((session) => ({
            schemaVersion: SESSION_SCHEMA_VERSION,
            session,
          }))
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
          return ok(reduced)
        } catch {
          return err(Errors.storage(message))
        }
      }
      return err(Errors.storage(message))
    }
  }
}

export const sessionRepository = new LocalStorageSessionRepository()
