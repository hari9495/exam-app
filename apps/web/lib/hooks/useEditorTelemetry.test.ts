import { act, renderHook } from '@testing-library/react';
import * as useAttemptModule from './useAttempt';
import { useEditorTelemetry, MonacoEditor } from './useEditorTelemetry';

function createMockEditor(initialValue = '') {
  let pasteListener: ((event: unknown) => void) | undefined;
  let changeListener: ((event: { changes: { text: string; rangeLength: number }[] }) => void) | undefined;
  let value = initialValue;
  const editor: MonacoEditor = {
    getValue: () => value,
    onDidPaste: (listener) => {
      pasteListener = listener;
    },
    onDidChangeModelContent: (listener) => {
      changeListener = listener;
    },
  };
  return {
    editor,
    firePaste: () => pasteListener?.({}),
    // Simulates typing/pasting `text` in place of `rangeLength` existing chars.
    // Keeps `value` (what getValue()/a future mount would see) in sync so tests
    // can chain multiple edits realistically.
    fireChange: (text: string, rangeLength = 0) => {
      value = text;
      changeListener?.({ changes: [{ text, rangeLength }] });
    },
    // Simulates Monaco's own synthetic full-model-range replace: a single change
    // whose rangeLength equals the entire current model content length.
    fireFullReplace: (text: string) => {
      const rangeLength = value.length;
      value = text;
      changeListener?.({ changes: [{ text, rangeLength }] });
    },
  };
}

