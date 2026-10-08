import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSaveErrors, type FormErrorItem } from './field';

const e = (fieldId: string): FormErrorItem => ({ fieldId, message: `${fieldId} is wrong` });

describe('useSaveErrors', () => {
  it('shows only fields invalid at the last Save, drops them when fixed, re-snapshots on the next Save', () => {
    const { result, rerender } = renderHook(({ errors }) => useSaveErrors(errors), { initialProps: { errors: [e('a')] } });
    expect(result.current.showErrors).toBe(false);
    expect(result.current.errorOf('a')).toBeUndefined();

    act(() => result.current.reveal());
    expect(result.current.errorOf('a')).toBe('a is wrong');
    expect(result.current.shownErrors).toEqual([e('a')]);

    // Typing in b makes it briefly invalid: no new error until the next Save.
    rerender({ errors: [e('a'), e('b')] });
    expect(result.current.errorOf('b')).toBeUndefined();
    expect(result.current.shownErrors).toEqual([e('a')]);

    // a fixed: its error goes straight away.
    rerender({ errors: [e('b')] });
    expect(result.current.errorOf('a')).toBeUndefined();
    expect(result.current.showErrors).toBe(false);

    act(() => result.current.reveal());
    expect(result.current.shownErrors).toEqual([e('b')]);

    act(() => result.current.reset());
    expect(result.current.shownErrors).toEqual([]);
  });

  it('can start revealed (stories)', () => {
    const { result } = renderHook(() => useSaveErrors([e('a')], true));
    expect(result.current.errorOf('a')).toBe('a is wrong');
  });
});
