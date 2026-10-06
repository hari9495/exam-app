import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnonymousCaseScreen } from './t9-workforce';
import { ANON_CASE, KAVERI_ACCENT, TENANT } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-07 · Anonymous reporter case page', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { tenant: TENANT, accent: KAVERI_ACCENT, caseInfo: ANON_CASE };

export const CodeShownOnce: S = { name: 'After filing · code shown once', render: () => <AnonymousCaseScreen {...base} stage="code-shown" /> };
export const EnterCode: S = { name: 'Enter access code', render: () => <AnonymousCaseScreen {...base} stage="enter-code" /> };
export const WrongCode: S = { name: 'Wrong code', render: () => <AnonymousCaseScreen {...base} stage="wrong-code" /> };
export const Case: S = { name: 'Status and messages', render: () => <AnonymousCaseScreen {...base} stage="case" /> };
export const CasePhone: S = { name: 'Status and messages · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <AnonymousCaseScreen {...base} stage="case" /> };
export const Closed: S = { render: () => <AnonymousCaseScreen {...base} stage="closed" /> };
