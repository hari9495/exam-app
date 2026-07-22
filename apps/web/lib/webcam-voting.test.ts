import { createViolationVoter } from './webcam-voting';

describe('createViolationVoter', () => {
  function pushAll(voter: ReturnType<typeof createViolationVoter>, seq: (string | null)[]) {
    return seq.map((r) => voter.push(r));
  }

  it('confirms when threshold of the same reason is reached in the window', () => {
    const v = createViolationVoter({ windowSize: 8, threshold: 5 });
    // 4 no_face then a 5th -> confirm on the 5th
    const out = pushAll(v, ['no_face', 'no_face', 'no_face', 'no_face', 'no_face']);
    expect(out).toEqual([null, null, null, null, 'no_face']);
  });

  it('does not confirm at 4 of 8', () => {
    const v = createViolationVoter({ windowSize: 8, threshold: 5 });
    const out = pushAll(v, ['no_face', null, 'no_face', null, 'no_face', null, 'no_face', null]);
    expect(out.every((r) => r === null)).toBe(true);
  });

  it('a single clean frame does not reset accumulated votes', () => {
    const v = createViolationVoter({ windowSize: 8, threshold: 5 });
    // 4 no_face, one clean, then two more no_face -> 6 of last 7 (window not yet full to 8) = confirm
    // (threshold of 5 is actually reached on the 6th push, i.e. the 2nd-to-last; assert
    // that a confirm happened somewhere in the sequence rather than pinning the exact index)
    const out = pushAll(v, ['no_face', 'no_face', 'no_face', 'no_face', null, 'no_face', 'no_face']);
    expect(out).toContain('no_face');
  });

  it('does not re-confirm during one continuous episode until a clean window re-arms', () => {
    const v = createViolationVoter({ windowSize: 8, threshold: 5 });
    const first = pushAll(v, ['no_face', 'no_face', 'no_face', 'no_face', 'no_face']); // confirm at index 4
    expect(first[4]).toBe('no_face');
    const during = pushAll(v, ['no_face', 'no_face', 'no_face', 'no_face', 'no_face', 'no_face', 'no_face', 'no_face']);
    expect(during.every((r) => r === null)).toBe(true); // still the same episode, no re-confirm
    const clean = pushAll(v, ['no_face', null, null, null, null, null, null, null]);
    // the count drops below threshold partway through this phase -> re-armed;
    // still returns null throughout (no reason ever re-crosses threshold here)
    expect(clean.every((r) => r === null)).toBe(true);
    const again = pushAll(v, ['no_face', 'no_face', 'no_face', 'no_face', 'no_face']); // fresh episode confirms
    expect(again[4]).toBe('no_face');
  });

  it('two interleaved reasons at 4/4 never confirm either', () => {
    const v = createViolationVoter({ windowSize: 8, threshold: 5 });
    const out = pushAll(v, ['no_face', 'head_turned', 'no_face', 'head_turned', 'no_face', 'head_turned', 'no_face', 'head_turned']);
    expect(out.every((r) => r === null)).toBe(true);
  });

  it('supports a larger window for looking_down (20 of 24)', () => {
    const v = createViolationVoter({ windowSize: 24, threshold: 20 });
    const seq = Array.from({ length: 19 }, () => 'looking_down');
    expect(pushAll(v, seq).every((r) => r === null)).toBe(true);
    expect(v.push('looking_down')).toBe('looking_down'); // 20th
  });
});
