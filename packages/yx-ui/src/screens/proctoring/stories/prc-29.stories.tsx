import type { Meta, StoryObj } from '@storybook/react-vite';
import { CampusKitScreen, CoordinatorPortalScreen } from '../delivery';
import { liveCampus, liveCoordinator } from '../delivery-live-samples';

const meta: Meta<typeof CampusKitScreen> = { title: 'Screens/Proctoring/PRC-29 · Campus drive kit', component: CampusKitScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof CampusKitScreen>;

export const Registrants: S = { name: 'Registrants with dedupe' };
export const RegistrationForm: S = { name: 'Registration form settings', args: { tab: 'form' } };
export const Institutions: S = { name: 'Institution master', args: { tab: 'institutions' } };
export const AdmitCards: S = { name: 'Admit cards', args: { tab: 'admit' } };
export const CollegeReport: S = { name: 'College-wise report', args: { tab: 'report' } };
export const Coordinator: S = { name: 'College coordinator portal', render: () => <CoordinatorPortalScreen /> };
export const CoordinatorNoResults: S = { name: 'College coordinator, results not shared', render: () => <CoordinatorPortalScreen visibility="None" /> };

// AS-3 part 2: a real campus drive (live). No admit cards (answer 2014).
export const LiveRegistrants: S = { name: 'Live · registrants with a possible duplicate', render: () => <CampusKitScreen live={liveCampus()} /> };
export const LiveForm: S = { name: 'Live · registration form', render: () => <CampusKitScreen live={liveCampus()} tab="form" /> };
export const LiveNotCampus: S = { name: 'Live · not a campus drive yet', render: () => <CampusKitScreen live={liveCampus({ settings: null, registrants: [], report: [] })} tab="form" /> };
export const LiveInstitutions: S = { name: 'Live · institutions', render: () => <CampusKitScreen live={liveCampus()} tab="institutions" /> };
export const LiveReport: S = { name: 'Live · college-wise report', render: () => <CampusKitScreen live={liveCampus()} tab="report" /> };
export const LiveError: S = { name: 'Live · could not load', render: () => <CampusKitScreen live={liveCampus({ state: 'error' })} /> };
export const LiveCoordinator: S = { name: 'Live · coordinator, before results', render: () => <CoordinatorPortalScreen live={liveCoordinator()} /> };
export const LiveCoordinatorResults: S = { name: 'Live · coordinator, each result shared', render: () => <CoordinatorPortalScreen live={liveCoordinator({}, { visibility: 'per_candidate', resultsShown: true, counts: { registered: 1240, eligible: 1102, invited: 1102, attended: 1040, passed: 610 }, registrants: [{ name: 'Arjun Nair', rollNumber: '21CS140', registration: 'Eligible', test: 'Attended', result: 'Passed' }] })} /> };
export const LiveCoordinatorExpired: S = { name: 'Live · coordinator link expired', render: () => <CoordinatorPortalScreen live={{ state: 'expired', view: null, onCopyLink: () => Promise.resolve() }} /> };
