import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField, useTooEarly } from '../../../components/field';
import { CodeField, TextField } from '../../../components/inputs';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { LoadState, PayDocument } from './types';

// Pay documents (P05, PAY-1.09 / 1.10) and exchange files (PAY-1.11): issued documents never change (a correction
// supersedes them), each has a reference without gaps, a SHA-256 and a public verify code; files carry their hash, rows
// and totals, download through a single-use link and are released by a second person.

const DOC_STATUS: Record<PayDocument['status'], { label: string; tone: BadgeTone }> = {
  issued: { label: 'Issued', tone: 'success' },
  superseded: { label: 'Superseded', tone: 'neutral' },
  awaiting_signature: {
    label: 'Waiting for the company signature',
    tone: 'warning',
  },
};

// ------------------------------------------------------------------------------------------ documents (the payroll list is the PAY-48 design: ../payroll-records.tsx)

function DocTable({ docs, showPerson, busy, onDownload, verifyUrl }: { docs: PayDocument[]; showPerson?: boolean; busy: string | null; onDownload: (d: PayDocument) => void; verifyUrl: (code: string) => string }) {
  return (
    <table className="yx-tim-table" aria-label="Pay documents">
      <thead>
        <tr>
          {showPerson && <th scope="col">Person</th>}
          <th scope="col">Document</th>
          <th scope="col">Reference</th>
          <th scope="col">Issued</th>
          <th scope="col">Status</th>
          <th scope="col">Check it</th>
          <th scope="col">
            <span className="yx-visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {docs.map((x) => (
          <tr key={x.id}>
            {showPerson && <td>{x.person}</td>}
            <th scope="row">{x.title}</th>
            <td className="yx-tim-note">{x.referenceNo}</td>
            <td>{dateText(x.issuedAt.slice(0, 10))}</td>
            <td>
              <Badge tone={DOC_STATUS[x.status].tone}>{DOC_STATUS[x.status].label}</Badge>
            </td>
            <td className="yx-tim-note">
              {x.verifyCode ? (
                <a href={verifyUrl(x.verifyCode)} target="_blank" rel="noreferrer">
                  {x.verifyCode}
                </a>
              ) : (
                ''
              )}
            </td>
            <td>
              {x.purged ? (
                <span className="yx-tim-note">Deleted after its retention period</span>
              ) : (
                <Button size="sm" loading={busy === x.id} onClick={() => onDownload(x)}>
                  Download PDF
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface MyPayDocumentsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: PayDocument[] | null;
  onDownload: (doc: PayDocument) => Promise<unknown>;
  verifyUrl: (code: string) => string;
  title?: string;
}

/** Me › Pay documents, and the alumni / nominee portal's list. */
export function MyPayDocumentsScreen(p: MyPayDocumentsScreenProps) {
  const { busy, error, run } = useRun();
  return (
    <LivePage title={p.title ?? 'My pay documents'} description="Your payslips and letters as issued. Anyone you give one to can check it with its code." state={p.state} onRetry={p.onRetry} what="your pay documents">
      {error && (
        <InlineAlert tone="danger" title="Not downloaded">
          {error}
        </InlineAlert>
      )}
      {p.data && (p.data.length ? <DocTable docs={p.data} busy={busy} onDownload={(x) => void run(x.id, () => p.onDownload(x))} verifyUrl={p.verifyUrl} /> : <EmptyState compact title="No pay documents yet" />)}
    </LivePage>
  );
}
