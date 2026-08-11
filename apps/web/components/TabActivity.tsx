'use client';

import { useState } from 'react';
import { Modal, StatusBadge } from './ui';
import type { ProctoringAnalysisSummary, QuestionTabActivityEntry, TabActivityEventTypeSummary } from '../lib/types';

// background_app_detected/remote_access_suspected are the only two event types the AI names from
// a screenshot with no verification step -- confirmed in production to sometimes be wrong (a
// bookmarks-bar shortcut read as an open tab). Their labels are worded as a possibility, not a
// finding; the other six are plain client-observed browser events and stay factual.
const EVENT_TYPE_LABEL: Record<string, string> = {
  background_app_detected: 'Possible background app',
  remote_access_suspected: 'Possible remote access',
  tab_switch: 'Tab switch',
  window_blur: 'Window lost focus',
  screen_share_started: 'Screen share started',
  screen_share_stopped: 'Screen share stopped',
  copy_paste: 'Copy/paste',
  editor_paste: 'Pasted into editor',
};

function describeSummaryEntry(entry: TabActivityEventTypeSummary): string {
  const label = EVENT_TYPE_LABEL[entry.eventType] ?? entry.eventType;
  if (entry.toolCounts) {
    const names = Object.entries(entry.toolCounts)
      .map(([tool, count]) => `${tool} × ${count}`)
      .join(', ');
    return `${label}: ${names}`;
  }
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
  const hasAiGuesses = summary.some((entry) => Boolean(entry.toolCounts));
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
      {hasAiGuesses && (
        <p className="text-[11px] text-gray-400">App names are the AI's best guess from screen captures and may not always be exact.</p>
      )}
      {proctoringAnalysis?.summary && <p className="text-xs text-gray-600">{proctoringAnalysis.summary}</p>}
    </div>
  );
}

interface TabActivityBannerProps {
  entries: QuestionTabActivityEntry[];
}

interface GroupedBannerEntry {
  key: string;
  label: string;
  count: number;
  representative: QuestionTabActivityEntry;
}

function labelFor(eventType: string, toolName?: string): string {
  const typeLabel = EVENT_TYPE_LABEL[eventType] ?? eventType;
  // typeLabel already reads as a possibility for the two AI-named event types (see
  // EVENT_TYPE_LABEL), so the tool name itself is stated plainly rather than hedged twice.
  return toolName ? `${typeLabel}: ${toolName}` : typeLabel;
}

// ponytail: groups on eventType+toolName only, no time-window bucketing -- add if recruiters
// need to distinguish e.g. two separate WhatsApp detections minutes apart.
function groupBannerEntries(entries: QuestionTabActivityEntry[]): GroupedBannerEntry[] {
  const groups = new Map<string, GroupedBannerEntry>();
  for (const entry of entries) {
    const key = `${entry.eventType}::${entry.toolName ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      // Keep whichever occurrence in the group actually has expandable detail, so a click on a
      // grouped badge always surfaces something if any occurrence in the group had it.
      if (!existing.representative.reasoning && !existing.representative.screenshot && (entry.reasoning || entry.screenshot)) {
        existing.representative = entry;
      }
    } else {
      groups.set(key, { key, label: labelFor(entry.eventType, entry.toolName), count: 1, representative: entry });
    }
  }
  return [...groups.values()];
}

/** Compact banner above a question, one row per distinct event type/tool -- collapsed by default,
 *  click to see the AI's reasoning/screenshot when there is one. Placement is inferred from
 *  answer-save timing, not an exact link (see docs/superpowers/specs/2026-08-11-grading-tab-
 *  activity-insights-design.md), so every instance says so. */
export function TabActivityBanner({ entries }: TabActivityBannerProps) {
  const [expanded, setExpanded] = useState<QuestionTabActivityEntry | null>(null);
  if (entries.length === 0) {
    return null;
  }
  return (
    <>
      <div className="mb-2 flex flex-col gap-1">
        {groupBannerEntries(entries).map((group) => {
          const canExpand = Boolean(group.representative.reasoning || group.representative.screenshot);
          return (
            <button
              key={group.key}
              type="button"
              disabled={!canExpand}
              onClick={() => setExpanded(group.representative)}
              className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-left text-xs text-amber-800 disabled:cursor-default"
            >
              <StatusBadge tone="warning">{group.label}{group.count > 1 ? ` × ${group.count}` : ''}</StatusBadge>
              <span>detected around this question — estimated timing{canExpand ? ', click for detail' : ''}</span>
            </button>
          );
        })}
      </div>
      <Modal open={expanded !== null} title={expanded ? labelFor(expanded.eventType, expanded.toolName) : ''} onClose={() => setExpanded(null)}>
        {expanded?.reasoning && (
          <>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">AI-generated observation — may not be fully accurate</p>
            <p className="mb-3 text-sm text-gray-700">{expanded.reasoning}</p>
          </>
        )}
        {expanded?.screenshot && <img src={expanded.screenshot} alt="Screen capture" className="w-full rounded" />}
      </Modal>
    </>
  );
}
