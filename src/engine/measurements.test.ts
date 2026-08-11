import { describe, expect, it } from 'vitest'
import {
  applyTemporaryStyles,
  createStyleEditSession,
  redoLastChange,
  undoLastChange,
} from './measurements'

describe('temporary style transactions', () => {
  it('supports apply → undo → redo without mutating originals map incorrectly', () => {
    const doc = document.implementation.createHTMLDocument('t')
    const el = doc.createElement('div')
    el.id = 'box'
    doc.body.appendChild(el)
    const session = createStyleEditSession()

    applyTemporaryStyles(el, { width: '200px' }, session)
    expect(el.style.width).toBe('200px')
    expect(session.changes).toHaveLength(1)

    undoLastChange(doc, session)
    expect(el.style.width).toBe('')
    expect(session.redoStack).toHaveLength(1)

    redoLastChange(doc, session)
    expect(el.style.width).toBe('200px')
    expect(session.changes).toHaveLength(1)
    expect(session.redoStack).toHaveLength(0)
  })
})
