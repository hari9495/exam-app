import { useState } from 'react';
import { Button } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { Text } from '../../components/foundations';
import { useToast } from '../../components/notify';
import { Dialog } from '../../components/overlay';
import { PlainTable } from '../../components/plain-table';
import { FileUpload } from '../../components/upload';

/** POST /performance/goals/import (T2-C item 71, answer 2844). */
export type GoalImportProblem = { line: number; name: string; problems: string[] };
export type GoalImportPreview = { preview: true; rows: { line: number; employee: string; employeeCode: string; title: string; weight: number }[]; problems: GoalImportProblem[] };
export type GoalImportResult = { imported: number } | { problems: GoalImportProblem[]; message: string };

/**
 * Import goals from a CSV (for holders of the goal-setting key, people in their scope), like the competency import:
 * the file is checked first and the preview lists each goal to add and each refused row with its reasons; Import adds
 * them all or none. Goals come in as drafts.
 */
export function GoalImportDialog({ open, onOpenChange, onPreview, onImport }: { open: boolean; onOpenChange: (o: boolean) => void; onPreview: (csv: string) => Promise<GoalImportPreview>; onImport: (csv: string) => Promise<GoalImportResult> }) {
  const { toast } = useToast();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<GoalImportPreview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = preview && preview.rows.length > 0 && preview.problems.length === 0;
  const close = () => (setCsv(null), setPreview(null), setFailed(null), onOpenChange(false));
  const doImport = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const out = await onImport(csv!);
      if ('problems' in out) {
        setPreview({ preview: true, rows: [], problems: out.problems });
        setFailed(out.message);
        return;
      }
      toast({ tone: 'success', title: `${out.imported === 1 ? '1 goal' : `${out.imported} goals`} imported as drafts` });
      close();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      size="md"
      title="Import goals"
      description="One KPI goal per row, for people in your goal-setting scope. The file is checked first: nothing is imported unless every row is right."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!ready} loading={busy} onClick={() => void doImport()}>
            {ready ? `Import ${preview!.rows.length === 1 ? '1 goal' : `${preview!.rows.length} goals`}` : 'Import'}
          </Button>
        </>
      }
    >
      <div className="yx-growth-stack">
        <Text size="sm" tone="secondary">
          Columns: employee_code, title, weight (0 to 100, optional), description (optional), kind (kpi, optional). Goals come in as drafts; each person sends them to their manager as usual.
        </Text>
        {failed && (
          <InlineAlert tone="danger" title="Not imported">
            {failed}
          </InlineAlert>
        )}
        <FileUpload
          accept={['.csv']}
          maxSize={256 * 1024}
          multiple={false}
          upload={async (file) => {
            setPreview(null);
            setFailed(null);
            const text = await file.text();
            setCsv(text);
            setPreview(await onPreview(text));
          }}
        />
        {preview && preview.problems.length > 0 && (
          <PlainTable
            label="Rows with problems"
            caption={`Rows with problems (${preview.problems.length}). Fix them in your file and choose it again.`}
            columns={[
              { key: 'line', header: 'Row', num: true, cell: (p) => p.line },
              { key: 'name', header: 'Goal', rowHeader: true, cell: (p) => p.name || 'No title' },
              { key: 'problems', header: 'What to fix', cell: (p) => p.problems.join(' ') },
            ]}
            rows={preview.problems}
            getRowId={(p) => String(p.line)}
          />
        )}
        {preview && preview.rows.length > 0 && (
          <PlainTable
            label="Goals to import"
            caption={`Goals to import (${preview.rows.length})`}
            columns={[
              { key: 'line', header: 'Row', num: true, cell: (r) => r.line },
              { key: 'who', header: 'Person', cell: (r) => `${r.employee} (${r.employeeCode})` },
              { key: 'title', header: 'Goal', rowHeader: true, cell: (r) => r.title },
              { key: 'weight', header: 'Weight', num: true, cell: (r) => r.weight },
            ]}
            rows={preview.rows}
            getRowId={(r) => String(r.line)}
          />
        )}
      </div>
    </Dialog>
  );
}
