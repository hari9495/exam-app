'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, type StatusTone } from '../../../../components/ui';
import { BackLink } from '../../../../components/BackLink';
import { DriveLiveBoard } from '../../../../components/drives/DriveLiveBoard';
import { DriveResults } from '../../../../components/drives/DriveResults';
import { useDrive } from '../../../../lib/hooks/useDrives';
import { DriveSessionStatus } from '../../../../lib/types';

const STATUS_LABEL: Record<DriveSessionStatus, string> = { scheduled: 'Scheduled', live: 'Live', ended: 'Ended' };
const STATUS_TONE: Record<DriveSessionStatus, StatusTone> = { scheduled: 'info', live: 'success', ended: 'neutral' };

export default function DrivePage() {
  const { driveId } = useParams<{ driveId: string }>();
  // GET /drives/:id gives us the drive's name + derived status directly, so the tab defaults
  // itself (ended -> results, otherwise -> live). The manual tabs remain so a recruiter can
  // flip between the live board and results whenever they like.
  const { data: drive } = useDrive(driveId);

  const [tab, setTab] = useState<'live' | 'results'>('live');
  useEffect(() => {
    if (drive) setTab(drive.status === 'ended' ? 'results' : 'live');
  }, [drive]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <BackLink href="/walk-in-groups" label="Back to Walk-In Groups" />
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-recruiter-text">{drive?.name ?? 'Drive'}</h1>
          {drive && <StatusBadge tone={STATUS_TONE[drive.status]}>{STATUS_LABEL[drive.status]}</StatusBadge>}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as 'live' | 'results')}>
        <TabsList>
          <TabsTrigger value="live">Live board</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>
        <TabsContent value="live">
          <DriveLiveBoard driveId={driveId} />
        </TabsContent>
        <TabsContent value="results">
          <DriveResults driveId={driveId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
