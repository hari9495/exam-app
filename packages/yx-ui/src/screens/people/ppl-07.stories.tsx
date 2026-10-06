import type { Meta, StoryObj } from '@storybook/react-vite';
import { REVIEW_ID } from '../../components/stepper';
import { EmployeeImportWizard, SAMPLE_IMPORT } from './changes';

const meta: Meta = { title: 'Screens/People/PPL-07 · Employee import', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Upload: S = { name: 'Upload', render: () => <EmployeeImportWizard /> };
export const Map: S = { name: 'Match columns', render: () => <EmployeeImportWizard current="map" /> };
export const Validation: S = { name: 'Validation preview with problems', render: () => <EmployeeImportWizard current="validate" /> };
export const Clean: S = { name: 'Validation preview, all ready', render: () => <EmployeeImportWizard current="validate" rows={[SAMPLE_IMPORT[0], SAMPLE_IMPORT[4]]} /> };
export const Review: S = { name: 'Review', render: () => <EmployeeImportWizard current={REVIEW_ID} /> };
