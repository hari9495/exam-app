'use client';

// v2 Drive detail — v2 shell (back link, title, status pill) + v2 Tabs (Live board / Results) around
// the reused DriveLiveBoard + DriveResults components. Logic/hooks verbatim (format only).
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DriveLiveBoard } from '../../../../../components/drives/DriveLiveBoard';
import { DriveResults } from '../../../../../components/drives/DriveResults';
import { useDrive } from '../../../../../lib/hooks/useDrives';
import { DriveSessionStatus } from '../../../../../lib/types';
import { Tabs, Pill } from '../../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../../components/ui-v2/viz';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };
const STATUS_TONE: Record<DriveSessionStatus, { c: string; label: string }> = {
  scheduled: { c: VIZ.azure, label: 'Scheduled' }, live: { c: STATUS.ok, label: 'Live' }, ended: { c: 'var(--muted)', label: 'Ended' },
};

export default function V2DrivePage() {
  const { driveId } = useParams<{ driveId: string }>();
  // GET /drives/:id gives the drive's name + derived status, so the tab defaults itself
  // (ended -> results, otherwise -> live). Manual tabs stay so a recruiter can flip anytime.
  const { data: drive } = useDrive(driveId);
  const [tab, setTab] = useState<'live' | 'results'>('live');
  useEffect(() => {
    if (drive) setTab(drive.status === 'ended' ? 'results' : 'live');
  }, [drive]);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Link href="/v2/walk-in-groups" style={backLink}><ArrowLeft size={15} /> Back to Walk-in Groups</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 16px' }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>{drive?.name ?? 'Drive'}</h1>
        {drive && <Pill c={STATUS_TONE[drive.status].c} label={STATUS_TONE[drive.status].label} />}
      </div>

      <Tabs tabs={[{ value: 'live', label: 'Live board' }, { value: 'results', label: 'Results' }]} value={tab} onChange={(v) => setTab(v as 'live' | 'results')} />
      {tab === 'live' && <DriveLiveBoard driveId={driveId} />}
      {tab === 'results' && <DriveResults driveId={driveId} />}
    </div>
  );
}
