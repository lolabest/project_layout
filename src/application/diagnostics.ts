export type DiagnosticEventType =
  | 'session_created'
  | 'source_validated'
  | 'viewport_started'
  | 'viewport_stabilised'
  | 'rule_started'
  | 'rule_completed'
  | 'rule_skipped'
  | 'rule_failed'
  | 'issue_detected'
  | 'issue_resolved'
  | 'analysis_cancelled'
  | 'report_generated'

export interface DiagnosticEvent {
  type: DiagnosticEventType
  timestamp: string
  sessionId?: string
  viewportId?: string
  ruleId?: string
  message: string
  data?: Record<string, string | number | boolean | null>
}

/** In-memory diagnostic logger — replaceable by a telemetry adapter later. */
export class DiagnosticLogger {
  private events: DiagnosticEvent[] = []
  private readonly maxEvents: number

  constructor(maxEvents = 500) {
    this.maxEvents = maxEvents
  }

  log(
    type: DiagnosticEventType,
    message: string,
    extra?: Omit<DiagnosticEvent, 'type' | 'timestamp' | 'message'>,
  ): void {
    this.events.push({
      type,
      message,
      timestamp: new Date().toISOString(),
      ...extra,
    })
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents)
    }
  }

  list(): DiagnosticEvent[] {
    return [...this.events]
  }

  clear(): void {
    this.events = []
  }

  summary(): string[] {
    return this.events.slice(-40).map((e) => `[${e.type}] ${e.message}`)
  }
}

export const diagnosticLogger = new DiagnosticLogger()
