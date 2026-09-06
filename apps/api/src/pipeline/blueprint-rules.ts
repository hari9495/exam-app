import { BadRequestException } from '@nestjs/common';

export type BlueprintRule =
  | { id: string; type: 'feedback'; minCount?: number; minAvgRating?: number; requireNote?: boolean }
  | { id: string; type: 'exam_passed'; examId?: string; minScore?: number }
  | { id: string; type: 'checklist'; items: { id: string; label: string }[] };

export interface BlueprintContext {
  feedback: { rating: number | null; note: string | null }[];
  examResults: { examId: string; passFail: string | null; score: number | null }[];
  checklistTicks: Record<string, boolean>;
}

const RULE_TYPES = ['feedback', 'exam_passed', 'checklist'] as const;

export function parseRules(rulesJson: string | null | undefined): BlueprintRule[] {
  if (!rulesJson) return [];
  try {
    const arr = JSON.parse(rulesJson);
    return Array.isArray(arr) ? (arr as BlueprintRule[]) : [];
  } catch {
    return [];
  }
}

export function parseChecklist(json: string | null | undefined): Record<string, boolean> {
  if (!json) return {};
  try {
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function validateBlueprintRules(rules: unknown): BlueprintRule[] {
  if (!Array.isArray(rules)) throw new BadRequestException('rules must be an array');
  for (const r of rules as any[]) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) throw new BadRequestException('each rule needs a string id');
    if (!RULE_TYPES.includes(r.type)) throw new BadRequestException(`unknown rule type ${r.type}`);
    if (r.type === 'checklist') {
      if (!Array.isArray(r.items) || r.items.length === 0) throw new BadRequestException('checklist rule needs items');
      for (const it of r.items) if (!it || typeof it.id !== 'string' || typeof it.label !== 'string') throw new BadRequestException('checklist item needs id + label');
    }
    if (r.type === 'feedback') {
      for (const k of ['minCount', 'minAvgRating', 'minScore'] as const) if (r[k] !== undefined && typeof r[k] !== 'number') throw new BadRequestException(`${k} must be a number`);
    }
    if (r.type === 'exam_passed') {
      if (r.examId !== undefined && typeof r.examId !== 'string') throw new BadRequestException('examId must be a string');
      if (r.minScore !== undefined && typeof r.minScore !== 'number') throw new BadRequestException('minScore must be a number');
    }
  }
  return rules as BlueprintRule[];
}

function avg(nums: (number | null)[]): number | null {
  const xs = nums.filter((n): n is number => typeof n === 'number');
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function evaluateBlueprint(rules: BlueprintRule[], ctx: BlueprintContext): string[] {
  const unmet: string[] = [];
  for (const rule of rules) {
    if (rule.type === 'feedback') {
      if (rule.minCount !== undefined && ctx.feedback.length < rule.minCount) unmet.push(`at least ${rule.minCount} feedback ${rule.minCount === 1 ? 'entry' : 'entries'}`);
      if (rule.minAvgRating !== undefined) {
        const a = avg(ctx.feedback.map((f) => f.rating));
        if (a === null || a < rule.minAvgRating) unmet.push(`an average rating of at least ${rule.minAvgRating}`);
      }
      if (rule.requireNote && !ctx.feedback.some((f) => (f.note ?? '').trim() !== '')) unmet.push('a feedback note');
    } else if (rule.type === 'exam_passed') {
      const pool = rule.examId ? ctx.examResults.filter((r) => r.examId === rule.examId) : ctx.examResults;
      const ok = pool.some((r) => r.passFail === 'pass' && (rule.minScore === undefined || (r.score ?? -Infinity) >= rule.minScore));
      if (!ok) unmet.push(rule.examId ? 'the required exam passed' : 'a passing exam result');
    } else if (rule.type === 'checklist') {
      const missing = rule.items.filter((it) => ctx.checklistTicks[it.id] !== true).map((it) => it.label);
      if (missing.length) unmet.push(`checklist: ${missing.join(', ')}`);
    }
    // unknown/malformed rule type → treated as satisfied (never a false block)
  }
  return unmet;
}
