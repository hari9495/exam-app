'use client';

import { useParams } from 'next/navigation';
import { CampusKitScreen, type LiveCampusSettings, type LiveCollegeRow, type LiveDriveRow, type LiveInstitution, type LiveRegistrant } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../../lib/yx-hiring';
import { loadState } from '../../../../../../../lib/yx-assessments';

interface CampusView {
  drive: { id: string; name: string; status: LiveDriveRow['status']; orgSlug: string; tests: string[] };
  settings: LiveCampusSettings | null;
  registrants: LiveRegistrant[];
  report: LiveCollegeRow[];
}

// Assessments AS-3 part 2 › a drive's campus kit (PRC-29, answer 2014): the registration form and eligibility, the
// registrants with duplicate merge, the company's institutions with their coordinators, and the college-wise report.
// No admit cards. People who invite candidates (the API checks every call).
export default function YxDriveCampusPage() {
  const { id } = useParams<{ id: string }>();
  const view = useApi<CampusView>(`/asmt/drives/${id}/campus`);
  const institutions = useApi<LiveInstitution[]>('/asmt/institutions');
  const write = useApiWrite();
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const d = view.data;
  return (
    <CampusKitScreen
      live={{
        state: loadState({ isLoading: view.isLoading || institutions.isLoading, isError: view.isError || institutions.isError }),
        onRetry: () => {
          void view.refetch();
          void institutions.refetch();
        },
        drive: d?.drive ?? { id, name: 'Drive', status: 'Planning', tests: [] },
        registrationUrl: d ? `${origin}/walk-in/${d.drive.orgSlug}?group=${d.drive.id}` : '',
        settings: d?.settings ?? null,
        registrants: d?.registrants ?? [],
        report: d?.report ?? [],
        institutions: institutions.data ?? [],
        onSaveSettings: async (settings) => {
          await write('PUT', `/asmt/drives/${id}/campus`, { settings });
        },
        onSaveInstitution: async (instId, body) => {
          await write(instId ? 'PUT' : 'POST', instId ? `/asmt/institutions/${instId}` : '/asmt/institutions', body);
        },
        onSendCoordinatorLink: async (institutionId) => (await write<{ sentTo: string }>('POST', `/asmt/drives/${id}/coordinator-link`, { institutionId })).sentTo,
        onMerge: async (regId, intoId) => {
          await write('POST', `/asmt/registrants/${regId}/merge`, { intoId });
        },
        onNotDuplicate: async (regId) => {
          await write('POST', `/asmt/registrants/${regId}/not-duplicate`);
        },
        onCopyLink: (url) => navigator.clipboard.writeText(url),
      }}
    />
  );
}
