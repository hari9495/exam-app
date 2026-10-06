// Mobile tab map (APX-D §5): Requests tab, Me tab, Me › More and MOB-03 settings & security.
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  MobileCareersScreen,
  MobileCustomRequestScreen,
  MobileDocumentsScreen,
  MobileGrowthScreen,
  MobileHelpTicketsScreen,
  MobileLearningScreen,
  MobileMeTabScreen,
  MobileMoreScreen,
  MobileMyExitScreen,
  MobilePolicyAckScreen,
  MobilePresenceConsentScreen,
  MobilePrivacyScreen,
  MobileProbationReviewScreen,
  MobileProfileScreen,
  MobileRequestTypePickerScreen,
  MobileRequestsTabScreen,
  MobileRewardsScreen,
  MobileSettingsScreen,
  MobileSpeakUpScreen,
  MobileTimesheetApprovalsScreen,
  MobileVisitorsScreen,
} from './mobile-me';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Mobile/Requests and Me tabs',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'mobile2', isRotated: false } },
};
export default meta;
type S = StoryObj;

export const RequestsMine: S = { name: 'Requests tab · mine', render: () => <MobileRequestsTabScreen /> };
export const RequestsTeam: S = { name: 'Requests tab · team (manager)', render: () => <MobileRequestsTabScreen defaultSegment="team" /> };
export const RequestsEmployee: S = { name: 'Requests tab · employee (no team)', render: () => <MobileRequestsTabScreen manager={false} /> };
export const TypePicker: S = { name: 'Requests · type picker with custom types', render: () => <MobileRequestTypePickerScreen /> };
export const CustomRequest: S = { name: 'Requests · custom request type form', render: () => <MobileCustomRequestScreen /> };
export const CustomRequestSent: S = { name: 'Requests · custom request sent', render: () => <MobileCustomRequestScreen sent /> };
export const Probation: S = { name: 'Requests · probation review (confirm)', render: () => <MobileProbationReviewScreen /> };
export const ProbationExtend: S = { name: 'Requests · probation review (extend)', render: () => <MobileProbationReviewScreen decision="extend" /> };
export const ProbationError: S = { name: 'Requests · probation review · missing reason', render: () => <MobileProbationReviewScreen decision="terminate" errors /> };
export const Timesheets: S = { name: 'Requests · timesheet approvals (project manager)', render: () => <MobileTimesheetApprovalsScreen /> };
export const TimesheetsEmpty: S = { name: 'Requests · timesheet approvals · empty', render: () => <MobileTimesheetApprovalsScreen empty /> };

export const MeTab: S = { name: 'Me tab · landing', render: () => <MobileMeTabScreen /> };
export const MeTabNotice: S = { name: 'Me tab · serving notice', render: () => <MobileMeTabScreen servingNotice /> };
export const More: S = { name: 'Me · More', render: () => <MobileMoreScreen /> };
export const Profile: S = { name: 'Me · profile and change requests', render: () => <MobileProfileScreen /> };
export const ProfileNoPending: S = { name: 'Me · profile · no pending change', render: () => <MobileProfileScreen pending={false} /> };
export const Documents: S = { name: 'Me · documents, letters, certificates', render: () => <MobileDocumentsScreen /> };
export const Policy: S = { name: 'Me · policy acknowledgement (click)', render: () => <MobilePolicyAckScreen /> };
export const PolicyOtp: S = { name: 'Me · policy acknowledgement (OTP)', render: () => <MobilePolicyAckScreen method="otp" /> };
export const PolicyDone: S = { name: 'Me · policy acknowledged', render: () => <MobilePolicyAckScreen done /> };
export const Growth: S = { name: 'Me · goals, check-ins, 1:1s, review', render: () => <MobileGrowthScreen /> };
export const GrowthPip: S = { name: 'Me · PIP acknowledgement', render: () => <MobileGrowthScreen pip /> };
export const Learning: S = { name: 'Me · learning, my tests, skills', render: () => <MobileLearningScreen /> };
export const Help: S = { name: 'Me · help centre and my tickets', render: () => <MobileHelpTicketsScreen /> };
export const HelpEmpty: S = { name: 'Me · help centre · no tickets', render: () => <MobileHelpTicketsScreen empty /> };
export const SpeakUp: S = { name: 'Me · speak up (grievance, POSH, ethics)', render: () => <MobileSpeakUpScreen /> };
export const SpeakUpCode: S = { name: 'Me · speak up · anonymous access code', render: () => <MobileSpeakUpScreen anonymousDone /> };
export const Careers: S = { name: 'Me · referrals and internal jobs', render: () => <MobileCareersScreen /> };
export const Rewards: S = { name: 'Me · rewards', render: () => <MobileRewardsScreen /> };
export const Visitors: S = { name: 'Me · my visitors', render: () => <MobileVisitorsScreen /> };
export const VisitorsArrived: S = { name: 'Me · my visitors · arrival alert', render: () => <MobileVisitorsScreen arrived /> };
export const Presence: S = { name: 'Me · presence consent (given)', render: () => <MobilePresenceConsentScreen /> };
export const PresenceNone: S = { name: 'Me · presence consent (not given)', render: () => <MobilePresenceConsentScreen given={false} /> };
export const Exit: S = { name: 'Me · my exit (clearance, interview, assets)', render: () => <MobileMyExitScreen /> };
export const Privacy: S = { name: 'Me · privacy, who accessed my data', render: () => <MobilePrivacyScreen /> };
export const Settings: S = { name: 'MOB-03 Settings and security', render: () => <MobileSettingsScreen /> };
export const SettingsSignOut: S = { name: 'MOB-03 Settings · sign out everywhere', render: () => <MobileSettingsScreen confirmSignOut /> };
