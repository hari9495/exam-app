// PPL-07 Employee import, live: the designed steps with the company's legal entities, the file read by the API and
// every row checked by the API through the hire path. Nothing is saved until "Import"; rows with problems are skipped.
import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '../../components/button';
import { Card, PageHeader } from '../../components/shell';
import { InlineAlert } from '../../components/feedback';
import { ConfirmDialog } from '../../components/overlay';
import { formatDate } from '../../lib/format';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { TextField } from '../../components/inputs';
import { Stepper } from '../../components/stepper';
import { FileUpload } from '../../components/upload';
import { Text } from '../../components/foundations';
import { ListSkeleton, PeopleFrame, StatusChecklist, type ChecklistRow } from './people-kit';

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
}
export interface ImportFile {
  columns: { column: string; sample: string; field: string | null }[];
  rows: { row: number; cells: string[] }[];
  fields: ImportField[];
}
export interface ImportRowResult {
  row: number;
  name: string;
  code: string | null;
  joined: string | null;
  manager: { code: string; name: string; inFile: boolean } | null;
  issues: { field: string; message: string }[];
  duplicate: boolean;
}
export interface ImportResult {
  rows: ImportRowResult[];
  ready: number;
  created?: number;
}
/** A saved import ("Save and exit"), as the upload step shows it. */
export interface ImportDraftSummary {
  fileName: string;
  rows: number;
  entity: string;
  step: string;
  savedAt: string;
  keptUntil: string;
}
/** Everything needed to carry on: the file as read, the matching, the fixes typed in and the step. */
export interface ImportDraftState {
  legalEntityId: string;
  step: 'upload' | 'map' | 'validate' | 'review';
  /** The field list comes from the API when the import is resumed; it is not saved. */
  file: { name: string; columns: ImportFile['columns']; rows: ImportFile['rows']; fields?: ImportFile['fields'] };
  mapping: Record<string, string>;
  edits: Record<number, Record<string, string>>;
}
const STEP_NAME: Record<string, string> = { upload: 'Upload file', map: 'Match columns', validate: 'Check rows', review: 'Review' };

/** The saved import on the upload step: carry on, or discard it (confirmed). Only the person who saved it sees it. */
export function SavedImportNotice({ draft, onResume, onDiscard }: { draft: ImportDraftSummary; onResume: () => void; onDiscard: () => Promise<void> }) {
  const [discarding, setDiscarding] = useState(false);
  return (
    <>
      <InlineAlert
        tone="info"
        title={`Saved import: ${draft.fileName}`}
        actions={
          <>
            <Button size="sm" onClick={onResume}>Resume</Button>
            <Button size="sm" onClick={() => setDiscarding(true)}>Discard</Button>
          </>
        }
      >
        {draft.rows} {draft.rows === 1 ? 'row' : 'rows'}{draft.entity ? ` for ${draft.entity}` : ''}, saved on {formatDate(new Date(draft.savedAt))} at {STEP_NAME[draft.step] ?? draft.step}. Only you can see it. It is kept until {formatDate(new Date(draft.keptUntil))}, then deleted.
      </InlineAlert>
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title={`Discard the saved import of ${draft.fileName}?`}
        consequence="The file, the column matches and the fixes you typed are deleted. Nobody is imported."
        confirmLabel="Discard import"
        destructive
        onConfirm={onDiscard}
      />
    </>
  );
}

export type ImportInput = { legalEntityId: string; fileName: string; rows: { row: number; values: Record<string, string> }[] };

export interface LiveImport {
  entities: { value: string; label: string }[];
  /** The legal entity chosen in the top bar, if any. */
  defaultEntity?: string | null;
  onRead: (file: File) => Promise<ImportFile>;
  /** Every row through the hire path, then rolled back. */
  onCheck: (input: ImportInput) => Promise<ImportResult>;
  /** Creates the rows that pass. */
  onImport: (input: ImportInput) => Promise<ImportResult>;
  /** Saves a CSV the browser made (the template, the rows with problems). */
  onSaveFile: (name: string, csv: string) => void;
  /** The person's saved import, if any ("Save and exit"). */
  draft?: ImportDraftSummary | null;
  onSaveDraft?: (state: ImportDraftState) => Promise<void>;
  /** "Save and exit" before any file: nothing to keep, so it only leaves. */
  onExit?: () => void;
  onResume?: () => Promise<ImportDraftState>;
  onDiscard?: () => Promise<void>;
}

