// Answer 2781: the app side of the SCORM bridge. A package runs in a sandboxed frame on the content origin; its
// run-time (scorm-again) posts each commit to this page's origin. Only messages from that frame (or a frame inside it),
// from the content origin or the sandbox's opaque origin ("null"), for the item being played, are taken, and only the
// fields we store pass on. The API applies the same allow-list again.

/** The cmi fields kept, per SCORM version (the API's scorm.ts FIELDS hold the value checks). */
export const SCORM_FIELDS: Record<'1.2' | '2004', readonly string[]> = {
  '1.2': ['cmi.core.lesson_status', 'cmi.core.score.raw', 'cmi.core.score.min', 'cmi.core.score.max', 'cmi.core.lesson_location', 'cmi.suspend_data', 'cmi.core.session_time', 'cmi.core.total_time'],
  '2004': ['cmi.completion_status', 'cmi.success_status', 'cmi.score.scaled', 'cmi.score.raw', 'cmi.score.min', 'cmi.score.max', 'cmi.progress_measure', 'cmi.location', 'cmi.suspend_data', 'cmi.session_time', 'cmi.total_time'],
};
/** The SCORM 2004 suspend data size; anything longer is never sent. */
export const SCORM_SUSPEND_MAX = 64_000;

interface WindowLike {
  parent: WindowLike;
}
export interface ScormMessageEvent {
  origin: string;
  source: unknown;
  data: unknown;
}

/** True when `source` is the frame's window or a window nested inside it. */
function within(source: unknown, frame: WindowLike) {
  let w = source as WindowLike | null;
  for (let i = 0; w && i < 10; i++) {
    if (w === frame) return true;
    if (w.parent === w) return false;
    w = w.parent;
  }
  return false;
}

/** The allowed fields of a package's commit, or null when the message is not one we take. */
export function acceptScormMessage(ev: ScormMessageEvent, frame: WindowLike | null | undefined, launchUrl: string, itemId: string, version: '1.2' | '2004'): Record<string, string> | null {
  let content: string;
  try {
    content = new URL(launchUrl).origin;
  } catch {
    return null;
  }
  if (!frame || (ev.origin !== content && ev.origin !== 'null') || !within(ev.source, frame)) return null;
  const d = ev.data as { yxScorm?: unknown; item?: unknown; cmi?: unknown } | null;
  if (!d || typeof d !== 'object' || d.yxScorm !== 1 || d.item !== itemId || !d.cmi || typeof d.cmi !== 'object') return null;
  const cmi = d.cmi as Record<string, unknown>;
  if (typeof cmi['cmi.suspend_data'] === 'string' && cmi['cmi.suspend_data'].length > SCORM_SUSPEND_MAX) return null;
  const out: Record<string, string> = {};
  for (const k of SCORM_FIELDS[version]) {
    const v = Object.prototype.hasOwnProperty.call(cmi, k) ? cmi[k] : undefined;
    if ((typeof v === 'string' || typeof v === 'number') && String(v) !== '') out[k] = String(v);
  }
  return out;
}
