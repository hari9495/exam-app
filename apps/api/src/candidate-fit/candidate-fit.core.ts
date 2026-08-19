import { createHash } from 'crypto';

export interface RubricDimension {
  label: string;
  weight: number;
}

export interface FitResult {
  overallScore: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  dimensionScores: { label: string; weight: number; score: number }[] | null;
}

export interface FitJobInput {
  title: string;
  description: string | null;
  fitCriteria: string | null;
  fitRubric: string | null;
}

export interface FitProfileInput {
  parsedSummary: string | null;
  parsedSkills: string[];
  parsedTitle: string | null;
  parsedYearsExperience: number | null;
}

function clampScore(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

// Tolerant read of a stored rubric: never throws, drops anything malformed.
export function parseRubric(fitRubric: string | null): RubricDimension[] {
  if (!fitRubric) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fitRubric);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (d): d is RubricDimension =>
        !!d && typeof (d as any).label === 'string' && typeof (d as any).weight === 'number',
    )
    .map((d) => ({ label: d.label, weight: d.weight }));
}

// Strict validation for recruiter-submitted rubric input. Empty = "no rubric" and is allowed.
export function validateRubricInput(dims: unknown): RubricDimension[] {
  if (!Array.isArray(dims)) throw new Error('Rubric must be an array');
  if (dims.length === 0) return [];
  const normalized: RubricDimension[] = dims.map((d: any) => {
    if (!d || typeof d.label !== 'string' || !d.label.trim()) throw new Error('Each rubric dimension needs a non-empty label');
    if (typeof d.weight !== 'number' || !Number.isInteger(d.weight) || d.weight < 0) {
      throw new Error('Each rubric weight must be a non-negative integer');
    }
    return { label: d.label.trim(), weight: d.weight };
  });
  const sum = normalized.reduce((a, d) => a + d.weight, 0);
  if (sum !== 100) throw new Error('Rubric weights must sum to 100');
  return normalized;
}

export function computeCriteriaHash(job: FitJobInput): string {
  const material = [job.title, job.description ?? '', job.fitCriteria ?? '', job.fitRubric ?? ''].join('\n');
  return createHash('sha256').update(material).digest('hex');
}

export function buildFitToolSchema(rubric: RubricDimension[]): object {
  const properties: Record<string, unknown> = {
    overallScore: { type: 'integer', description: 'Overall résumé-vs-role fit, 0 (no fit) to 100 (excellent fit).' },
    summary: { type: 'string', description: 'A 2-4 sentence narrative of how well the candidate fits this role.' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'Concise, specific strengths for this role.' },
    concerns: { type: 'array', items: { type: 'string' }, description: 'Concise, specific gaps or concerns for this role.' },
  };
  if (rubric.length > 0) {
    properties.dimensionScores = {
      type: 'array',
      description: 'One entry per named rubric dimension, each scored 0-100.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'The rubric dimension label (echo it back exactly).' },
          score: { type: 'integer', description: 'Fit for this dimension, 0-100.' },
        },
        required: ['label', 'score'],
      },
    };
  }
  return { type: 'object', properties, required: ['overallScore', 'summary', 'strengths', 'concerns'] };
}

export function buildFitPrompt(job: FitJobInput, profile: FitProfileInput, rubric: RubricDimension[]): string {
  const parts: string[] = [];
  parts.push('You are helping a recruiter assess how well a candidate fits a specific role, based ONLY on the candidate\'s résumé profile.');
  parts.push('Score résumé and experience fit against the role. Do not consider, invent, or reference any test/exam/assessment performance — you are not given it.');
  parts.push(`\n# Role\nTitle: ${job.title}\nDescription: ${job.description ?? '(none provided)'}`);
  if (job.fitCriteria && job.fitCriteria.trim()) {
    parts.push(`\n# What the recruiter is specifically looking for\n${job.fitCriteria.trim()}`);
  }
  if (rubric.length > 0) {
    const lines = rubric.map((d) => `- ${d.label} (weight ${d.weight}%)`).join('\n');
    parts.push(`\n# Scoring rubric — return a per-dimension score (0-100) for each, echoing the label exactly\n${lines}`);
  }
  parts.push(
    `\n# Candidate profile (parsed from résumé)\n` +
      `Title: ${profile.parsedTitle ?? '(unknown)'}\n` +
      `Years of experience: ${profile.parsedYearsExperience ?? '(unknown)'}\n` +
      `Skills: ${profile.parsedSkills.length ? profile.parsedSkills.join(', ') : '(none extracted)'}\n` +
      `Summary: ${profile.parsedSummary ?? '(none)'}`,
  );
  parts.push('\nBe specific and evidence-based. Keep strengths and concerns to concise bullet points.');
  return parts.join('\n');
}

export function validateFitResult(raw: Record<string, unknown>, rubric: RubricDimension[]): FitResult {
  if (typeof raw.summary !== 'string') throw new Error('AI provider returned a malformed fit result (summary)');
  const strengths = Array.isArray(raw.strengths) ? raw.strengths.filter((s): s is string => typeof s === 'string') : [];
  const concerns = Array.isArray(raw.concerns) ? raw.concerns.filter((s): s is string => typeof s === 'string') : [];

  let dimensionScores: FitResult['dimensionScores'] = null;
  if (rubric.length > 0) {
    const byLabel = new Map<string, number>();
    if (Array.isArray(raw.dimensionScores)) {
      for (const d of raw.dimensionScores as any[]) {
        if (d && typeof d.label === 'string') byLabel.set(d.label, clampScore(d.score));
      }
    }
    // Drive off the rubric (authoritative weights), fill a missing score with 0.
    dimensionScores = rubric.map((r) => ({ label: r.label, weight: r.weight, score: byLabel.get(r.label) ?? 0 }));
  }

  return {
    overallScore: clampScore(raw.overallScore),
    summary: raw.summary,
    strengths,
    concerns,
    dimensionScores,
  };
}
