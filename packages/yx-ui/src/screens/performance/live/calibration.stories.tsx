import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalibrationSessions } from './calibration';

// Calibration sessions (in a cycle), wired (batch PM6); the reports are a designed screen now (batch T2-C). The board is the designed PRF-09 screen. In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Calibration', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;

export const Sessions: S = { render: () => <div className="yx-auth__page"><CalibrationSessions sessions={[{ id: 's1', name: 'Sales H1', facilitator: 'Lakshmi R', status: 'open', people: 12 }]} departments={[{ value: 'd1', label: 'Sales' }]} facilitators={[{ value: 'u1', label: 'Lakshmi R' }]} bands={['Below', 'Meets', 'Above']} onOpen={noop} onCreate={ok} /></div> };
/** Answer 2845: the company guide (Settings › Performance) fills a new session's guide; Open a session to see it. */
export const WithCompanyGuide: S = { render: () => <div className="yx-auth__page"><CalibrationSessions sessions={[]} departments={[{ value: 'd1', label: 'Sales' }]} facilitators={[{ value: 'u1', label: 'Lakshmi R' }]} bands={['Below', 'Meets', 'Above']} defaultGuide={{ bands: [{ label: 'Below', share: 15 }, { label: 'Meets', share: 70 }, { label: 'Above', share: 15 }], tolerance: 10 }} onOpen={noop} onCreate={ok} /></div> };
