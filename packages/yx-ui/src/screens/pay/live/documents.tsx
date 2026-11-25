import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField, useTooEarly } from '../../../components/field';
import { PlainTable } from '../../../components/plain-table';
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
    <PlainTable
      label="Pay documents"
      rows={docs}
      getRowId={(x) => x.id}
      columns={[
        ...(showPerson ? [{ key: 'person', header: 'Person', cell: (x: PayDocument) => x.person }] : []),
        { key: 'doc', header: 'Document', rowHeader: true, cell: (x) => x.title },
        { key: 'ref', header: 'Reference', cell: (x) => <span className="yx-tim-note">{x.referenceNo}</span> },
        { key: 'issued', header: 'Issued', cell: (x) => dateText(x.issuedAt.slice(0, 10)) },
        { key: 'status', header: 'Status', cell: (x) => <Badge tone={DOC_STATUS[x.status].tone}>{DOC_STATUS[x.status].label}</Badge> },
        {
          key: 'check',
          header: 'Check it',
          cell: (x) => (
            <span className="yx-tim-note">
              {x.verifyCode ? (
                <a href={verifyUrl(x.verifyCode)} target="_blank" rel="noreferrer">
                  {x.verifyCode}
                </a>
              ) : (
                ''
              )}
            </span>
          ),
        },
        {
          key: 'act',
          header: <span className="yx-visually-hidden">Actions</span>,
          cell: (x) =>
            x.purged ? (
              <span className="yx-tim-note">Deleted after its retention period</span>
            ) : (
              <Button size="sm" loading={busy === x.id} onClick={() => onDownload(x)}>
                Download PDF
              </Button>
            ),
        },
      ]}
    />
  );
}
