import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, ok, play, pressFirst } from '../../_kit/story-play';
import { MyPayDocumentsScreen, type MyPayDocumentsScreenProps } from './documents';
import { PAY_DOCUMENTS } from './fixtures-5ab';

// Me › Pay documents (PAY-1.09): one's own payslips and letters as issued, with their verify codes. No earlier design
// had this list (PAY-21 is one payslip); these stories are its design, with Kaveri Foods data.
const meta: Meta = { title: 'Screens/Pay/Me · Pay documents', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const MINE = PAY_DOCUMENTS.documents.filter((x) => x.employeeId === 'e-arjun').map(({ person: _p, ...x }) => x);
const mine = (over: Partial<MyPayDocumentsScreenProps> = {}) => <MyPayDocumentsScreen state="ready" data={MINE} onDownload={ok} verifyUrl={(c) => `https://kaverifoods.yukthix.test/verify/${c}`} {...over} />;
export const MyDocuments: S = { name: 'My pay documents · current and superseded', render: () => mine() };
export const MyDocumentsPurged: S = { name: 'My pay documents · one deleted after its retention period', render: () => mine({ data: [{ ...MINE[0]!, purged: true }, MINE[1]!] }) };
export const MyDocumentsDownloadFailed: S = { name: 'My pay documents · download refused', render: () => mine({ onDownload: fails('Your session ended after 30 minutes. Sign in again to download.') }), play: play(pressFirst('Download PDF')) };
export const MyDocumentsEmpty: S = { name: 'My pay documents · none yet', render: () => mine({ data: [] }) };
export const MyDocumentsLoading: S = { name: 'My pay documents · loading', render: () => mine({ state: 'loading', data: null }) };
export const MyDocumentsError: S = { name: 'My pay documents · could not load', render: () => mine({ state: 'error', data: null, onRetry: () => undefined }) };
