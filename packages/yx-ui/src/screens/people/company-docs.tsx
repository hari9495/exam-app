// G4 (item 21): Company documents in folders with expiry (People). No YukthiX design existed, so this screen is drawn
// here first, from the kit (folders with counts; title, file, expiry, updated), with its story (ppl-51), then made live
// with `live`. Policies with acknowledgement stay in Policies (answer 2697).
import { useState } from 'react';
import { Download, FolderOpen, Lock, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { FormField, useTooEarly } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { formatDate } from '../../lib/format';
import { PeopleFrame, useSay } from './people-kit';

export type DocStatus = 'Valid' | 'Expiring soon' | 'Expired' | 'No expiry';
export interface CompanyDocRow {
  id: string;
  title: string;
  fileName: string;
  size: number;
  scan: string;
  expiresOn: string | null;
  status: DocStatus;
  updatedAt: string;
  updatedBy: string;
}
export interface CompanyDocFolder {
  id: string;
  name: string;
  audience: 'everyone' | 'managers';
  count: number;
}
export interface CompanyDocsData {
  canManage: boolean;
  remindDays: number;
  folders: CompanyDocFolder[];
  folderId: string | null;
  documents: CompanyDocRow[];
}
export interface UploadInput {
  folderId: string;
  title: string;
  expiresOn?: string;
  replaceId?: string;
  file: File;
}
export interface LiveCompanyDocs {
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  data: CompanyDocsData | null;
  onFolder: (id: string) => void;
  onAddFolder: (name: string, audience: 'everyone' | 'managers') => Promise<unknown>;
  onRemoveFolder: (id: string) => Promise<unknown>;
  onUpload: (input: UploadInput) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  onDownload: (doc: CompanyDocRow) => Promise<unknown>;
}

const TONE: Record<DocStatus, BadgeTone> = { Valid: 'success', 'Expiring soon': 'warning', Expired: 'danger', 'No expiry': 'neutral' };
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (s: string) => new Date(`${s}T00:00:00`);
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not work. Try again.');

/** People › Company documents: the designed screen with sample data, or `live`. */
export function CompanyDocumentsScreen(props: { sample?: CompanyDocsData; state?: 'ready' | 'loading' | 'error' } | { live: LiveCompanyDocs }) {
  if ('live' in props) return <LiveCompanyDocuments live={props.live} />;
  const noop = () => Promise.resolve();
  return <LiveCompanyDocuments live={{ state: props.state ?? 'ready', data: props.sample ?? SAMPLE_DOCS, onFolder: () => {}, onAddFolder: noop, onRemoveFolder: noop, onUpload: noop, onRemove: noop, onDownload: noop }} />;
}

function LiveCompanyDocuments({ live }: { live: LiveCompanyDocs }) {
  const { toast } = useSay();
  const [uploading, setUploading] = useState<CompanyDocRow | 'new' | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const d = live.data;
  const folder = d?.folders.find((f) => f.id === d.folderId) ?? null;
  const run = async (f: () => Promise<unknown>, ok: string) => {
    try {
      await f();
      toast({ tone: 'success', title: ok });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    }
  };
  const cols: TableColumn<CompanyDocRow>[] = [
    { key: 'title', header: 'Document', value: (r) => r.title, width: 260 },
    { key: 'file', header: 'File', value: (r) => r.fileName, render: (r) => `${r.fileName} · ${size(r.size)}`, width: 240 },
    { key: 'expiry', header: 'Expires', value: (r) => r.expiresOn ?? '', render: (r) => (r.expiresOn ? formatDate(day(r.expiresOn)) : 'No expiry'), width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.scan === 'clean' ? r.status : r.scan === 'infected' ? 'Failed the virus check' : 'Checking for viruses'), statusTone: (v) => (String(v) in TONE ? TONE[String(v) as DocStatus] : v === 'Failed the virus check' ? 'danger' : 'info'), width: 170 },
    { key: 'updated', header: 'Updated', value: (r) => r.updatedAt, render: (r) => `${formatDate(new Date(r.updatedAt))} · ${r.updatedBy}`, width: 220 },
  ];
  const body = () => {
    if (!d) return null;
    return (
      <div className="yx-ppl__split">
        <div className="yx-ppl__main">
          {folder ? (
            <>
              <div className="yx-ppl__row yx-ppl__row--between">
                <span className="yx-ppl__row">
                  <Text weight="semibold">{folder.name}</Text>
                  {folder.audience === 'managers' && <Badge tone="neutral">Document managers only</Badge>}
                </span>
                {d.canManage && folder.count === 0 && (
                  <ConfirmDialog
                    trigger={<Button size="sm" icon={Trash2}>Remove folder</Button>}
                    title={`Remove ${folder.name}?`}
                    consequence="The empty folder goes from the list."
                    confirmLabel="Remove folder"
                    destructive
                    onConfirm={() => run(() => live.onRemoveFolder(folder.id), `${folder.name} removed.`)}
                  />
                )}
              </div>
              <DataTable
                label={`Documents in ${folder.name}`}
                columns={cols}
                rows={d.documents}
                getRowId={(r) => r.id}
                state={live.state}
                onRetry={live.onRetry}
                rowButtons={(r) => (
                  <Button size="sm" icon={Download} onClick={() => void run(() => live.onDownload(r), `${r.title} downloaded.`)}>
                    Download
                  </Button>
                )}
                rowActions={
                  d.canManage
                    ? (r) => (
                        <>
                          <Button size="sm" icon={RefreshCw} onClick={() => setUploading(r)}>
                            Replace
                          </Button>
                          <ConfirmDialog
                            trigger={<Button size="sm" icon={Trash2}>Remove</Button>}
                            title={`Remove ${r.title}?`}
                            consequence="It leaves the folder for everyone. The removal is recorded."
                            confirmLabel="Remove document"
                            destructive
                            onConfirm={() => run(() => live.onRemove(r.id), `${r.title} removed.`)}
                          />
                        </>
                      )
                    : undefined
                }
                empty={<EmptyState compact title="No documents in this folder" description={d.canManage ? 'Upload the first one.' : undefined} />}
              />
            </>
          ) : (
            <EmptyState title="Choose a folder" />
          )}
        </div>
        <Card title="Folders">
          {d.folders.length === 0 ? (
            <Text tone="secondary">{d.canManage ? 'No folders yet. Make one to start.' : 'No company documents yet.'}</Text>
          ) : (
            <ul className="yx-ppl__family" aria-label="Folders">
              {d.folders.map((f) => (
                <li key={f.id}>
                  <Button variant={f.id === d.folderId ? 'primary' : 'secondary'} size="sm" icon={f.audience === 'managers' ? Lock : FolderOpen} aria-current={f.id === d.folderId ? 'true' : undefined} onClick={() => live.onFolder(f.id)}>
                    {`${f.name} (${f.count})`}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {d.canManage && (
            <Button size="sm" icon={Plus} onClick={() => setFolderOpen(true)}>
              New folder
            </Button>
          )}
        </Card>
      </div>
    );
  };
  return (
    <PeopleFrame active="Company documents" persona={d?.canManage ? 'hr' : 'emp'}>
      <PageHeader
        title="Company documents"
        description={d ? `Licences, registrations, handbooks and forms. Document managers are told ${d.remindDays} days before a document expires.` : undefined}
        actions={
          d?.canManage && d.folders.length > 0 ? (
            <Button variant="primary" icon={Upload} onClick={() => setUploading('new')}>
              Upload document
            </Button>
          ) : undefined
        }
      />
      {live.state === 'error' && !d ? <ErrorState title="We couldn't load the documents." description="Try again in a moment." onRetry={live.onRetry} /> : !d ? <Skeleton height={300} /> : body()}
      {folderOpen && <FolderDialog onClose={() => setFolderOpen(false)} onSave={(n, a) => run(() => live.onAddFolder(n, a), `${n} added.`)} />}
      {uploading && d && <UploadSheet folders={d.folders} folderId={d.folderId} replacing={uploading === 'new' ? null : uploading} onClose={() => setUploading(null)} onSave={live.onUpload} />}
    </PeopleFrame>
  );
}

function FolderDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string, audience: 'everyone' | 'managers') => Promise<void> }) {
  const [name, setName] = useState('');
  const [audience, setAudience] = useState<'everyone' | 'managers'>('everyone');
  const [tried, setTried] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New folder"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true);
              if (name.trim().length >= 2) void onSave(name.trim(), audience).then(onClose);
            }}
          >
            Add folder
          </Button>
        </>
      }
    >
      <div className="yx-ppl__stack">
        <FormField label="Name" required error={tried && name.trim().length < 2 ? 'Name the folder (2 letters or more).' : null}>
          <TextField value={name} onChange={setName} maxLength={80} />
        </FormField>
        <FormField label="Who sees it" helper="Document managers always see every folder.">
          <Segment<'everyone' | 'managers'> label="Who sees it" value={audience} onChange={setAudience} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'managers', label: 'Document managers only' }]} />
        </FormField>
      </div>
    </Dialog>
  );
}

