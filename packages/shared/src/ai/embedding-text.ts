import { createHash } from 'crypto';

export interface EmbeddableProfile {
  parsedSummary?: string | null;
  parsedSkills?: string | null; // JSON array string, as stored on CandidateProfile
  parsedTitle?: string | null;
}

// The canonical text we embed for a candidate. Kept in one place so the generator and any future
// re-embed use identical input (and therefore an identical hash). Returns '' when there is nothing
// worth embedding (caller then skips).
export function buildEmbeddingText(profile: EmbeddableProfile): string {
  const parts: string[] = [];
  if (profile.parsedTitle?.trim()) parts.push(`Title: ${profile.parsedTitle.trim()}`);
  if (profile.parsedSummary?.trim()) parts.push(profile.parsedSummary.trim());
  if (profile.parsedSkills?.trim()) {
    try {
      const skills = JSON.parse(profile.parsedSkills);
      if (Array.isArray(skills) && skills.length) parts.push(`Skills: ${skills.filter((s) => typeof s === 'string').join(', ')}`);
    } catch {
      /* ignore malformed skills JSON */
    }
  }
  return parts.join('\n');
}

// Stable content hash so we only re-embed when the text (or model) actually changed. Includes the
// model so switching embedding models re-embeds everyone.
export function embeddingHash(text: string, model: string): string {
  return createHash('sha256').update(`${model}\n${text}`).digest('hex');
}
