import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalibrationSessions } from './calibration';

// Calibration sessions (in a cycle), wired (batch PM6); the reports are a designed screen now (batch T2-C). The board is the designed PRF-09 screen. In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Calibration', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;

export const Sessions: S = { render: () => <div className="yx-auth__page"><CalibrationSessions sessions={[{ id: 's1', name: 'Sales H1', facilitator: 'Lakshmi R', status: 'open', people: 12 }]} departments={[{ value: 'd1', label: 'Sales' }]} facilitators={[{ value: 'u1', label: 'Lakshmi R' }]} bands={['Below', 'Meets', 'Above']} onOpen={noop} onCreate={ok} /></div> };
