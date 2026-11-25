import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LopInputScreen, LopReversalDrawer } from './payroll-inputs';
import type { PersonHit } from './live/inputs';
import { LOP_ROWS } from './pay-data';

const meta: Meta<typeof LopInputScreen> = { title: 'Screens/Pay/PAY-04 · Manual LOP input', component: LopInputScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LopInputScreen>;

export const Default: S = { name: 'Inline entry · one row with an error' };
export const BulkUpload: S = { name: 'Bulk upload · row validation', args: { upload: true } };
export const Frozen: S = { name: 'Period frozen · late request only', args: { locked: true, rows: LOP_ROWS.map((r) => ({ ...r, error: undefined })) } };
export const Empty: S = { name: 'Empty · no Assumed-present groups', args: { rows: [] } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
/** Stories: the people the sample search finds. */
const LOPR_PEOPLE: PersonHit[] = LOP_ROWS.slice(0, 4).map((r) => ({ id: r.id, name: r.employee, employeeCode: r.code }));
const sampleSearch = async (q: string) => LOPR_PEOPLE.filter((p) => `${p.name} ${p.employeeCode}`.toLowerCase().includes(q.trim().toLowerCase()));
/** Stories: the PAY-04 frozen screen with the drawer open (locked month) or sending HR to regularisation (open month). */
function LopReversalSample({ monthOpen = false }: { monthOpen?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <LopInputScreen locked={!monthOpen} rows={LOP_ROWS.map((r) => ({ ...r, error: undefined }))} />
      {open && (
        <LopReversalDrawer
          month="2026-08"
          monthOpen={monthOpen}
          regulariseHref="#regularisation"
          onSearch={sampleSearch}
          leaveTypes={[{ code: 'CL', name: 'Casual leave' }, { code: 'SL', name: 'Sick leave' }]}
          onSend={async () => undefined}
          onClose={() => setOpen(false)}
          start={monthOpen ? undefined : { who: LOPR_PEOPLE[1], days: [{ on: new Date(2026, 7, 21), shouldBe: 'present', leave: null }, { on: new Date(2026, 7, 24), shouldBe: 'half_day', leave: null }], reason: 'Was at the Hosur plant audit; the kiosk there was offline.' }}
        />
      )}
    </>
  );
}

export const ReverseLop: S = { name: 'Reverse loss of pay · locked month, paid next run', render: () => <LopReversalSample /> };
export const ReverseLopOpenMonth: S = { name: 'Reverse loss of pay · open month goes to regularisation', render: () => <LopReversalSample monthOpen /> };
