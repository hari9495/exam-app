import '../components/document.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DocumentViewer, type DocVersion, type DocumentViewerProps } from '../components/document';

const meta: Meta = { title: 'Workflow/Document viewer', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

// Inline placeholder "scan" of an experience letter. No external URLs.
const svg = (title: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754"><rect width="1240" height="1754" fill="white"/><rect x="100" y="100" width="260" height="60" fill="lightsteelblue"/><text x="100" y="260" font-family="sans-serif" font-size="44" fill="black">${title}</text><text x="100" y="330" font-family="sans-serif" font-size="26" fill="dimgray">Suryodaya Foods Pvt Ltd · Hosur, Tamil Nadu</text>${Array.from({ length: 18 }, (_, i) => `<rect x="100" y="${420 + i * 56}" width="${i % 5 === 4 ? 620 : 1040}" height="18" fill="gainsboro"/>`).join('')}<text x="100" y="1560" font-family="sans-serif" font-size="26" fill="black">Anita Rao, Chief Executive Officer</text></svg>`,
  )}`;

const PDF =
  'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAyNTYgPj4Kc3RyZWFtCkJUIC9GMSAyMCBUZiA3MiA3NjAgVGQgKE9mZmVyIGxldHRlcikgVGogL0YxIDEyIFRmIDAgLTMwIFRkIChTdXJ5b2RheWEgRm9vZHMgUHZ0IEx0ZCkgVGogMCAtMjAgVGQgKERlYXIgTWVlcmEgS3Jpc2huYW4sIHdlIGFyZSBwbGVhc2VkIHRvIG9mZmVyIHlvdSB0aGUgcm9sZSBvZiBTZW5pb3IgQWNjb3VudGFudC4pIFRqIDAgLTIwIFRkIChBbm51YWwgQ1RDOiBJTlIgMTQsMDAsMDAwLiBEYXRlIG9mIGpvaW5pbmc6IDA1IE9jdCAyMDI2LikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA1NDggMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo2MTgKJSVFT0YK';

const d = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m);
const IMAGE_VERSIONS: DocVersion[] = [
  { id: 'v3', label: 'Version 3', url: svg('Experience letter'), uploadedBy: 'Sana Nizami', uploadedAt: d(28, 16, 5), size: 245_760 },
  { id: 'v2', label: 'Version 2', url: svg('Experience letter (draft 2)'), uploadedBy: 'Imran Qureshi', uploadedAt: d(24, 11, 20), size: 238_400 },
  { id: 'v1', label: 'Version 1', url: svg('Experience letter (draft 1)'), uploadedBy: 'Imran Qureshi', uploadedAt: d(21, 9, 45), size: 231_900 },
];
const PDF_VERSIONS: DocVersion[] = [
  { id: 'p2', label: 'Version 2', url: PDF, uploadedBy: 'Nandini Iyer', uploadedAt: d(27, 14, 30), size: 184_320 },
  { id: 'p1', label: 'Version 1', url: PDF, uploadedBy: 'Nandini Iyer', uploadedAt: d(25, 10, 0), size: 180_200 },
];

const view = (p: Partial<DocumentViewerProps>) => <DocumentViewer fileName="experience-letter-meera-krishnan.png" versions={IMAGE_VERSIONS.slice(0, 1)} onPrint={() => {}} onDownload={() => {}} {...p} />;
const offer = (p: Partial<DocumentViewerProps>) => view({ fileName: 'offer-letter-meera-krishnan.pdf', versions: PDF_VERSIONS, ...p });

export const ImageFile: S = { name: 'Image', render: () => view({}) };
export const Pdf: S = { name: 'PDF', render: () => offer({}) };
export const Versions: S = { name: 'Version history, older version selected', render: () => view({ versions: IMAGE_VERSIONS, defaultVersion: 'v2' }) };
export const NotSent: S = { name: 'E-sign, not sent', render: () => offer({ esign: { status: 'not-sent', signers: [{ name: 'Meera Krishnan', status: 'not-sent' }] } }) };
export const Waiting: S = {
  name: 'E-sign, waiting',
  render: () =>
    offer({
      esign: {
        status: 'waiting',
        signers: [
          { name: 'Anita Rao', status: 'signed', at: d(27, 15, 10) },
          { name: 'Meera Krishnan', status: 'waiting' },
        ],
      },
    }),
};
export const Signed: S = {
  name: 'E-sign, signed',
  render: () =>
    offer({
      esign: {
        status: 'signed',
        signers: [
          { name: 'Anita Rao', status: 'signed', at: d(27, 15, 10) },
          { name: 'Meera Krishnan', status: 'signed', at: d(28, 9, 42) },
        ],
      },
    }),
};
export const Declined: S = {
  name: 'E-sign, declined',
  render: () =>
    offer({
      esign: {
        status: 'declined',
        signers: [
          { name: 'Anita Rao', status: 'signed', at: d(27, 15, 10) },
          { name: 'Meera Krishnan', status: 'declined', at: d(28, 9, 42) },
        ],
      },
    }),
};
export const Loading: S = { name: 'Loading', render: () => offer({ state: 'loading' }) };
export const CouldNotOpen: S = { name: 'Could not open', render: () => view({ versions: [{ ...IMAGE_VERSIONS[0], url: 'data:image/png;base64,broken' }] }) };
export const Unsupported: S = {
  name: 'Unsupported type',
  render: () => view({ fileName: 'appraisal-form-fy2026.docx', versions: [{ ...IMAGE_VERSIONS[0], url: '#', size: 58_400 }] }),
};
export const InDrawer: S = {
  name: 'In drawer',
  render: () =>
    offer({
      inDrawer: true,
      defaultOpen: true,
      esign: { status: 'waiting', signers: [{ name: 'Meera Krishnan', status: 'waiting' }] },
    }),
};
export const Mobile: S = {
  name: 'Image, mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => view({ versions: IMAGE_VERSIONS }),
};
