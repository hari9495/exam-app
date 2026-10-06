import type { Meta, StoryObj } from '@storybook/react-vite';
import { SuccessionScreen } from './assets';
import { SUCCESSION } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-26 · Succession', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'HR · critical positions and readiness', render: () => <SuccessionScreen positions={SUCCESSION} /> };
export const Risk: S = { name: 'No ready successor risk view', render: () => <SuccessionScreen positions={SUCCESSION} riskOnly /> };
export const AllCovered: S = { name: '· risk view, nothing at risk', render: () => <SuccessionScreen positions={SUCCESSION.filter((p) => p.id === 'sp2' || p.id === 'sp4')} riskOnly /> };
export const Manager: S = { name: 'Manager · no access', render: () => <SuccessionScreen positions={SUCCESSION} persona="mgr" /> };
