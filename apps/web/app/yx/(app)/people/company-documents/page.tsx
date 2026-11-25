'use client';

import { useState } from 'react';
import { CompanyDocumentsScreen, type CompanyDocsData } from '@yukthix/ui/frame';
import { useLibrary, useLibraryDownload, useLibraryWrite } from '../../../../../lib/yx-library';

// People › Company documents (PPL-51, G4 item 21): folders for everyone or the document managers; managers
// (company.documents.manage) upload, replace and remove; downloads are audited (the API decides who sees what).
export default function YxCompanyDocumentsPage() {
  const [folder, setFolder] = useState<string | null>(null);
  const data = useLibrary<CompanyDocsData>(`/documents${folder ? `?folderId=${encodeURIComponent(folder)}` : ''}`);
  const write = useLibraryWrite();
  const download = useLibraryDownload();
  return (
    <CompanyDocumentsScreen
      live={{
        state: data.isError ? 'error' : data.data ? 'ready' : 'loading',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onFolder: setFolder,
        onAddFolder: (name, audience) => write('/documents/folders', { name, audience }),
        onRemoveFolder: async (id) => {
          await write(`/documents/folders/${encodeURIComponent(id)}/remove`);
          setFolder(null);
        },
        onUpload: (u) => {
          const f = new FormData();
          f.append('folderId', u.folderId);
          f.append('title', u.title);
          if (u.expiresOn) f.append('expiresOn', u.expiresOn);
          if (u.replaceId) f.append('replaceId', u.replaceId);
          f.append('file', u.file);
          return write('/documents', f);
        },
        onRemove: (id) => write(`/documents/${encodeURIComponent(id)}/remove`),
        onDownload: (d) => download(`/documents/${encodeURIComponent(d.id)}/file`, d.fileName),
      }}
    />
  );
}