const SKIP = "Don't import";
// A cell that starts like a formula is written as text, so a spreadsheet never runs it.
const cell = (s: string) => {
  const t = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csv = (rows: string[][]) => `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

export function LiveEmployeeImport({ live }: { live: LiveImport }) {
  const [picked, setEntity] = useState<string | null>(null);
  // The person's choice, else the top bar's legal entity, else the first one (the list loads after the page).
  const entity = picked ?? live.defaultEntity ?? live.entities[0]?.value ?? null;
  const [file, setFile] = useState<{ name: string; data: ImportFile } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('upload');
  // A resumed import on "Check rows" checks again once its rows are in place.
  const [recheck, setRecheck] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const fields = file?.data.fields ?? [];
  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const keyOf = (label: string) => fields.find((f) => f.label === label)?.key;
  const unmatched = fields.filter((f) => f.required && !Object.values(mapping).includes(f.key)).map((f) => f.label);
  // The file's values per row, by field, with the fixes typed here on top.
  const input = useMemo((): ImportInput | null => {
    if (!file || !entity) return null;
    const cols = file.data.columns.map((c) => mapping[c.column]);
    return {
      legalEntityId: entity,
      fileName: file.name,
      rows: file.data.rows.map((r) => {
        const values: Record<string, string> = {};
        cols.forEach((k, i) => k && k !== SKIP && r.cells[i] && (values[k] = r.cells[i]));
        return { row: r.row, values: { ...values, ...edits[r.row] } };
      }),
    };
  }, [file, entity, mapping, edits]);

  const check = async () => {
    if (!input) return;
    setBusy(true);
    setFailed(null);
    try {
      setResult(await live.onCheck(input));
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'The rows could not be checked. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const go = (id: string) => {
    setStep(id);
    if (id === 'validate' && !busy) void check();
  };

  useEffect(() => {
    if (recheck && input) {
      setRecheck(false);
      void check();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recheck, input]);

  const resume = async () => {
    if (!live.onResume) return;
    setResumeError(null);
    try {
      const s = await live.onResume();
      setEntity(s.legalEntityId);
      setFile({ name: s.file.name, data: { columns: s.file.columns, rows: s.file.rows, fields: s.file.fields ?? [] } });
      setMapping(s.mapping);
      setEdits(s.edits);
      setResult(null);
      setStep(s.step === 'review' ? 'validate' : s.step);
      setRecheck(s.step === 'validate' || s.step === 'review');
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : 'The saved import could not be opened. Try again.');
    }
  };
  const saveAndExit =
    live.onSaveDraft && file && entity
      ? () => void live.onSaveDraft!({ legalEntityId: entity, step: (['upload', 'map', 'validate'].includes(step) ? step : 'review') as ImportDraftState['step'], file: { name: file.name, columns: file.data.columns, rows: file.data.rows }, mapping, edits })
      : live.onExit;

  const rows = result?.rows ?? [];
  const bad = rows.filter((r) => r.issues.length);
  const ready = rows.filter((r) => !r.issues.length);
  const valueOf = (row: number, key: string) => input?.rows.find((r) => r.row === row)?.values[key] ?? '';
  const edit = (row: number, key: string, v: string) => setEdits({ ...edits, [row]: { ...edits[row], [key]: v } });
  const entityName = live.entities.find((e) => e.value === entity)?.label ?? '';
  const joinDates = [...new Set(ready.map((r) => r.joined).filter(Boolean))].join(' and ');
  const managerText = (r: ImportRowResult) => (r.manager ? (r.manager.inFile ? `manager is in this file (${r.manager.name})` : `manager ${r.manager.name} (${r.manager.code})`) : 'no manager');

  const template = () => live.onSaveFile('employee-import-template.csv', csv([TEMPLATE]));
  const problems = () => {
    if (!file) return;
    const header = [...file.data.columns.map((c) => c.column), 'Problem'];
    const out = bad.map((b) => [...(file.data.rows.find((r) => r.row === b.row)?.cells ?? []), b.issues.map((i) => `${i.field}: ${i.message}`).join(' ')]);
    live.onSaveFile(`${file.name.replace(/\.(csv|xlsx)$/i, '')}-problems.csv`, csv([header, ...out]));
  };

  return (
    <PeopleFrame active="Import">
      <PageHeader title="Import employees" description="Upload a CSV or Excel file. Nothing is saved until you import the rows that pass." actions={<Button icon={Download} onClick={template}>Download template</Button>} />
      <Stepper
        title="Employee import"
        current={step}
        onCurrentChange={go}
        onSaveAndExit={saveAndExit}
        finishLabel={`Import ${ready.length} ${ready.length === 1 ? 'employee' : 'employees'}`}
        finishing={busy}
        finishBlocked={!result ? 'Check the rows first' : ready.length === 0 ? 'No row is ready' : undefined}
        continueBlocked={!entity ? 'Choose the legal entity first' : !file ? 'Upload a file first' : step === 'map' && unmatched.length ? `Match ${unmatched.join(' and ')} first` : step === 'validate' && (busy || !result) ? 'Checking the rows' : undefined}
        onFinish={async () => {
          if (!input) return;
          setBusy(true);
          try {
            setResult(await live.onImport(input));
          } catch (e) {
            setFailed(e instanceof Error ? e.message : 'The import did not run. Try again.');
            setStep('validate');
          } finally {
            setBusy(false);
          }
        }}
        review={{
          description: 'Check what happens before you import.',
          note: `${ready.length} ${ready.length === 1 ? 'employee is' : 'employees are'} added to ${entityName}. They appear in the Directory${joinDates ? ` (joining ${joinDates})` : ''}. ${bad.length} ${bad.length === 1 ? 'row is' : 'rows are'} skipped.`,
        }}
        steps={[
          {
            id: 'upload',
            title: 'Upload file',
            summary: file ? `${file.name} · ${file.data.rows.length} rows · ${entityName}` : 'No file yet',
            content: (
              <div className="yx-ppl__form">
                {live.draft && !file && live.onResume && live.onDiscard && <SavedImportNotice draft={live.draft} onResume={() => void resume()} onDiscard={live.onDiscard} />}
                {resumeError && <InlineAlert tone="danger">{resumeError}</InlineAlert>}
                <FormField label="Legal entity" required helper="New people join this entity and get codes in its series.">
                  <Select options={live.entities} value={entity} onChange={(v) => (setEntity(v), setResult(null))} placeholder="Choose a legal entity" />
                </FormField>
                <FileUpload
                  upload={async (f) => {
                    const data = await live.onRead(f);
                    setFile({ name: f.name, data });
                    setMapping(Object.fromEntries(data.columns.map((c) => [c.column, c.field ?? SKIP])));
                    setEdits({});
                    setResult(null);
                  }}
                  accept={['.csv', '.xlsx']}
                  maxSize={2 * 1024 * 1024}
                  multiple={false}
                  key={file ? `saved:${file.name}` : 'empty'}
                  defaultItems={file ? [{ id: 'saved', file: new File([], file.name), status: 'done', progress: 100 }] : []}
                  onItemsChange={(items) => !items.some((i) => i.status === 'done') && setFile(null)}
                />
                {file && <Text size="sm" tone="secondary" as="p">{file.data.rows.length} rows found.</Text>}
                <Text size="sm" tone="secondary" as="p">
                  Up to 500 rows and 2 MB. Leave Employee code blank and the next code in the entity&apos;s series is given.
                </Text>
              </div>
            ),
          },
          {
            id: 'map',
            title: 'Match columns',
            summary: `${Object.values(mapping).filter((f) => f !== SKIP).length} columns imported · ${Object.values(mapping).filter((f) => f === SKIP).length} left out`,
            content: (
              <div className="yx-ppl__stack">
                {unmatched.length > 0 ? (
                  <InlineAlert tone="warning">Match a column to {unmatched.join(' and ')}. These are required.</InlineAlert>
                ) : (
                  <Text size="sm" tone="secondary" as="p">All required fields are matched.</Text>
                )}
                <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Column matches">
                  <table className="yx-ppl__impact">
                    <thead>
                      <tr>
                        <th scope="col">Column in your file</th>
                        <th scope="col">YukthiX field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(file?.data.columns ?? []).map((c) => (
                        <tr key={c.column}>
                          <td>
                            <span className="yx-ppl__type">
                              <span>{c.column}</span>
                              {c.sample && <span className="yx-ppl__sub">e.g. {c.sample}</span>}
                            </span>
                          </td>
                          <td>
                            <Select
                              aria-label={`Field for ${c.column}`}
                              size="sm"
                              // A field goes to one column only.
                              options={[...fields.filter((f) => mapping[c.column] === f.key || !Object.values(mapping).includes(f.key)).map((f) => ({ value: f.key, label: f.label })), { value: SKIP, label: SKIP }]}
                              value={mapping[c.column] ?? SKIP}
                              onChange={(v) => v && (setMapping({ ...mapping, [c.column]: v }), setResult(null))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ),
          },
          {
            id: 'validate',
            title: 'Check rows',
            summary: result ? `${ready.length} rows ready · ${bad.length} rows skipped` : 'Not checked yet',
            content: failed ? (
              <InlineAlert tone="danger" title="The rows were not checked" actions={<Button size="sm" onClick={() => void check()}>Try again</Button>}>
                {failed}
              </InlineAlert>
            ) : busy || !result ? (
              <ListSkeleton rows={4} label="Checking the rows" />
            ) : (
              <div className="yx-ppl__stack">
                <InlineAlert tone={bad.length ? 'warning' : 'success'} title={bad.length ? `${ready.length} of ${rows.length} rows are ready` : 'All rows are ready'}>
                  {bad.length ? 'Rows with problems are skipped. Fix them here and check again, or fix your file and upload it again.' : 'Import when you are ready.'}
                </InlineAlert>
                {bad.length > 0 && (
                  <Card title={`Needs fixing (${bad.length})`}>
                    <div className="yx-ppl__stack">
                      <StatusChecklist
                        label="Rows with problems"
                        rows={bad.map(
                          (b): ChecklistRow => ({
                            id: `r${b.row}`,
                            title: `Row ${b.row} · ${b.name || 'No name'}`,
                            status: b.duplicate ? 'Skipped' : 'Fix needed',
                            note: (
                              <div className="yx-ppl__stack">
                                {b.issues.map((i, n) => {
                                  const key = b.duplicate ? undefined : keyOf(i.field);
                                  return (
                                    <div key={`${i.field}${n}`}>
                                      <strong>{i.field}:</strong> {i.message}
                                      {key && b.issues.findIndex((x) => x.field === i.field) === n && (
                                        <TextField size="sm" aria-label={`${i.field} for row ${b.row}`} placeholder={key === 'joined' ? '01 Oct 2026' : key === 'pan' ? 'ABCDE1234F' : labelOf(key)} value={valueOf(b.row, key)} onChange={(v) => edit(b.row, key, v)} />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ),
                          }),
                        )}
                      />
                      <div className="yx-ppl__row">
                        <Button onClick={() => void check()}>Check again</Button>
                        <Button icon={FileSpreadsheet} onClick={problems}>Download rows with problems</Button>
                      </div>
                    </div>
                  </Card>
                )}
                <Card title={`Ready to import (${ready.length})`}>
                  <StatusChecklist
                    label="Rows ready to import"
                    rows={ready.map((r): ChecklistRow => ({ id: `ok${r.row}`, title: r.name, status: 'Ready', note: `${r.code || 'Next code in series'} · joins ${r.joined} · ${managerText(r)}` }))}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />
    </PeopleFrame>
  );
}

/** The template's columns: the import fields' names, so they match without changes. */
const TEMPLATE = ['Employee code', 'Name', 'PAN', 'Manager code', 'Joining date', 'Department', 'Designation', 'Location', 'Employment type', 'Status', 'Work email', 'Mobile'];
