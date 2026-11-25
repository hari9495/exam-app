import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FileUpload } from '../../components/upload';
import { ConfirmDialog } from '../../components/overlay';
import { Card } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { useToast } from '../../components/notify';
import { errorText } from '../org/org-kit';

// Batch F GLPI 10 (answer 2574): copy a desk's set-up (categories, response and team targets, templates, rules) as a
// file, and import one into this desk: a dry run first, then the import. Never people, tickets or files.

export interface DeskImportItem {
  kind: 'category' | 'sla' | 'template' | 'rule';
  name: string;
  outcome: 'add' | 'added' | 'skip' | 'failed';
  note: string | null;
}
export interface LiveDeskTransfer {
  /** Downloads this desk's set-up file. */
  onExport: () => Promise<unknown>;
  onImport: (file: unknown, dryRun: boolean) => Promise<{ dryRun: boolean; items: DeskImportItem[] }>;
  /** Story: a checked file's preview or the import's result. */
  defaultResult?: { dryRun: boolean; items: DeskImportItem[] };
}

const KIND: Record<DeskImportItem['kind'], string> = { category: 'Category', sla: 'Targets', template: 'Template', rule: 'Rule' };
const OUTCOME: Record<DeskImportItem['outcome'], [BadgeTone, string]> = { add: ['info', 'Will be added'], added: ['success', 'Added'], skip: ['neutral', 'Already here'], failed: ['danger', 'Not added'] };

export function DeskSetupTransfer({ live }: { live: LiveDeskTransfer }) {
  const { toast } = useToast();
  const [file, setFile] = useState<unknown>(live.defaultResult ? {} : null);
  const [result, setResult] = useState(live.defaultResult ?? null);
  const [confirm, setConfirm] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const adds = result?.items.filter((x) => x.outcome === 'add').length ?? 0;
  const columns: TableColumn<DeskImportItem>[] = [
    { key: 'kind', header: 'What', value: (r) => KIND[r.kind], width: 110 },
    { key: 'name', header: 'Name', value: (r) => r.name, width: 260 },
    { key: 'outcome', header: 'Result', value: (r) => OUTCOME[r.outcome][1], render: (r) => <Badge tone={OUTCOME[r.outcome][0]}>{OUTCOME[r.outcome][1]}</Badge>, width: 140 },
    { key: 'note', header: 'Why', value: (r) => r.note ?? '', render: (r) => r.note ?? '—' },
  ];
  return (
    <div className="yx-ops-stack">
      <Card title="Copy this desk's set-up" actions={<Button icon={Download} loading={exporting} onClick={() => { setExporting(true); void live.onExport().catch((e: unknown) => setFailed(errorText(e))).finally(() => setExporting(false)); }}>Download set-up file</Button>}>
        <p className="yx-ops-p">The file holds categories, response and team targets, templates and rules. It never holds people, tickets or files. Import it into a desk of another company, for example from a trial company into the live one.</p>
      </Card>
      <Card title="Import a set-up file">
        <div className="yx-ops-stack">
          {failed && <InlineAlert tone="danger" title="Not imported">{failed}</InlineAlert>}
          <FileUpload
            accept={['.json']}
            maxSize={2 * 1024 * 1024}
            multiple={false}
            upload={async (f) => {
              setFailed(null);
              let parsed: unknown;
              try {
                parsed = JSON.parse(await f.text());
              } catch {
                throw new Error('This is not a set-up file. Download one from a desk first.');
              }
              const preview = await live.onImport(parsed, true);
              setFile(parsed);
              setResult(preview);
            }}
          />
          {result &&
            (result.items.length === 0 ? (
              <EmptyState compact title="The file is empty." />
            ) : (
              <>
                <p className="yx-ops-muted">{result.dryRun ? `Checked. ${adds} will be added; what is already here is skipped. Rules arrive switched off.` : 'Imported. Rules arrive switched off: check each one, then switch it on.'}</p>
                <DataTable label="Set-up file items" columns={columns} rows={result.items} getRowId={(r) => `${r.kind}:${r.name}`} />
                {result.dryRun && Boolean(file) && (
                  <div className="yx-ops-row">
                    <Button variant="primary" onClick={() => (adds ? setConfirm(true) : toast({ tone: 'default', title: 'Nothing to add: everything is already here.' }))}>
                      Import {adds}
                    </Button>
                  </div>
                )}
              </>
            ))}
        </div>
      </Card>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Import ${adds} items into this desk?`}
        consequence="They are added by name; nothing already here is changed. Rules arrive switched off."
        confirmLabel={`Import ${adds}`}
        onConfirm={async () => {
          try {
            const done = await live.onImport(file, false);
            setResult(done);
            const n = done.items.filter((x) => x.outcome === 'added').length;
            const bad = done.items.filter((x) => x.outcome === 'failed').length;
            toast({ tone: bad ? 'warning' : 'success', title: `Imported ${n}${bad ? `; ${bad} not added (see why)` : ''}.` });
          } catch (e) {
            setFailed(errorText(e));
          }
          setConfirm(false);
        }}
      />
    </div>
  );
}
