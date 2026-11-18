import { todayIst } from './yx-org';

/** This tax year and the last ("2026-27", "2025-26") for the flexible benefit screens (PAY-59, PAY-60). */
export function flexYears(today = todayIst()): string[] {
  const y = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0);
  return [y, y - 1].map((x) => `${x}-${String((x + 1) % 100).padStart(2, '0')}`);
}
