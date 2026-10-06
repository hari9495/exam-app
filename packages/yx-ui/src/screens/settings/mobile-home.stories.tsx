// Mobile tab map (APX-D §5): first run (MOB-01), Home tab (MOB-02 and Home flows), Time and Pay tab landings, expenses.
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  MobileAnnouncementScreen,
  MobileExpensesScreen,
  MobileFirstRunScreen,
  MobileHomeScreen,
  MobileKudosScreen,
  MobilePayTabScreen,
  MobileTeamMemberScreen,
  MobileTimeTabScreen,
  MobileTodosScreen,
} from './mobile-home';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Mobile/Home tab, first run, Time and Pay',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'mobile2', isRotated: false } },
};
export default meta;
type S = StoryObj;

export const FirstRunOtp: S = { name: 'MOB-01 First run · sign in with OTP', render: () => <MobileFirstRunScreen step="otp" /> };
export const FirstRunOtpError: S = { name: 'MOB-01 First run · wrong code', render: () => <MobileFirstRunScreen step="otp" otpError /> };
export const FirstRunLanguage: S = { name: 'MOB-01 First run · language', render: () => <MobileFirstRunScreen step="language" /> };
export const FirstRunNotifications: S = { name: 'MOB-01 First run · notifications', render: () => <MobileFirstRunScreen step="notifications" /> };
export const FirstRunDevice: S = { name: 'MOB-01 First run · device binding (restricted staff)', render: () => <MobileFirstRunScreen step="device" restricted /> };
export const FirstRunInstall: S = { name: 'MOB-01 First run · add to home screen', render: () => <MobileFirstRunScreen step="install" /> };

export const HomeEmployee: S = { name: 'MOB-02 Home · employee', render: () => <MobileHomeScreen /> };
export const HomeCheckedIn: S = { name: 'MOB-02 Home · checked in', render: () => <MobileHomeScreen checkedIn /> };
export const HomeManagerTeam: S = { name: 'MOB-02 Home · manager Team segment', render: () => <MobileHomeScreen manager defaultSegment="team" /> };
export const HomeNoTodos: S = { name: 'MOB-02 Home · nothing to do', render: () => <MobileHomeScreen todos={[]} /> };
export const HomeOffline: S = { name: 'MOB-02 Home · offline', render: () => <MobileHomeScreen state="offline" /> };
export const HomeLoading: S = { name: 'MOB-02 Home · loading', render: () => <MobileHomeScreen state="loading" /> };
export const HomeError: S = { name: 'MOB-02 Home · error', render: () => <MobileHomeScreen state="error" /> };

export const Todos: S = { name: 'Home · to-dos', render: () => <MobileTodosScreen /> };
export const TodosEmpty: S = { name: 'Home · to-dos · empty', render: () => <MobileTodosScreen todos={[]} /> };
export const Announcement: S = { name: 'Home · announcement to acknowledge', render: () => <MobileAnnouncementScreen /> };
export const AnnouncementDone: S = { name: 'Home · announcement acknowledged', render: () => <MobileAnnouncementScreen acknowledged /> };
export const Kudos: S = { name: 'Home · give kudos', render: () => <MobileKudosScreen /> };
export const KudosSent: S = { name: 'Home · kudos sent', render: () => <MobileKudosScreen sent /> };
export const TeamMember: S = { name: 'Home · Team · member profile', render: () => <MobileTeamMemberScreen /> };

export const TimeTab: S = { name: 'Time tab · landing', render: () => <MobileTimeTabScreen /> };
export const TimeTabLongLeave: S = { name: 'Time tab · on long leave', render: () => <MobileTimeTabScreen longLeave /> };
export const PayTab: S = { name: 'Pay tab · landing', render: () => <MobilePayTabScreen /> };
export const PayTabNoEwa: S = { name: 'Pay tab · earned wage access off', render: () => <MobilePayTabScreen ewa={false} /> };
export const Expenses: S = { name: 'Pay · expenses (camera-first)', render: () => <MobileExpensesScreen /> };
export const ExpensesEmpty: S = { name: 'Pay · expenses · empty', render: () => <MobileExpensesScreen claims={[]} /> };
