import { describe, expect, it } from 'vitest'
import { canTransition } from './stateMachine'
import { SOURCE_TRANSITIONS, transitionSource } from './sourceStateMachine'
import { SESSION_TRANSITIONS, SESSION_TERMINAL, transitionSession, isSessionTerminal } from './sessionStateMachine'
import { VIEWPORT_RUN_TRANSITIONS, transitionViewportRun } from './viewportRunStateMachine'
import { ISSUE_TRANSITIONS, transitionIssue } from './issueStateMachine'

describe('source state machine', () => {
  it('allows Empty → Dirty → Validating → Ready → Loading → Loaded', () => {
    expect(transitionSource('Empty', 'Dirty').ok).toBe(true)
    expect(transitionSource('Dirty', 'Validating').ok).toBe(true)
    expect(transitionSource('Validating', 'Ready').ok).toBe(true)
    expect(transitionSource('Ready', 'Loading').ok).toBe(true)
    expect(transitionSource('Loading', 'Loaded').ok).toBe(true)
    expect(transitionSource('Loading', 'Blocked').ok).toBe(true)
    expect(transitionSource('Loading', 'Failed').ok).toBe(true)
    expect(transitionSource('Loaded', 'Dirty').ok).toBe(true)
  })

  it('rejects invalid transitions', () => {
    expect(transitionSource('Empty', 'Loaded').ok).toBe(false)
    expect(transitionSource('Loaded', 'Validating').ok).toBe(false)
    for (const from of Object.keys(SOURCE_TRANSITIONS) as Array<keyof typeof SOURCE_TRANSITIONS>) {
      for (const to of Object.keys(SOURCE_TRANSITIONS) as Array<keyof typeof SOURCE_TRANSITIONS>) {
        const allowed = canTransition(SOURCE_TRANSITIONS, from, to) || from === to
        expect(transitionSource(from, to).ok).toBe(allowed)
      }
    }
  })
})

describe('session state machine', () => {
  it('allows draft to running to completed variants', () => {
    expect(transitionSession('Draft', 'Running').ok).toBe(true)
    expect(transitionSession('Running', 'Completed').ok).toBe(true)
    expect(transitionSession('Running', 'CompletedWithErrors').ok).toBe(true)
    expect(transitionSession('Running', 'Cancelling').ok).toBe(true)
    expect(transitionSession('Cancelling', 'Cancelled').ok).toBe(true)
  })

  it('treats completed/cancelled/failed as terminal', () => {
    for (const state of SESSION_TERMINAL) {
      expect(isSessionTerminal(state)).toBe(true)
      expect(SESSION_TRANSITIONS[state]).toEqual([])
      expect(transitionSession(state, 'Running').ok).toBe(false)
    }
  })
})

describe('viewport run state machine', () => {
  it('follows prepare → stabilise → analyse → completed', () => {
    expect(transitionViewportRun('Pending', 'Preparing').ok).toBe(true)
    expect(transitionViewportRun('Preparing', 'Stabilising').ok).toBe(true)
    expect(transitionViewportRun('Stabilising', 'Analysing').ok).toBe(true)
    expect(transitionViewportRun('Analysing', 'Completed').ok).toBe(true)
    expect(transitionViewportRun('Completed', 'Analysing').ok).toBe(false)
  })

  it('rejects jumps that skip preparation', () => {
    expect(transitionViewportRun('Pending', 'Analysing').ok).toBe(false)
    expect(canTransition(VIEWPORT_RUN_TRANSITIONS, 'Pending', 'Completed')).toBe(false)
  })
})

describe('issue state machine', () => {
  it('allows open to resolved/ignored/stale and reopen paths', () => {
    expect(transitionIssue('Open', 'Resolved').ok).toBe(true)
    expect(transitionIssue('Open', 'Ignored').ok).toBe(true)
    expect(transitionIssue('Ignored', 'Open').ok).toBe(true)
    expect(transitionIssue('Resolved', 'Open').ok).toBe(true)
    expect(transitionIssue('Stale', 'Open').ok).toBe(true)
    expect(transitionIssue('Ignored', 'Resolved').ok).toBe(false)
  })

  it('enumerates only declared edges', () => {
    for (const from of Object.keys(ISSUE_TRANSITIONS) as Array<keyof typeof ISSUE_TRANSITIONS>) {
      for (const to of Object.keys(ISSUE_TRANSITIONS) as Array<keyof typeof ISSUE_TRANSITIONS>) {
        const allowed = canTransition(ISSUE_TRANSITIONS, from, to) || from === to
        expect(transitionIssue(from, to).ok).toBe(allowed)
      }
    }
  })
})
