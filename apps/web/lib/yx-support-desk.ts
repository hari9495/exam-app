/** The API's own words when a staff member has no seat on the YukthiX Support desk (403), else undefined. */
export function notAgent(error: unknown): string | undefined {
  const e = error as { status?: number; message?: string } | null;
  return e?.status === 403 && /not a YukthiX Support agent/i.test(e.message ?? '') ? e.message : undefined;
}
