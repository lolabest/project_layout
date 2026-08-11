import type { RuleId } from '../../domain/ids'
import { BUILTIN_RULES } from './builtinRules'
import type { AnalysisRule } from './types'

export class RuleRegistry {
  private readonly rules = new Map<string, AnalysisRule>()
  private enabled = new Set<string>()

  constructor(rules: AnalysisRule[] = BUILTIN_RULES) {
    for (const rule of rules) {
      this.rules.set(String(rule.id), rule)
      this.enabled.add(String(rule.id))
    }
  }

  register(rule: AnalysisRule): void {
    this.rules.set(String(rule.id), rule)
    this.enabled.add(String(rule.id))
  }

  enable(ruleId: RuleId | string): void {
    if (this.rules.has(String(ruleId))) this.enabled.add(String(ruleId))
  }

  disable(ruleId: RuleId | string): void {
    this.enabled.delete(String(ruleId))
  }

  setEnabled(ruleIds: Array<RuleId | string> | 'all'): void {
    if (ruleIds === 'all') {
      this.enabled = new Set(this.rules.keys())
      return
    }
    this.enabled = new Set(ruleIds.map(String).filter((id) => this.rules.has(id)))
  }

  list(): AnalysisRule[] {
    return Array.from(this.rules.values())
  }

  listEnabled(): AnalysisRule[] {
    return this.list().filter((r) => this.enabled.has(String(r.id)))
  }

  get(ruleId: RuleId | string): AnalysisRule | undefined {
    return this.rules.get(String(ruleId))
  }
}
