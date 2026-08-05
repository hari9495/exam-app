export interface WeightableSectionInput {
  id: string;
  selectionMode: 'fixed' | 'pool';
  totalMarks: number;
}

// Distributes 100 raw (fractional) percentage points across sections into integers that sum to
// exactly 100, giving the +1 remainder to whichever entries had the largest fractional part
// (the standard largest-remainder / Hamilton apportionment method) -- minimizes distortion
// versus e.g. always rounding down and dumping the leftover on one arbitrary section.
function roundToIntegersSumming100(rawValues: { id: string; value: number }[]): Map<string, number> {
  const withFloor = rawValues.map((v) => ({ id: v.id, floor: Math.floor(v.value), remainder: v.value - Math.floor(v.value) }));
  const flooredSum = withFloor.reduce((sum, v) => sum + v.floor, 0);
  const remaining = 100 - flooredSum;
  const byRemainderDesc = [...withFloor].sort((a, b) => b.remainder - a.remainder);
  const result = new Map(withFloor.map((v) => [v.id, v.floor]));
  for (let i = 0; i < remaining; i++) {
    const id = byRemainderDesc[i].id;
    result.set(id, (result.get(id) ?? 0) + 1);
  }
  return result;
}

// Backfill default: a section's weight before any recruiter has ever touched it. Fixed sections
// split proportionally to their current marks; pool sections have no fixed mark total (each
// candidate draws a different subset), so they're treated as a single "average section" worth
// among the total section count, then split that reserved share equally among themselves.
export function computeDefaultWeights(sections: WeightableSectionInput[]): Map<string, number> {
  if (sections.length === 0) {
    return new Map();
  }
  if (sections.length === 1) {
    return new Map([[sections[0].id, 100]]);
  }

  const poolSections = sections.filter((s) => s.selectionMode === 'pool');
  const fixedSections = sections.filter((s) => s.selectionMode === 'fixed');
  const poolTotalPercent = (100 * poolSections.length) / sections.length;
  const fixedTotalPercent = 100 - poolTotalPercent;
  const totalFixedMarks = fixedSections.reduce((sum, s) => sum + s.totalMarks, 0);

  const raw: { id: string; value: number }[] = [];
  for (const section of poolSections) {
    raw.push({ id: section.id, value: poolTotalPercent / poolSections.length });
  }
  for (const section of fixedSections) {
    const share = totalFixedMarks > 0 ? section.totalMarks / totalFixedMarks : 1 / fixedSections.length;
    raw.push({ id: section.id, value: fixedTotalPercent * share });
  }

  return roundToIntegersSumming100(raw);
}
