export interface ViolationVoterOptions {
  windowSize: number;
  threshold: number;
}

export interface ViolationVoter {
  push(reason: string | null): string | null;
}

// Debounces raw per-sample detections into confirmed violations by majority vote
// over a trailing window. A confirmed episode reports once: a reason fires the moment
// its count in the window crosses up to `threshold` (edge-triggered), and re-arms as
// soon as its count drops back below `threshold` -- so one continuous episode confirms
// once, and a fresh episode of the same reason can confirm again later.
//
// ponytail: re-arming on "count < threshold" rather than literally waiting for a fully
// clean window -- with a trailing window, a single stale sample can linger in the buffer
// indefinitely (replaced one-for-one by fresh violations) and a "must see zero" rule can
// never re-arm in that case. Falling back below threshold is the correct signal that the
// episode has ended.
export function createViolationVoter({ windowSize, threshold }: ViolationVoterOptions): ViolationVoter {
  const buffer: (string | null)[] = [];
  const latched = new Set<string>();

  return {
    push(reason: string | null): string | null {
      buffer.push(reason);
      if (buffer.length > windowSize) buffer.shift();

      // Count occurrences of each non-null reason in the current window.
      const counts = new Map<string, number>();
      for (const r of buffer) {
        if (r !== null) counts.set(r, (counts.get(r) ?? 0) + 1);
      }

      // Drop the latch for any reason that's fallen back below threshold (re-arm).
      for (const r of latched) {
        if ((counts.get(r) ?? 0) < threshold) latched.delete(r);
      }

      // Fire for the first reason that newly crosses up to threshold this push.
      let confirmed: string | null = null;
      for (const [r, count] of counts) {
        if (count >= threshold && !latched.has(r)) {
          latched.add(r);
          if (confirmed === null) confirmed = r;
        }
      }
      return confirmed;
    },
  };
}
