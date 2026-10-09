import type { Meta, StoryObj } from '@storybook/react-vite';
import { APPROVALS, MY_REQUESTS, NOTIFICATIONS, SENT_BY_ME, d } from './platform-data';
import {
  ApprovalsInboxPhone, ApprovalsInboxScreen, DelegationPhone, DelegationScreen, MyRequestsPhone, MyRequestsScreen, NotificationsInboxPhone, NotificationsInboxScreen, RequestSheetPhone, RequestSheetScreen,
} from './inbox';

const meta: Meta = { title: 'Screens/Platform/Inbox & requests', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };
const HISTORY = APPROVALS.slice(0, 4).map((a, i) => ({ ...a, id: `h${i}`, status: (i === 3 ? 'Rejected' : 'Approved') as 'Approved' | 'Rejected' }));

/* PLT-03 */
export const PLT03Inbox: S = { name: 'PLT-03 · Notifications inbox', render: () => <NotificationsInboxScreen items={NOTIFICATIONS} /> };
export const PLT03Approvals: S = { name: 'PLT-03 · Notifications · Approvals category', render: () => <NotificationsInboxScreen items={NOTIFICATIONS} defaultCategory="Approvals" /> };
export const PLT03Caught: S = { name: 'PLT-03 · Notifications · all caught up', render: () => <NotificationsInboxScreen items={NOTIFICATIONS.map((n) => ({ ...n, read: true }))} defaultUnreadOnly /> };
export const PLT03Empty: S = { name: 'PLT-03 · Notifications · empty', render: () => <NotificationsInboxScreen items={[]} /> };
export const PLT03Loading: S = { name: 'PLT-03 · Notifications · loading', render: () => <NotificationsInboxScreen items={NOTIFICATIONS} state="loading" /> };
export const PLT03Error: S = { name: 'PLT-03 · Notifications · error', render: () => <NotificationsInboxScreen items={NOTIFICATIONS} state="error" /> };
export const PLT03Phone: S = { name: 'PLT-03 · Notifications · phone', ...phone, render: () => <NotificationsInboxPhone items={NOTIFICATIONS} /> };

/* PLT-04 */
export const PLT04Waiting: S = { name: 'PLT-04 · Approvals · waiting for me', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} /> };
export const PLT04Delegated: S = { name: 'PLT-04 · Approvals · delegated to me', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} defaultTab="delegated" /> };
export const PLT04Sent: S = { name: 'PLT-04 · Approvals · sent by me', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} defaultTab="sent" /> };
export const PLT04History: S = { name: 'PLT-04 · Approvals · team history', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} defaultTab="history" /> };
export const PLT04Bulk: S = { name: 'PLT-04 · Approvals · bulk approve 2 leave', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} defaultSelected={['a1', 'a2']} bulkConfirmOpen /> };
export const PLT04BulkMixed: S = { name: 'PLT-04 · Approvals · bulk blocked (high risk selected)', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} defaultSelected={['a1', 'a4']} /> };
export const PLT04Card: S = { name: 'PLT-04 · Approvals · card open (policy flag)', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} openId="a4" /> };
export const PLT04Reject: S = { name: 'PLT-04 · Approvals · reject with reason', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} openId="a4" defaultDecision="reject" /> };
export const PLT04Proxy: S = { name: 'PLT-04 · Approvals · raised on behalf', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} openId="a6" /> };
export const PLT04Empty: S = { name: 'PLT-04 · Approvals · empty', render: () => <ApprovalsInboxScreen waiting={[]} sent={[]} history={[]} /> };
export const PLT04Loading: S = { name: 'PLT-04 · Approvals · loading', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} state="loading" /> };
export const PLT04Error: S = { name: 'PLT-04 · Approvals · error', render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} state="error" /> };
export const PLT04Phone: S = { name: 'PLT-04 · Approvals · phone cards', ...phone, render: () => <ApprovalsInboxPhone waiting={APPROVALS} /> };
export const PLT04PhoneCard: S = { name: 'PLT-04 · Approvals · phone card open, send back', ...phone, render: () => <ApprovalsInboxPhone waiting={APPROVALS} openId="a3" defaultDecision="sendback" /> };

