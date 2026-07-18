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
    fireChange: (text: string) => {
      changeListener?.({ changes: [{ text }] });
    },
  };
}

// Fakes the two separate effects @monaco-editor/react's <Editor> runs internally when
// given a `path` prop (verified against node_modules/@monaco-editor/react/dist/index.mjs,
// v4.7.0):
//   1. model effect (deps: [path]) — h(monaco, value, language, path), which is
//      `getModel(uri) ?? createModel(value, language, uri)`, then `editor.setModel(model)`.
//      setModel() never fires onDidChangeModelContent.
//   2. value-sync effect (deps: [value]) — only calls `executeEdits(...)` (which DOES
//      emit onDidChangeModelContent) when `value !== model.getValue()`.
// A brand-new path's model is created with that path's own current value, and a
// revisited path's model already holds content the app kept in sync via onChange —
// so step 2's guard is false on every bare question switch, and no event ever fires.
// This is the mechanism `path={question.id}` in page.tsx relies on (replacing the
// single shared model the previous suppress-flag heuristic had to work around).
function createPathAwareMockEditor() {
  const modelsByPath = new Map<string, string>();
  let currentPath: string | undefined;
  let pasteListener: ((event: unknown) => void) | undefined;
  let changeListener: ((event: { changes: { text: string; rangeLength: number }[] }) => void) | undefined;

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
    // Mirrors the model effect then the value-sync effect firing in sequence for a
    // question switch (or the initial mount).
    switchQuestion: (path: string, value: string) => {
      if (!modelsByPath.has(path)) modelsByPath.set(path, value); // createModel(value)
      currentPath = path; // setModel() — no event
      const current = modelsByPath.get(path)!;
      if (value !== current) {
        const rangeLength = current.length;
        modelsByPath.set(path, value);
        changeListener?.({ changes: [{ text: value, rangeLength }] });
      }
    },
    // A real user edit (typed or pasted) on whichever question is current.
    fireChange: (text: string, rangeLength = 0) => {
      const prior = modelsByPath.get(currentPath!) ?? '';
      modelsByPath.set(currentPath!, prior + text);
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

  // Regression coverage for the false-paste-on-question-switch bug. The fix is
  // structural (page.tsx gives <Editor> a `path={question.id}` prop, so each
  // question gets its own Monaco model — see createPathAwareMockEditor above for
  // the library-source evidence), so these tests exercise the hook against a fake
  // that reproduces that per-path model behavior rather than any suppress-flag
  // heuristic in the hook itself (there no longer is one).
  describe('question switch with per-path Monaco models', () => {
    it('a question switch with differing content fires no change event and is not counted', () => {
      const mock = createPathAwareMockEditor();
      const { result, rerender } = renderHook(({ questionId }) => useEditorTelemetry(questionId), {
        initialProps: { questionId: 'q1' as string | null },
      });
      act(() => result.current.onEditorMount(mock.editor));
      act(() => mock.switchQuestion('q1', 'starter code for q1'));

      rerender({ questionId: 'q2' });
      act(() => mock.switchQuestion('q2', 'completely different starter code for q2'));

      expect(result.current.snapshot()).toMatchObject({
        pasteCount: 0,
        pastedChars: 0,
        keystrokeChars: 0,
        secondsToFirstEdit: 0,
      });
      expect(report).not.toHaveBeenCalled();
    });

    it('a select-all-paste immediately after a question switch IS counted as a paste and reported', () => {
      const mock = createPathAwareMockEditor();
      const { result, rerender } = renderHook(({ questionId }) => useEditorTelemetry(questionId), {
        initialProps: { questionId: 'q1' as string | null },
      });
      act(() => result.current.onEditorMount(mock.editor));
      act(() => mock.switchQuestion('q1', 'x'.repeat(50)));

      rerender({ questionId: 'q2' });
      act(() => mock.switchQuestion('q2', 'y'.repeat(50))); // q2's own starter code, no event

      // Candidate selects all 50 starter chars and pastes 250 chars over them —
      // a single change whose rangeLength equals the entire prior content, the
      // exact shape the old heuristic mistook for a programmatic swap.
      act(() => {
        mock.firePaste();
        mock.fireChange('z'.repeat(250), 50);
      });

      expect(result.current.snapshot()).toMatchObject({ pastedChars: 250, pasteCount: 1, largestPasteChars: 250 });
      expect(report).toHaveBeenCalledWith('editor_paste', { chars: 250, questionId: 'q2' });
    });

    it('a real paste on the same question (no switch) is still counted', () => {
      const mock = createPathAwareMockEditor();
      const { result } = renderHook(() => useEditorTelemetry('q1'));
      act(() => result.current.onEditorMount(mock.editor));
      act(() => mock.switchQuestion('q1', ''));

      act(() => {
        mock.firePaste();
        mock.fireChange('b'.repeat(250), 0);
      });

      expect(result.current.snapshot()).toMatchObject({ pastedChars: 250, pasteCount: 1 });
      expect(report).toHaveBeenCalledWith('editor_paste', { chars: 250, questionId: 'q1' });
    });

    it('secondsToFirstEdit for the new question is measured from its own open time', () => {
      const mock = createPathAwareMockEditor();
      const { result, rerender } = renderHook(({ questionId }) => useEditorTelemetry(questionId), {
        initialProps: { questionId: 'q1' as string | null },
      });
      act(() => result.current.onEditorMount(mock.editor));
      act(() => mock.switchQuestion('q1', 'x'.repeat(50)));

      rerender({ questionId: 'q2' });
      act(() => mock.switchQuestion('q2', 'y'.repeat(50))); // no event, no firstEditAt set

      act(() => {
        jest.advanceTimersByTime(4000);
        mock.fireChange('z', 0); // candidate's first real keystroke on q2
      });

      expect(result.current.snapshot()).toMatchObject({ secondsToFirstEdit: 4 });
    });
  });
});
