import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { useSay } from './ops-kit';

// Answer 802: done() is a success toast, fail() an error toast, say() a neutral note (or runs the action).
function Probe({ run }: { run: (s: ReturnType<typeof useSay>) => void }) {
  const s = useSay();
  return <button onClick={() => run(s)}>go</button>;
}
const toneOf = (text: string) => screen.getAllByText(text).map((e) => e.closest('.yx-toast')?.getAttribute('data-tone')).find(Boolean);
const show = (run: (s: ReturnType<typeof useSay>) => void) => render(<ToastProvider><Probe run={run} /></ToastProvider>);

describe('useSay (ops)', () => {
  it('done is a success toast; fail an error toast', () => {
    show((s) => (s.done('Contractor added'), s.fail('Could not save')));
    act(() => screen.getByText('go').click());
    expect(toneOf('Contractor added')).toBe('success');
    expect(toneOf('Could not save')).toBe('error');
  });

  it('say with a reason is a note and does not act; without one it acts', () => {
    let acted = 0;
    show((s) => (s.say('Wait for the reply.', () => acted++), s.say(false, () => acted++)));
    act(() => screen.getByText('go').click());
    expect(toneOf('Wait for the reply.')).toBe('default');
    expect(acted).toBe(1);
  });
});
