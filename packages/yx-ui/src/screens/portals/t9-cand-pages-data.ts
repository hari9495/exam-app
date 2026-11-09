// Fictional sample data for the T9-09 candidate pages outside the app (founder decision 10).
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

export const CAND_BRAND = { tenant: 'Kaveri Foods', accent: '1F6F4A', careersHref: '#careers' };
/** Careers answer 357: a sample company logo (an inline image, so stories need no files). */
export const KAVERI_LOGO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='60'><rect width='300' height='60' rx='8' fill='%231F6F4A'/><text x='20' y='40' font-size='28' fill='white' font-family='sans-serif'>Kaveri Foods</text></svg>";

export const APP_STATUS = { jobTitle: 'QA Chemist', location: 'Hosur plant', appliedAt: d(2026, 10, 2), bucket: 'Under review', portalHref: '#portal' };

export const CAND_PORTAL = {
  name: 'Asha Rao',
  email: 'asha.rao@example.in',
  phone: '9876543210',
  hasResume: true,
  oneClick: true,
  applications: [
    {
      jobTitle: 'QA Chemist',
      bucket: 'Under review',
      appliedAt: d(2026, 10, 2),
      statusHref: '#status',
      interviews: [{ token: 'iv1', status: 'proposed', location: 'Hosur plant, QA lab', confirmed: false, startsAt: '2026-11-12T04:30:00.000Z', timeZone: 'Asia/Kolkata' }],
      offers: [],
    },
    {
      jobTitle: 'Production Supervisor',
      bucket: 'Moving forward — the team will be in touch',
      appliedAt: d(2026, 9, 14),
      statusHref: '#status',
      interviews: [{ token: null, status: 'confirmed', location: 'Video call', confirmed: true, startsAt: '2026-10-20T05:30:00.000Z', timeZone: 'Asia/Kolkata' }],
      offers: [{ token: 'of1', status: 'sent', startDate: d(2026, 12, 1) }],
    },
  ],
  openJobs: [{ id: 'j3', title: 'Area Sales Officer', location: 'Madurai', applyHref: '#apply' }],
};

export const OFFER = { jobTitle: 'Production Supervisor', compensation: '₹6,40,000 a year (CTC)', startDate: d(2026, 12, 1), expiresAt: d(2026, 11, 20), status: 'sent', pdfUrl: '#offer.pdf' };

export const INTERVIEW = {
  jobTitle: 'QA Chemist',
  location: 'Hosur plant, QA lab',
  timeZone: 'Asia/Kolkata',
  panel: ['Meera', 'Arjun'],
  status: 'proposed',
  confirmedSlotId: null as string | null,
  slots: [
    { id: 's1', startsAt: '2026-11-12T04:30:00.000Z', endsAt: '2026-11-12T05:15:00.000Z' },
    { id: 's2', startsAt: '2026-11-12T08:30:00.000Z', endsAt: '2026-11-12T09:15:00.000Z' },
    { id: 's3', startsAt: '2026-11-13T05:30:00.000Z', endsAt: '2026-11-13T06:15:00.000Z' },
  ],
  selfBook: null,
};

export const INTERVIEW_SELF_BOOK = {
  ...INTERVIEW,
  slots: [],
  selfBook: {
    minutes: 45,
    available: [
      { startsAt: '2026-11-12T04:30:00.000Z', endsAt: '2026-11-12T05:15:00.000Z' },
      { startsAt: '2026-11-12T05:30:00.000Z', endsAt: '2026-11-12T06:15:00.000Z' },
      { startsAt: '2026-11-13T09:00:00.000Z', endsAt: '2026-11-13T09:45:00.000Z' },
    ],
  },
};