function UploadSheet({ folders, folderId, replacing, onClose, onSave }: { folders: CompanyDocFolder[]; folderId: string | null; replacing: CompanyDocRow | null; onClose: () => void; onSave: LiveCompanyDocs['onUpload'] }) {
  const { toast } = useSay();
  const [title, setTitle] = useState(replacing?.title ?? '');
  const [folder, setFolder] = useState<string | null>(folderId);
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState<Date | null>(replacing?.expiresOn ? day(replacing.expiresOn) : null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const early = useTooEarly([
    ...(title.trim().length >= 2 ? [] : [{ fieldId: 'cd-title', message: 'Give the document a title.' }]),
    ...(folder ? [] : [{ fieldId: 'cd-folder', message: 'Choose the folder.' }]),
    ...(file ? [] : [{ fieldId: 'cd-file', message: 'Choose the file.' }]),
  ]);
  const save = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await onSave({ folderId: folder!, title: title.trim(), file: file!, ...(expires ? { expiresOn: iso(expires) } : {}), ...(replacing ? { replaceId: replacing.id } : {}) });
      toast({ tone: 'success', title: replacing ? `${title.trim()} replaced.` : `${title.trim()} uploaded. It opens once the virus check passes.` });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const today = new Date();
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={replacing ? `Replace ${replacing.title}` : 'Upload document'}
      footer={
        <div className="yx-ppl__row">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {replacing ? 'Replace' : 'Upload'}
          </Button>
        </div>
      }
    >
      <div className="yx-ppl__stack">
        {failed && <InlineAlert tone="danger" title="Not uploaded">{failed}</InlineAlert>}
        <FormField id="cd-title" label="Title" required error={early.errorOf('cd-title')}>
          <TextField value={title} onChange={setTitle} maxLength={200} />
        </FormField>
        <FormField id="cd-folder" label="Folder" required error={early.errorOf('cd-folder')}>
          <Select value={folder} onChange={setFolder} options={folders.map((f) => ({ value: f.id, label: f.name }))} />
        </FormField>
        <FormField id="cd-file" label="File" required error={early.errorOf('cd-file')} helper="PDF, Word, Excel, JPG or PNG, up to 25 MB. Every file is checked for viruses.">
          <FileUpload upload={async (f) => setFile(f)} accept={['.pdf', '.docx', '.xlsx', '.jpg', '.png']} maxSize={25 * 1024 * 1024} multiple={false} onItemsChange={(xs) => !xs.some((x) => x.status === 'done') && setFile(null)} />
        </FormField>
        <FormField label="Expires on" optional helper="Leave empty for a document that does not expire.">
          <DatePicker value={expires} onChange={setExpires} min={today} />
        </FormField>
      </div>
    </Drawer>
  );
}