/* PLT-05 */
export const PLT05Picker: S = { name: 'PLT-05 · Request sheet · type picker', render: () => <RequestSheetScreen /> };
export const PLT05Leave: S = { name: 'PLT-05 · Request sheet · leave with live summary', render: () => <RequestSheetScreen defaultType="leave" defaultFrom={d(1, 9)} defaultTo={d(2, 9)} /> };
export const PLT05OverLimit: S = { name: 'PLT-05 · Request sheet · over balance (blocked)', render: () => <RequestSheetScreen defaultType="leave" defaultFrom={d(5, 9)} defaultTo={d(16, 9)} /> };
export const PLT05Locked: S = { name: 'PLT-05 · Request sheet · locked period (late request)', render: () => <RequestSheetScreen defaultType="leave" defaultLeaveType="sick" defaultFrom={d(25, 7)} defaultTo={d(25, 7)} lockedBefore={d(1)} /> };
export const PLT05Proxy: S = { name: 'PLT-05 · Request sheet · on behalf of (HR)', render: () => <RequestSheetScreen proxy defaultSubject="p5" /> };
export const PLT05Sick: S = { name: 'PLT-05 · Request sheet · sick leave needs certificate', render: () => <RequestSheetScreen defaultType="leave" defaultLeaveType="sick" defaultFrom={d(5, 9)} defaultTo={d(7, 9)} /> };
export const PLT05Letter: S = { name: 'PLT-05 · Request sheet · letter request', render: () => <RequestSheetScreen defaultType="letter" /> };
export const PLT05Expense: S = { name: 'PLT-05 · Request sheet · expense', render: () => <RequestSheetScreen defaultType="expense" /> };
export const PLT05Sent: S = { name: 'PLT-05 · Request sheet · sent on behalf', render: () => <RequestSheetScreen defaultType="leave" defaultSubject="p5" submitted /> };
export const PLT05Phone: S = { name: 'PLT-05 · Request sheet · phone type picker', ...phone, render: () => <RequestSheetPhone /> };
export const PLT05PhoneLeave: S = { name: 'PLT-05 · Request sheet · phone leave', ...phone, render: () => <RequestSheetPhone defaultType="leave" defaultFrom={d(1, 9)} defaultTo={d(2, 9)} /> };

/* PLT-06 */
export const PLT06List: S = { name: 'PLT-06 · My requests', render: () => <MyRequestsScreen rows={MY_REQUESTS} /> };
export const PLT06Withdraw: S = { name: 'PLT-06 · My requests · withdraw confirm', render: () => <MyRequestsScreen rows={MY_REQUESTS} withdrawId="r2" /> };
export const PLT06Empty: S = { name: 'PLT-06 · My requests · empty', render: () => <MyRequestsScreen rows={[]} /> };
export const PLT06Loading: S = { name: 'PLT-06 · My requests · loading', render: () => <MyRequestsScreen rows={MY_REQUESTS} state="loading" /> };
export const PLT06Error: S = { name: 'PLT-06 · My requests · error', render: () => <MyRequestsScreen rows={MY_REQUESTS} state="error" /> };
export const PLT06Phone: S = { name: 'PLT-06 · My requests · phone', ...phone, render: () => <MyRequestsPhone rows={MY_REQUESTS} /> };

/* PLT-07 */
export const PLT07Form: S = { name: 'PLT-07 · Delegation · new', render: () => <DelegationScreen defaultFrom={d(5, 9)} defaultTo={d(9, 9)} /> };
export const PLT07Errors: S = { name: 'PLT-07 · Delegation · errors (self, chained)', render: () => <DelegationScreen defaultFrom={d(9, 9)} defaultTo={d(5, 9)} defaultDelegate="p6" showErrors /> };
export const PLT07Active: S = { name: 'PLT-07 · Delegation · active', render: () => <DelegationScreen defaultFrom={d(5, 9)} defaultTo={d(9, 9)} defaultDelegate="p4" active /> };
export const PLT07Phone: S = { name: 'PLT-07 · Delegation · phone', ...phone, render: () => <DelegationPhone defaultFrom={d(5, 9)} defaultTo={d(9, 9)} defaultDelegate="p2" /> };
