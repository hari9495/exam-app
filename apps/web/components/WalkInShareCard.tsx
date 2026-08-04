'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button, useToast } from './ui';

interface WalkInShareCardProps {
  examId: string;
  orgSlug: string;
}

// Renders only once mounted -- window.location isn't available during SSR, and
// computing it there would produce a server/client markup mismatch.
export function WalkInShareCard({ examId, orgSlug }: WalkInShareCardProps) {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/walk-in/${orgSlug}?exam=${examId}`);
  }, [orgSlug, examId]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 160, margin: 1 }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) return null;

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast('Link copied.');
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Walk-in registration', url });
      } catch {
        // Cancelled by the user -- not an error.
      }
      return;
    }
    handleCopy();
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-recruiter-border bg-recruiter-bg-subtle p-3 sm:flex-row sm:items-center">
      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not an optimizable remote asset
        <img src={qrDataUrl} alt="QR code for walk-in registration" className="h-24 w-24 shrink-0 rounded bg-white p-1" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="break-all font-mono text-xs text-recruiter-text">{url}</p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleCopy} className="inline-flex items-center gap-1.5">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleShare} className="inline-flex items-center gap-1.5">
            <Share2 size={14} />
            Share
          </Button>
        </div>
      </div>
    </div>
  );
}
