import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalibrationScreen } from './perf-talent';
import { CAL_CHANGES, CAL_PEOPLE, GUIDE } from './perf-data-4';
import { d } from './perf-data';

const meta: Meta = { title: 'Screens/Performance/PRF-09 · Calibration board and 9-box', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const SESSION = { name: 'Calibration · Quality and Engineering, H1', facilitator: 'Lakshmi Venkatesan', group: 'Quality and Engineering', date: d(4, 10) };

export const HrBoard: S = { name: 'HR · ratings board with guide', render: () => <CalibrationScreen persona="hr" session={SESSION} people={CAL_PEOPLE} guide={GUIDE} changes={CAL_CHANGES} /> };
export const ChangeWithReason: S = { name: 'HR · change rating with reason', render: () => <CalibrationScreen persona="hr" session={SESSION} people={CAL_PEOPLE} guide={GUIDE} changes={CAL_CHANGES} pendingMove={{ id: 'c8', to: 4 }} /> };
export const ManagerView: S = { name: 'Manager · own team movable', render: () => <CalibrationScreen persona="mgr" myTeam="Quality" session={SESSION} people={CAL_PEOPLE} guide={GUIDE} changes={CAL_CHANGES} /> };
export const NineBox: S = { name: '9-box (wave 6)', render: () => <CalibrationScreen persona="hr" session={SESSION} people={CAL_PEOPLE} guide={GUIDE} changes={CAL_CHANGES} tab="ninebox" /> };
export const ChangeLog: S = { name: 'Changes log', render: () => <CalibrationScreen persona="hr" session={SESSION} people={CAL_PEOPLE} guide={GUIDE} changes={CAL_CHANGES} tab="changes" /> };
export const Empty: S = { name: 'Empty (no manager ratings yet)', render: () => <CalibrationScreen persona="hr" session={SESSION} people={[]} guide={GUIDE} changes={[]} /> };
