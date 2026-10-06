import type { Meta, StoryObj } from '@storybook/react-vite';
import { d } from './platform-data';
import {
  CustomObjectPhone, CustomObjectScreen, LayoutBuilderScreen, ObjectBuilderScreen, PackagesScreen, RequestTypeBuilderScreen, type PackageRow, type UniformRecord,
} from './custom';

const meta: Meta = { title: 'Screens/Platform/Customisation', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

/* PLT-22 */
export const PLT22Fields: S = { name: 'PLT-22 · Object builder · fields', render: () => <ObjectBuilderScreen /> };
export const PLT22Sensitive: S = { name: 'PLT-22 · Object builder · field sheet, sensitive label warning', render: () => <ObjectBuilderScreen fieldSheet={{ label: 'Medical fitness certificate', cls: 'Internal', type: 'File' }} /> };
export const PLT22Relationships: S = { name: 'PLT-22 · Object builder · relationships', render: () => <ObjectBuilderScreen tab="relationships" status="Active" /> };
export const PLT22Scope: S = { name: 'PLT-22 · Object builder · scope model', render: () => <ObjectBuilderScreen tab="scope" /> };
export const PLT22Starters: S = { name: 'PLT-22 · Object builder · starters', render: () => <ObjectBuilderScreen tab="starters" /> };

/* PLT-23 */
export const PLT23Canvas: S = { name: 'PLT-23 · Layout builder · canvas (desk preview)', render: () => <LayoutBuilderScreen /> };
export const PLT23Mobile: S = { name: 'PLT-23 · Layout builder · mobile preview as employee', render: () => <LayoutBuilderScreen preview="mobile" role="emp" /> };
export const PLT23Rule: S = { name: 'PLT-23 · Layout builder · conditional rule', render: () => <LayoutBuilderScreen ruleOpen /> };
export const PLT23Locked: S = { name: 'PLT-23 · Layout builder · locked field can’t be hidden', render: () => <LayoutBuilderScreen hideLockedTried /> };

/* PLT-24 */
export const PLT24Layout: S = { name: 'PLT-24 · Request-type builder · layout', render: () => <RequestTypeBuilderScreen /> };
export const PLT24Policy: S = { name: 'PLT-24 · Request-type builder · policy', render: () => <RequestTypeBuilderScreen current="policy" /> };
export const PLT24Effect: S = { name: 'PLT-24 · Request-type builder · effect (payroll goes to review)', render: () => <RequestTypeBuilderScreen current="effect" effect="payroll" /> };
export const PLT24Review: S = { name: 'PLT-24 · Request-type builder · review', render: () => <RequestTypeBuilderScreen current="review" /> };

/* PLT-25 */
const PKGS: PackageRow[] = [
  { id: 'k4', version: '2026.09.4', created: d(28), author: 'Farhan Sheikh', changes: 4, status: 'Draft' },
  { id: 'k3', version: '2026.09.3', created: d(21), author: 'Farhan Sheikh', changes: 2, status: 'Awaiting approval', approver: 'Suresh Pillai' },
  { id: 'k2', version: '2026.09.2', created: d(12), author: 'Lakshmi Venkatesan', changes: 7, status: 'Promoted', approver: 'Suresh Pillai' },
  { id: 'k1', version: '2026.09.1', created: d(3), author: 'Lakshmi Venkatesan', changes: 1, status: 'Rejected', approver: 'Suresh Pillai' },
];
export const PLT25List: S = { name: 'PLT-25 · Packages & promotion', render: () => <PackagesScreen rows={PKGS} /> };
export const PLT25Diff: S = { name: 'PLT-25 · Packages · version diff', render: () => <PackagesScreen rows={PKGS} openId="k4" /> };
export const PLT25Promote: S = { name: 'PLT-25 · Packages · request promotion', render: () => <PackagesScreen rows={PKGS} promoteId="k4" /> };
export const PLT25Empty: S = { name: 'PLT-25 · Packages · empty', render: () => <PackagesScreen rows={[]} /> };

/* PLT-26 */
const UNIFORMS: UniformRecord[] = [
  { id: 'u1', ref: 'PPE-26-0412', employee: 'Ravi Shankar', item: 'Safety shoes', size: '9', issued: d(2), due: null, site: 'Hosur plant', status: 'Issued' },
  { id: 'u2', ref: 'PPE-26-0411', employee: 'Murugan K', item: 'Helmet', size: 'Standard', issued: d(2), due: d(2, 11), site: 'Hosur plant', status: 'Issued' },
  { id: 'u3', ref: 'PPE-26-0388', employee: 'Priya Dharshini', item: 'Uniform shirt', size: 'M', issued: d(18, 7), due: d(18, 8), site: 'Hosur plant', status: 'Overdue' },
  { id: 'u4', ref: 'PPE-26-0350', employee: 'Meera Krishnan', item: 'Gloves', size: 'S', issued: d(4, 7), due: d(4, 8), site: 'Chennai office', status: 'Returned' },
];
export const PLT26List: S = { name: 'PLT-26 · Custom object list', render: () => <CustomObjectScreen view="list" rows={UNIFORMS} /> };
export const PLT26Import: S = { name: 'PLT-26 · Custom object list · import', render: () => <CustomObjectScreen view="list" rows={UNIFORMS} importOpen /> };
export const PLT26Empty: S = { name: 'PLT-26 · Custom object list · empty', render: () => <CustomObjectScreen view="list" rows={[]} /> };
export const PLT26Loading: S = { name: 'PLT-26 · Custom object list · loading', render: () => <CustomObjectScreen view="list" rows={UNIFORMS} state="loading" /> };
export const PLT26Record: S = { name: 'PLT-26 · Custom object record', render: () => <CustomObjectScreen view="record" rows={UNIFORMS} /> };
export const PLT26PhoneList: S = { name: 'PLT-26 · Custom object list · phone', ...phone, render: () => <CustomObjectPhone view="list" rows={UNIFORMS} /> };
export const PLT26PhoneRecord: S = { name: 'PLT-26 · Custom object record · phone', ...phone, render: () => <CustomObjectPhone view="record" rows={UNIFORMS} /> };
