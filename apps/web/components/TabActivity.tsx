'use client';

import { useState } from 'react';
import { Modal, StatusBadge } from './ui';
import type { ProctoringAnalysisSummary, QuestionTabActivityEntry, TabActivityEventTypeSummary } from '../lib/types';

const EVENT_TYPE_LABEL: Record<string, string> = {
  background_app_detected: 'Background app detected',
  remote_access_suspected: 'Possible remote access',
  tab_switch: 'Tab switch',
  window_blur: 'Window lost focus',
  screen_share_started: 'Screen share started',
  screen_share_stopped: 'Screen share stopped',
  copy_paste: 'Copy/paste',
  editor_paste: 'Pasted into editor',
};

function describeSummaryEntry(entry: TabActivityEventTypeSummary): string {
  if (entry.toolCounts) {
    return Object.entries(entry.toolCounts)
      .map(([tool, count]) => `${tool} × ${count}`)
      .join(', ');
  }
  const label = EVENT_TYPE_LABEL[entry.eventType] ?? entry.eventType;
  return `${label} × ${entry.count}`;
}

/** Whether there is anything at all to show for an attempt -- the caller uses this to decide
 *  whether to render its own section/heading, so the "no '0 detected' noise" rule lives in one
 *  place instead of being re-derived at every call site. */
export function hasTabActivityContent(
  summary: TabActivityEventTypeSummary[],
  proctoringAnalysis?: ProctoringAnalysisSummary | null,
): boolean {
  return summary.length > 0 || Boolean(proctoringAnalysis?.summary);
}

interface TabActivitySummaryCardProps {
  summary: TabActivityEventTypeSummary[];
  proctoringAnalysis?: ProctoringAnalysisSummary | null;
}

/** Grouped counts of background apps / tab switches / screen-share toggles / out-of-editor pastes
 *  seen during an attempt, plus the AI's own narrative about the same evidence -- that narrative
 *  is already generated (ProctoringAnalysis.summary) but was never rendered anywhere until this
 *  component. Always renders its content once mounted; call hasTabActivityContent first to decide
 *  whether to render this (and any surrounding heading) at all. */
export function TabActivitySummaryCard({ summary, proctoringAnalysis }: TabActivitySummaryCardProps) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {summary.length > 0 && (
        <ul className="flex flex-col gap-1">
          {summary.map((entry) => (
            <li key={entry.eventType} className="text-gray-700">
              {describeSummaryEntry(entry)}
            </li>
          ))}
        </ul>
      )}
      {proctoringAnalysis?.summary && <p className="text-xs text-gray-600">{proctoringAnalysis.summary}</p>}
    </div>
  );
}

interface TabActivityBannerProps {
  entries: QuestionTabActivityEntry[];
}

/** Compact banner above a question, one line per attributed event -- collapsed by default, click
 *  to see the AI's reasoning/screenshot when there is one. Placement is inferred from answer-save
 *  timing, not an exact link (see docs/superpowers/specs/2026-08-11-grading-tab-activity-insights-
 *  design.md), so every instance says so. */
export function TabActivityBanner({ entries }: TabActivityBannerProps) {
  const [expanded, setExpanded] = useState<QuestionTabActivityEntry | null>(null);
  if (entries.length === 0) {
    return null;
  }
  return (
    <>
      <div className="mb-2 flex flex-col gap-1">
        {entries.map((entry, index) => {
          const label = entry.toolName ?? EVENT_TYPE_LABEL[entry.eventType] ?? entry.eventType;
          const canExpand = Boolean(entry.reasoning || entry.screenshot);
          return (
            <button
              key={index}
              type="button"
              disabled={!canExpand}
              onClick={() => setExpanded(entry)}
              className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-left text-xs text-amber-800 disabled:cursor-default"
            >
              <StatusBadge tone="warning">{label}</StatusBadge>
              <span>detected around this question — estimated timing{canExpand ? ', click for detail' : ''}</span>
            </button>
          );
        })}
      </div>
      <Modal open={expanded !== null} title={expanded?.toolName ?? expanded?.eventType ?? ''} onClose={() => setExpanded(null)}>
        {expanded?.reasoning && <p className="mb-3 text-sm text-gray-700">{expanded.reasoning}</p>}
        {expanded?.screenshot && <img src={expanded.screenshot} alt="Screen capture" className="w-full rounded" />}
      </Modal>
    </>
  );
}
