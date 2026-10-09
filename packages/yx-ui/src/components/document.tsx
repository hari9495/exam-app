import { useId, useState } from 'react';
import { Download, Maximize2, Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { Button, IconButton } from './button';
import { Badge, PersonLabel, type BadgeTone } from './display';
import { EmptyState, Skeleton } from './feedback';
import { Drawer } from './drawer';
import { DescriptionList } from './shell';
import { useControllable } from './overlay';
import { formatBytes, formatDate, formatTime } from '../lib/format';

export interface DocVersion {
  id: string;
  /** "Version 3" */
  label: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
  /** Bytes. */
  size: number;
}

export type ESignState = 'not-sent' | 'waiting' | 'signed' | 'declined';

export interface ESignSigner {
  name: string;
  status: ESignState;
  at?: Date;
}

export interface DocumentViewerProps {
  fileName: string;
  /** Newest first. The first one is the current version. */
  versions: DocVersion[];
  version?: string;
  defaultVersion?: string;
  onVersionChange?: (id: string) => void;
  /** Overrides detection from the file name. */
  mimeType?: string;
  /** Loading from the server, or it failed. */
  state?: 'ready' | 'loading' | 'error';
  esign?: { status: ESignState; signers: ESignSigner[] };
  /** Default: the browser downloads the version's URL. */
  onDownload?: (version: DocVersion) => void;
  /** Adds the Print button. */
  onPrint?: (version: DocVersion) => void;
  /** Show inside the standard drawer (§31). */
  inDrawer?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type Kind = 'image' | 'pdf' | 'other';
export function documentKind(fileName: string, mimeType?: string): Kind {
  const m = mimeType ?? '';
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  return 'other';
}

// A date with no time part (exactly midnight) shows the date only: no made-up "12:00 am".
const when = (d: Date) => d.getHours() + d.getMinutes() + d.getSeconds() === 0 ? formatDate(d) : `${formatDate(d)}, ${formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)}`;

export function esignSummary(status: ESignState, signers: ESignSigner[]): { tone: BadgeTone; text: string } {
  const names = (s: ESignState) => signers.filter((x) => x.status === s).map((x) => x.name).join(', ');
  switch (status) {
    case 'waiting':
      return { tone: 'warning', text: `Waiting for ${names('waiting') || 'signers'}` };
    case 'signed': {
      const last = signers.map((s) => s.at).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
      return { tone: 'success', text: last ? `Signed on ${formatDate(last)}` : 'Signed' };
    }
    case 'declined':
      return { tone: 'danger', text: names('declined') ? `Declined by ${names('declined')}` : 'Declined' };
    default:
      return { tone: 'neutral', text: 'Not sent for signing' };
  }
}

const SIGNER_TEXT: Record<ESignState, string> = { 'not-sent': 'Not sent', waiting: 'Waiting to sign', signed: 'Signed', declined: 'Declined' };

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

/** Inline PDF and image preview with versions and e-sign status (§31). */
export function DocumentViewer(props: DocumentViewerProps) {
  const { fileName, inDrawer, open, defaultOpen = false, onOpenChange } = props;
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const [vid, setVid] = useControllable(props.version, props.defaultVersion ?? props.versions[0]?.id, props.onVersionChange);
  const body = <ViewerBody {...props} version={vid} onVersionChange={setVid} />;
  if (!inDrawer) return body;
  const v = props.versions.find((x) => x.id === vid) ?? props.versions[0];
  return (
    <Drawer open={isOpen} onOpenChange={setOpen} title={fileName} subtitle={`${v.label} · ${formatBytes(v.size)}`} size="lg">
      {body}
    </Drawer>
  );
}

function ViewerBody({ fileName, versions, version, defaultVersion, onVersionChange, mimeType, state = 'ready', esign, onDownload, onPrint, inDrawer }: DocumentViewerProps) {
  const [versionId, setVersionId] = useControllable(version, defaultVersion ?? versions[0]?.id, onVersionChange);
  const v = versions.find((x) => x.id === versionId) ?? versions[0];
  const [zoom, setZoom] = useState(1);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const kind = documentKind(fileName, mimeType);
  const failed = state === 'error' || failedUrl === v.url;
  const infoId = useId();
  const get = () => (onDownload ? onDownload(v) : download(v.url, fileName));
  const downloadButton = (
    <Button icon={Download} size="sm" onClick={get}>
      Download
    </Button>
  );
  const ext = fileName.includes('.') ? `.${fileName.split('.').pop()}` : 'these';

  let preview;
  if (state === 'loading') {
    preview = (
      <div className="yx-docview__loading" aria-busy="true">
        <Skeleton height="100%" />
        <span className="yx-visually-hidden" role="status">
          Loading {fileName}
        </span>
      </div>
    );
  } else if (failed) {
    preview = (
      <div role="alert">
        <EmptyState title="We couldn't open this file. Download it instead." action={downloadButton} />
      </div>
    );
  } else if (kind === 'other') {
    preview = <EmptyState title={`We can't preview ${ext} files here.`} description="Download the file to open it on your device." action={downloadButton} />;
  } else if (kind === 'image') {
    preview = <img className="yx-docview__img" src={v.url} alt={`${fileName}, ${v.label}`} style={{ width: `${zoom * 100}%` }} onError={() => setFailedUrl(v.url)} />;
  } else {
    preview = (
      <object className="yx-docview__pdf" data={v.url} type="application/pdf" aria-label={`${fileName}, ${v.label}`} style={{ width: `${zoom * 100}%` }}>
        <EmptyState title="Your browser can't show PDFs here." description="Download the file to read it." action={downloadButton} />
      </object>
    );
  }

  const canZoom = state === 'ready' && !failed && kind !== 'other';
  const sig = esign && esignSummary(esign.status, esign.signers);

  return (
    <div className="yx-docview" data-in-drawer={inDrawer || undefined}>
      <div className="yx-docview__main">
        <div className="yx-docview__toolbar" role="toolbar" aria-label="Document tools">
          {!inDrawer && <span className="yx-docview__name">{fileName}</span>}
          {canZoom && (
            <span className="yx-docview__zoom">
              <IconButton icon={ZoomOut} label="Zoom out" size="sm" variant="secondary" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} />
              <span className="yx-docview__pct" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <IconButton icon={ZoomIn} label="Zoom in" size="sm" variant="secondary" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.25))} />
              <IconButton icon={Maximize2} label="Fit to width" size="sm" variant="secondary" onClick={() => setZoom(1)} />
            </span>
          )}
          <span className="yx-docview__actions">
            {onPrint && canZoom && <IconButton icon={Printer} label="Print" size="sm" variant="secondary" onClick={() => onPrint(v)} />}
            {!failed && kind !== 'other' && downloadButton}
          </span>
        </div>
        <div className="yx-docview__stage" data-kind={kind} tabIndex={0} role="region" aria-label={`Preview of ${name}`}>
          {preview}
        </div>
      </div>
      <aside className="yx-docview__side" aria-labelledby={infoId}>
        <h3 className="yx-docview__h" id={infoId}>
          File details
        </h3>
        <DescriptionList
          items={[
            { label: 'File name', value: fileName },
            { label: 'Uploaded by', value: v.uploadedBy },
            { label: 'Uploaded on', value: when(v.uploadedAt) },
            { label: 'Size', value: formatBytes(v.size) },
          ]}
        />
        {versions.length > 1 && (
          <section className="yx-docview__section" aria-label="Version history">
            <h3 className="yx-docview__h">Version history</h3>
            <ul className="yx-docview__versions">
              {versions.map((x, i) => (
                <li key={x.id}>
                  <button type="button" className="yx-docview__version" aria-pressed={x.id === v.id} onClick={() => setVersionId(x.id)}>
                    <span className="yx-docview__vlabel">
                      {x.label}
                      {i === 0 && <Badge tone="info">Current</Badge>}
                    </span>
                    <span className="yx-docview__vmeta">
                      {x.uploadedBy} · {formatDate(x.uploadedAt)} · {formatBytes(x.size)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {esign && sig && (
          <section className="yx-docview__section" aria-label="E-signature">
            <h3 className="yx-docview__h">E-signature</h3>
            <Badge tone={sig.tone}>{sig.text}</Badge>
            {esign.signers.length > 0 && (
              <ul className="yx-docview__signers">
                {esign.signers.map((s) => (
                  <li key={s.name} data-status={s.status}>
                    <PersonLabel name={s.name} secondary={s.at && (s.status === 'signed' || s.status === 'declined') ? `${SIGNER_TEXT[s.status]} on ${formatDate(s.at)}` : SIGNER_TEXT[s.status]} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
