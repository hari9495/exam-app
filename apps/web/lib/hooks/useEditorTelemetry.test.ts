import { act, renderHook } from '@testing-library/react';
import * as useAttemptModule from './useAttempt';
import { useEditorTelemetry, MonacoEditor } from './useEditorTelemetry';

function createMockEditor() {
  let pasteListener: ((event: unknown) => void) | undefined;
  let changeListener: ((event: { changes: { text: string }[] }) => void) | undefined;
  const editor: MonacoEditor = {
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
    fireChange: (text: string) => changeListener?.({ changes: [{ text }] }),
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
});