/** Story and design sample. */
export const SAMPLE_DOCS: CompanyDocsData = {
  canManage: true,
  remindDays: 30,
  folders: [
    { id: 'f1', name: 'Licences and registrations', audience: 'everyone', count: 3 },
    { id: 'f2', name: 'Handbooks and forms', audience: 'everyone', count: 5 },
    { id: 'f3', name: 'Board papers', audience: 'managers', count: 2 },
  ],
  folderId: 'f1',
  documents: [
    { id: 'd1', title: 'Factory licence, Hosur plant', fileName: 'factory-licence-hosur.pdf', size: 420_000, scan: 'clean', expiresOn: '2026-12-15', status: 'Expiring soon', updatedAt: '2026-04-02T05:00:00Z', updatedBy: 'Lakshmi Venkatesan' },
    { id: 'd2', title: 'Shops and establishments registration', fileName: 'shops-est-blr.pdf', size: 180_000, scan: 'clean', expiresOn: '2028-03-31', status: 'Valid', updatedAt: '2025-04-10T05:00:00Z', updatedBy: 'Lakshmi Venkatesan' },
    { id: 'd3', title: 'Fire NOC, Bengaluru office', fileName: 'fire-noc-blr.pdf', size: 260_000, scan: 'clean', expiresOn: '2026-10-31', status: 'Expired', updatedAt: '2025-11-01T05:00:00Z', updatedBy: 'Arjun Nair' },
  ],
};
