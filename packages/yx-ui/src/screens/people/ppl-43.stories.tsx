import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeclarationsSwitch, BfsiComplianceList, BfsiDeclarations, BfsiPhone } from './selfservice';

const meta: Meta = { title: 'Screens/People/PPL-43 · BFSI declarations', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Holdings: S = { name: 'Employee · holdings', render: () => <BfsiDeclarations /> };
export const Related: S = { name: 'Employee · related persons', render: () => <BfsiDeclarations tab="related" /> };
export const Conflict: S = { name: 'Employee · conflict of interest', render: () => <BfsiDeclarations tab="coi" /> };
export const Attest: S = { name: 'Employee · attestation with OTP', render: () => <BfsiDeclarations tab="attest" otpSent /> };
export const Switch: S = { name: 'Employee · under Me › Declarations (switch)', render: () => <BfsiDeclarations switcher={<DeclarationsSwitch value="annual" onChange={() => {}} due={1} />} /> };
export const Officer: S = { name: 'Compliance officer · register', render: () => <BfsiComplianceList /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <BfsiPhone /> };
export const NotDesignated: S = { name: 'Employee · not a designated person (nothing to declare)', render: () => <BfsiDeclarations notDesignated /> };