describe('useEditorTelemetry', () => {
  let report: jest.Mock;

  beforeEach(() => {
    report = jest.fn();
    jest.spyOn(useAttemptModule, 'useReportProctoringEvent').mockReturnValue(report);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('accumulates keystrokeChars for small, non-pasted changes', () => {
    const { result } = renderHook(() => useEditorTelemetry('q1'));
    const mock = createMockEditor();
    act(() => result.current.onEditorMount(mock.editor));

    act(() => {
      mock.fireChange('a');
      mock.fireChange('bc');
    });

    expect(result.current.snapshot()).toMatchObject({ keystrokeChars: 3, pastedChars: 0, pasteCount: 0 });
  });

  it('accumulates pastedChars/pasteCount/largestPasteChars for a paste-flagged change', () => {
    const { result } = renderHook(() => useEditorTelemetry('q1'));
    const mock = createMockEditor();
    act(() => result.current.onEditorMount(mock.editor));

    act(() => {
      mock.firePaste();
      mock.fireChange('a'.repeat(50));
    });

    const snap = result.current.snapshot();
    expect(snap).toMatchObject({ pastedChars: 50, pasteCount: 1, largestPasteChars: 50, keystrokeChars: 0 });
  });

  it('treats a single large change (>20 chars) as a paste even without onDidPaste firing', () => {
    const { result } = renderHook(() => useEditorTelemetry('q1'));
    const mock = createMockEditor();
    act(() => result.current.onEditorMount(mock.editor));

    act(() => {
      mock.fireChange('x'.repeat(30));
    });

    expect(result.current.snapshot()).toMatchObject({ pastedChars: 30, pasteCount: 1 });
  });

  it('fires the editor_paste proctoring event when a paste is >= 200 chars', () => {
    const { result } = renderHook(() => useEditorTelemetry('q1'));
    const mock = createMockEditor();
    act(() => result.current.onEditorMount(mock.editor));

    act(() => {
      mock.firePaste();
      mock.fireChange('a'.repeat(200));
    });

    expect(report).toHaveBeenCalledWith('editor_paste', { chars: 200, questionId: 'q1' });
  });

  it('does not fire the editor_paste event for a paste below 200 chars', () => {
    const { result } = renderHook(() => useEditorTelemetry('q1'));
    const mock = createMockEditor();
    act(() => result.current.onEditorMount(mock.editor));

    act(() => {
      mock.firePaste();
      mock.fireChange('a'.repeat(199));
    });

    expect(report).not.toHaveBeenCalled();
  });

  it('recordRun increments runCount', () => {
    const { result } = renderHook(() => useEditorTelemetry('q1'));

    act(() => {
      result.current.recordRun();
      result.current.recordRun();
    });

    expect(result.current.snapshot()).toMatchObject({ runCount: 2 });
  });

  it('sets secondsToFirstEdit from the first content change', () => {
    const { result } = renderHook(() => useEditorTelemetry('q1'));
    const mock = createMockEditor();
    act(() => result.current.onEditorMount(mock.editor));

    act(() => {
      jest.advanceTimersByTime(3000);
      mock.fireChange('a');
    });

    expect(result.current.snapshot()).toMatchObject({ secondsToFirstEdit: 3 });
  });

  it('accrues activeSeconds every 5s while visible, and returns integer snapshot values', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const { result } = renderHook(() => useEditorTelemetry('q1'));

    act(() => {
      jest.advanceTimersByTime(15000);
    });

    const snap = result.current.snapshot();
    expect(snap?.activeSeconds).toBe(15);
    Object.values(snap ?? {}).forEach((value) => expect(Number.isInteger(value)).toBe(true));
  });

  it('does not accrue activeSeconds while the document is hidden', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const { result } = renderHook(() => useEditorTelemetry('q1'));

    act(() => {
      jest.advanceTimersByTime(15000);
    });

    expect(result.current.snapshot()?.activeSeconds).toBe(0);
  });

  it('returns undefined from snapshot when there is no active question', () => {
    const { result } = renderHook(() => useEditorTelemetry(null));
    expect(result.current.snapshot()).toBeUndefined();
  });

  it('keeps per-question aggregates separate and monotonic across question switches', () => {
    const { result, rerender } = renderHook(({ questionId }) => useEditorTelemetry(questionId), {
      initialProps: { questionId: 'q1' as string | null },
    });
    const mock = createMockEditor();
    act(() => result.current.onEditorMount(mock.editor));

    act(() => mock.fireChange('ab'));
    expect(result.current.snapshot()).toMatchObject({ keystrokeChars: 2 });

    rerender({ questionId: 'q2' });
    expect(result.current.snapshot()).toMatchObject({ keystrokeChars: 0 });

    rerender({ questionId: 'q1' });
    expect(result.current.snapshot()).toMatchObject({ keystrokeChars: 2 });
  });

  // Regression coverage for the false-paste-on-question-switch bug: the single
  // shared Monaco model persists across questions, and switching questions makes
  // @monaco-editor/react sync the new `value` in via a synthetic full-range
  // executeEdits() replace, which fires onDidChangeModelContent just like a real
  // edit. These tests pin down that the hook tells that synthetic sync apart from
  // real typing/pasting.
  describe('programmatic value-swap on question switch', () => {
    it('ignores a synthetic full-range replace: no pasteCount/pastedChars, no proctoring event, no secondsToFirstEdit', () => {
      const mock = createMockEditor('x'.repeat(50)); // starter code already loaded in the model
      const { result, rerender } = renderHook(({ questionId }) => useEditorTelemetry(questionId), {
        initialProps: { questionId: 'q1' as string | null },
      });
      act(() => result.current.onEditorMount(mock.editor));

      rerender({ questionId: 'q2' });
      act(() => {
        mock.fireFullReplace('y'.repeat(500));
      });

      expect(result.current.snapshot()).toMatchObject({
        pasteCount: 0,
        pastedChars: 0,
        keystrokeChars: 0,
        secondsToFirstEdit: 0,
      });
      expect(report).not.toHaveBeenCalled();
    });

    it('does not swallow a real paste when the expected synthetic swap never fires (flag never eats more than one event)', () => {
      const mock = createMockEditor('x'.repeat(50));
      const { result, rerender } = renderHook(({ questionId }) => useEditorTelemetry(questionId), {
        initialProps: { questionId: 'q1' as string | null },
      });
      act(() => result.current.onEditorMount(mock.editor));

      // Switch questions but the library never emits a sync event (e.g. old and
      // new values happened to be identical) — the very next event is real.
      rerender({ questionId: 'q2' });
      act(() => {
        mock.firePaste();
        mock.fireChange('a'.repeat(300), 0);
      });

      expect(result.current.snapshot()).toMatchObject({ pastedChars: 300, pasteCount: 1, largestPasteChars: 300 });
      expect(report).toHaveBeenCalledWith('editor_paste', { chars: 300, questionId: 'q2' });
    });

    it('still counts a real paste >= 200 chars on the same question when there is no switch', () => {
      const mock = createMockEditor('x'.repeat(50));
      const { result } = renderHook(() => useEditorTelemetry('q1'));
      act(() => result.current.onEditorMount(mock.editor));

      act(() => {
        mock.firePaste();
        mock.fireChange('b'.repeat(250), 0);
      });

      expect(result.current.snapshot()).toMatchObject({ pastedChars: 250, pasteCount: 1 });
      expect(report).toHaveBeenCalledWith('editor_paste', { chars: 250, questionId: 'q1' });
    });

    it('sets secondsToFirstEdit for the new question from its own open time, unaffected by the ignored synthetic swap', () => {
      const mock = createMockEditor('x'.repeat(50));
      const { result, rerender } = renderHook(({ questionId }) => useEditorTelemetry(questionId), {
        initialProps: { questionId: 'q1' as string | null },
      });
      act(() => result.current.onEditorMount(mock.editor));

      rerender({ questionId: 'q2' });
      act(() => {
        mock.fireFullReplace('y'.repeat(500)); // swallowed — must not set firstEditAt
      });

      act(() => {
        jest.advanceTimersByTime(4000);
        mock.fireChange('z', 0); // candidate's first real keystroke on q2
      });

      expect(result.current.snapshot()).toMatchObject({ secondsToFirstEdit: 4 });
    });
  });
});
