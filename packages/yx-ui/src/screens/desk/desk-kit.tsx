import { type ReactNode, useState } from 'react';
import { Copy, Lock, Star } from 'lucide-react';
import { Button } from '../../components/button';
import { TextField } from '../../components/inputs';
import { Badge, type BadgeTone } from '../../components/display';
import { ErrorState, NoAccessState, Skeleton } from '../../components/feedback';
import { PageHeader } from '../../components/shell';
import { formatDate } from '../../lib/format';
import type { LoadState, SystemState } from './types';

// Pieces shared by the Service Desk screens: plain words for states and priorities, the page frame, small helpers.

export const STATE_LABEL: Record<SystemState, string> = { new: 'New', open: 'Open', pending: 'Waiting', on_hold: 'On hold', solved: 'Resolved', closed: 'Closed' };
const STATE_TONE: Record<SystemState, BadgeTone> = { new: 'info', open: 'neutral', pending: 'warning', on_hold: 'warning', solved: 'success', closed: 'neutral' };
const PRIORITY_TONE: Record<number, BadgeTone> = { 1: 'danger', 2: 'warning', 3: 'neutral', 4: 'neutral' };
export const PRIORITY_LABEL: Record<number, string> = { 1: 'P1 · Urgent', 2: 'P2 · High', 3: 'P3 · Normal', 4: 'P4 · Low' };
export const OPEN_STATES: SystemState[] = ['new', 'open', 'pending', 'on_hold'];

/** A desk's own status label, coloured by its fixed system state (YX-SD-02). */
export function StatusBadge({ label, state }: { label: string; state: SystemState }) {
  return <Badge tone={STATE_TONE[state]}>{label || STATE_LABEL[state]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: number }) {
  return <Badge tone={PRIORITY_TONE[priority] ?? 'neutral'}>{PRIORITY_LABEL[priority] ?? `P${priority}`}</Badge>;
}

/** Private, sensitive and VIP marks, each in words (never colour alone). */
export function TicketFlags({ sensitive, private: isPrivate, vip, unverified }: { sensitive?: boolean; private?: boolean; vip?: boolean; unverified?: boolean }) {
  return (
    <>
      {unverified && <Badge tone="warning">Not verified</Badge>}
      {(sensitive || isPrivate) && (
        <Badge tone="neutral">
          <Lock aria-hidden size={12} /> {sensitive ? 'Sensitive' : 'Private'}
        </Badge>
      )}
      {vip && (
        <Badge tone="info">
          <Star aria-hidden size={12} /> VIP
        </Badge>
      )}
    </>
  );
}

/** "8 Oct 2026, 3:42 pm" in the viewer's own time zone, or in `timeZone` when given (an IANA name). */
export function when(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, ...(timeZone ? { timeZone } : {}) }).format(d);
  if (!timeZone) return `${formatDate(d)}, ${time}`;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${formatDate(new Date(Number(p.year), Number(p.month) - 1, Number(p.day)))}, ${time}`;
}

/** The browser's own time zone, the fallback when the account has none. */
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A value to copy, with its own button (DNS records, webhook addresses). */
export function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="yx-ops-row">
      <TextField size="sm" aria-label={label} value={value} readOnly onFocus={(e) => e.currentTarget.select()} />
      <Button
        size="sm"
        icon={Copy}
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).catch(() => undefined);
          setCopied(true);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  );
}

/** "1 h 25 min". */
export function minutesText(m: number): string {
  const h = Math.floor(m / 60);
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

export const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Fills a saved reply's variables (US-B-090). Values are escaped: a requester's name can never become markup. */
export function fillCanned(html: string, vars: { firstName: string; number: string; agent: string }): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return html
    .replace(/\{\{\s*requester\.first_name\s*\}\}/g, esc(vars.firstName))
    .replace(/\{\{\s*ticket\.number\s*\}\}/g, esc(vars.number))
    .replace(/\{\{\s*agent\.name\s*\}\}/g, esc(vars.agent));
}

/** The page frame with loading, error and no-access states. */
export function DeskPage({ title, description, actions, state, onRetry, what, grantedBy = 'your Service Desk admin', children }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; state: LoadState; onRetry?: () => void; what: string; grantedBy?: string; children: ReactNode }) {
  return (
    <div className="yx-auth__page yx-desk">
      {title && <PageHeader title={title} description={description} actions={state === 'ready' ? actions : undefined} />}
      {state === 'loading' && (
        <div className="yx-ops-stack" aria-busy="true" aria-label={`Loading ${what}`}>
          <Skeleton height={48} />
          <Skeleton height={240} />
        </div>
      )}
      {state === 'error' && <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy={grantedBy} what={what} />}
      {state === 'ready' && children}
    </div>
  );
}

/** Ticket text already cleaned by the server's allow-list (§14.2); shown as formatted text. */
export function MessageBody({ html }: { html: string }) {
  return <div className="yx-desk-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
