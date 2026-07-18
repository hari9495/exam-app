import { useEffect, useRef } from 'react';
import { useReportProctoringEvent } from './useAttempt';
import { AnswerTelemetry } from '../types';

const ACTIVE_TICK_MS = 5000;
const PASTE_FALLBACK_CHARS = 20;
const PASTE_EVENT_THRESHOLD_CHARS = 200;

// ponytail: minimal shape of the monaco editor instance we actually touch —
// avoids pulling the full monaco-editor type package in as a dependency.
export interface MonacoEditor {
  getValue: () => string;
  onDidPaste: (listener: (event: unknown) => void) => void;
  onDidChangeModelContent: (listener: (event: { changes: { text: string; rangeLength: number }[] }) => void) => void;
}

interface TelemetryRecord {
  keystrokeChars: number;
  pastedChars: number;
  pasteCount: number;
  largestPasteChars: number;
  secondsToFirstEdit: number;
  activeSeconds: number;
  runCount: number;
  openedAt: number;
  firstEditAt: number | null;
}

function emptyRecord(): TelemetryRecord {
  return {
    keystrokeChars: 0,
    pastedChars: 0,
    pasteCount: 0,
    largestPasteChars: 0,
    secondsToFirstEdit: 0,
    activeSeconds: 0,
    runCount: 0,
    openedAt: Date.now(),
    firstEditAt: null,
  };
}

export function useEditorTelemetry(questionId: string | null) {
  const records = useRef<Record<string, TelemetryRecord>>({});
  const questionIdRef = useRef(questionId);
  const pasteFlagRef = useRef(false);
  // Single shared Monaco model persists across question navigation (one <Editor>
  // instance, controlled `value`). Switching questions makes the library push the
  // new value in via a synthetic executeEdits() full-range replace, which fires
  // onDidChangeModelContent same as a real edit. These two refs let the next
  // change event be identified as that synthetic swap (rather than a real paste/
  // keystroke) so it isn't counted or attributed to the question being left.
  const expectProgrammaticSwapRef = useRef(false);
  const modelLengthRef = useRef(0);
  const previousQuestionIdRef = useRef<string | null | undefined>(undefined);
  const reportEvent = useReportProctoringEvent();
  const reportEventRef = useRef(reportEvent);
  reportEventRef.current = reportEvent;
  questionIdRef.current = questionId;

  function getOrCreateRecord(qid: string): TelemetryRecord {
    return records.current[qid] ?? (records.current[qid] = emptyRecord());
  }

  useEffect(() => {
    if (questionId) getOrCreateRecord(questionId);
    // undefined sentinel = first render; a real switch is any change after that.
    if (previousQuestionIdRef.current !== undefined && previousQuestionIdRef.current !== questionId) {
      expectProgrammaticSwapRef.current = true;
    }
    previousQuestionIdRef.current = questionId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  useEffect(() => {
    const interval = setInterval(() => {
      const qid = questionIdRef.current;
      if (!qid || document.visibilityState !== 'visible') return;
      getOrCreateRecord(qid).activeSeconds += ACTIVE_TICK_MS / 1000;
    }, ACTIVE_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  function onEditorMount(editor: MonacoEditor) {
    // Seed with the model's actual starting length (e.g. starter code already
    // loaded) so the very first question switch's full-range-replace check has
    // a real baseline to compare rangeLength against, not an assumed 0.
    modelLengthRef.current = editor.getValue().length;
    editor.onDidPaste(() => {
      pasteFlagRef.current = true;
    });
    editor.onDidChangeModelContent((event) => {
      const changes = event.changes ?? [];
      const priorModelLength = modelLengthRef.current;
      modelLengthRef.current = changes.reduce((len, change) => len - change.rangeLength + change.text.length, priorModelLength);

      if (expectProgrammaticSwapRef.current) {
        expectProgrammaticSwapRef.current = false; // never swallow more than one event
        // Monaco's controlled-value sync signature: one change whose rangeLength
        // covers everything that was in the model before this edit landed.
        const isFullRangeReplace = priorModelLength > 0 && changes.length === 1 && changes[0].rangeLength === priorModelLength;
        if (isFullRangeReplace) return; // programmatic swap: don't count it, don't touch firstEditAt
        // Flag was set but this doesn't look synthetic (e.g. old/new values were
        // identical so no sync fired) — fall through and treat it as a real edit.
      }

      const qid = questionIdRef.current;
      if (!qid) return;
      const record = getOrCreateRecord(qid);
      if (record.firstEditAt === null) {
        record.firstEditAt = Date.now();
        record.secondsToFirstEdit = Math.round((record.firstEditAt - record.openedAt) / 1000);
      }

      const insertedChars = changes.reduce((sum, change) => sum + change.text.length, 0);
      const isPaste = pasteFlagRef.current;
      pasteFlagRef.current = false;
      if (insertedChars <= 0) return;

      const isFallbackPaste = changes.length === 1 && changes[0].text.length > PASTE_FALLBACK_CHARS;
      if (isPaste || isFallbackPaste) {
        record.pastedChars += insertedChars;
        record.pasteCount += 1;
        record.largestPasteChars = Math.max(record.largestPasteChars, insertedChars);
        if (insertedChars >= PASTE_EVENT_THRESHOLD_CHARS) {
          reportEventRef.current('editor_paste', { chars: insertedChars, questionId: qid });
        }
      } else {
        record.keystrokeChars += insertedChars;
      }
    });
  }

  function recordRun() {
    const qid = questionIdRef.current;
    if (!qid) return;
    getOrCreateRecord(qid).runCount += 1;
  }

  function snapshot(): AnswerTelemetry | undefined {
    const qid = questionIdRef.current;
    if (!qid) return undefined;
    const record = records.current[qid];
    if (!record) return undefined;
    return {
      keystrokeChars: Math.floor(record.keystrokeChars),
      pastedChars: Math.floor(record.pastedChars),
      pasteCount: Math.floor(record.pasteCount),
      largestPasteChars: Math.floor(record.largestPasteChars),
      secondsToFirstEdit: Math.floor(record.secondsToFirstEdit),
      activeSeconds: Math.floor(record.activeSeconds),
      runCount: Math.floor(record.runCount),
    };
  }

  return { onEditorMount, recordRun, snapshot };
}
