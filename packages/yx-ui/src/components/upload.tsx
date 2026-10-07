import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { AlertCircle, CheckCircle2, FileText, RotateCcw, ShieldCheck, Upload, X } from 'lucide-react';
import { formatBytes } from '../lib/format';
import { Icon } from './foundations';
import { IconButton } from './button';
import { useFieldControl } from './field';

export type UploadStatus = 'uploading' | 'scanning' | 'done' | 'error';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  /** 0–100 while uploading. */
  progress: number;
  error?: string;
}

export interface UploadHandlers {
  onProgress: (percent: number) => void;
  /** Call when the server starts the virus scan (§31). */
  onScanning: () => void;
}

export interface FileUploadProps {
  /** Performs the upload. Resolve when stored and scanned; reject with an Error whose message tells the user what to do. */
  upload: (file: File, h: UploadHandlers) => Promise<void>;
  /** e.g. [".pdf", ".jpg", ".png"] — shown to the user before they pick (§31). */
  accept?: string[];
  /** Bytes. Default 10 MB. */
  maxSize?: number;
  multiple?: boolean;
  /** Called whenever the list changes, so forms can read finished files. */
  onItemsChange?: (items: UploadItem[]) => void;
  disabled?: boolean;
  id?: string;
  /** Files already in the list, e.g. documents attached earlier. */
  defaultItems?: UploadItem[];
}

let seq = 0;

/** Drag-and-drop or browse; type and size shown up front; per-file progress, scan status, retry (§31). */
export function FileUpload({ upload, accept, maxSize = 10 * 1024 * 1024, multiple = true, onItemsChange, disabled, id, defaultItems = [] }: FileUploadProps) {
  const { controlProps } = useFieldControl({ id, disabled });
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [items, setItems] = useState<UploadItem[]>(defaultItems);
  const [over, setOver] = useState(false);

  const update = setItems;
  const changed = useRef(onItemsChange);
  changed.current = onItemsChange;
  useEffect(() => {
    changed.current?.(items);
  }, [items]);
  const patch = (itemId: string, p: Partial<UploadItem>) => update((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...p } : it)));

  const checkFile = (f: File): string | null => {
    if (accept?.length) {
      const ext = `.${f.name.split('.').pop()?.toLowerCase()}`;
      const mime = f.type.toLowerCase();
      const ok = accept.some((a) => {
        const t = a.toLowerCase();
        return t === ext || t === mime || (t.endsWith('/*') && mime.startsWith(t.slice(0, -1)));
      });
      if (!ok) return `This file type is not allowed. Use ${typesLabel(accept)}`;
    }
    if (f.size > maxSize) return `This file is ${formatBytes(f.size)}. The limit is ${formatBytes(maxSize)}`;
    return null;
  };

  const start = (item: UploadItem) => {
    patch(item.id, { status: 'uploading', progress: 0, error: undefined });
    upload(item.file, {
      onProgress: (progress) => patch(item.id, { progress }),
      onScanning: () => patch(item.id, { status: 'scanning', progress: 100 }),
    }).then(
      () => patch(item.id, { status: 'done', progress: 100 }),
      (e: unknown) => patch(item.id, { status: 'error', error: e instanceof Error ? e.message : 'Upload failed. Try again' }),
    );
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, multiple ? undefined : 1);
    const fresh: UploadItem[] = list.map((file) => {
      const err = checkFile(file);
      return { id: `u${++seq}`, file, status: err ? 'error' : 'uploading', progress: 0, error: err ?? undefined };
    });
    update((prev) => (multiple ? [...prev, ...fresh] : fresh));
    fresh.filter((f) => f.status !== 'error').forEach(start);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const hint = [accept?.length ? typesLabel(accept) : 'Any file', `up to ${formatBytes(maxSize)}`].join(' · ');

  return (
    <div className="yx-upload">
      <div
        className="yx-upload__zone"
        data-over={over || undefined}
        data-disabled={disabled || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <Icon icon={Upload} size="md" />
        <p>
          Drag files here or{' '}
          <button type="button" className="yx-button" data-variant="secondary" data-size="sm" disabled={disabled} onClick={() => inputRef.current?.click()} aria-describedby={cxIds(hintId, controlProps['aria-describedby'])}>
            Browse files
          </button>
        </p>
        <p id={hintId} className="yx-upload__hint">
          {hint}
        </p>
        <input
          ref={inputRef}
          id={controlProps.id}
          type="file"
          hidden
          multiple={multiple}
          accept={accept?.join(',')}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {items.length > 0 && (
        <ul className="yx-upload__list" aria-live="polite">
          {items.map((it) => (
            <li key={it.id} className="yx-upload__item" data-status={it.status}>
              <Icon icon={FileText} />
              <div className="yx-upload__meta">
                <span className="yx-upload__name">{it.file.name}</span>
                <span className="yx-upload__sub">
                  {it.status === 'uploading' && `Uploading ${it.progress}% · ${formatBytes(it.file.size)}`}
                  {it.status === 'scanning' && (
                    <>
                      <Icon icon={ShieldCheck} /> Checking for viruses
                    </>
                  )}
                  {it.status === 'done' && (
                    <>
                      <Icon icon={CheckCircle2} /> Uploaded · {formatBytes(it.file.size)}
                    </>
                  )}
                  {it.status === 'error' && (
                    <>
                      <Icon icon={AlertCircle} /> {it.error}
                    </>
                  )}
                </span>
                {it.status === 'uploading' && (
                  <span className="yx-progress" role="progressbar" aria-valuenow={it.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${it.file.name}`}>
                    <span style={{ width: `${it.progress}%` }} />
                  </span>
                )}
              </div>
              {it.status === 'error' && !checkFile(it.file) && (
                <button type="button" className="yx-button" data-variant="secondary" data-size="sm" onClick={() => start(it)}>
                  <Icon icon={RotateCcw} /> Retry
                </button>
              )}
              <IconButton icon={X} size="sm" label={`Remove ${it.file.name}`} onClick={() => update((prev) => prev.filter((x) => x.id !== it.id))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** ".pdf" or "application/pdf" → "PDF"; "image/jpeg" or ".jpeg" → "JPG"; "image/*" → "images". Joined as "PDF, JPG or PNG". */
export function typesLabel(accept: string[]) {
  const names = [
    ...new Set(
      accept.map((a) => {
        const t = a.toLowerCase();
        if (t.endsWith('/*')) return `${t.slice(0, -2)}s`;
        const n = (t.includes('/') ? t.split('/')[1].split('+')[0] : t.replace(/^\./, '')).toUpperCase();
        return n === 'JPEG' ? 'JPG' : n;
      }),
    ),
  ];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
}

function cxIds(...ids: (string | undefined)[]) {
  return ids.filter(Boolean).join(' ') || undefined;
}
