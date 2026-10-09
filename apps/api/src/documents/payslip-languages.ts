import { join } from 'path';

// Payslip languages (founder decision 5b-D2, 9 Oct 2026): English is the default; a layout may add Hindi, Tamil, Telugu or
// Kannada, and the wage slip then shows each label in that script with the English beside it. Google Noto fonts (SIL Open
// Font Licence, assets/fonts/OFL.txt), cut down to the glyphs these labels use by scripts/subset-payslip-fonts.py; the
// PDF embeds only the glyphs it prints. Changing a label below means running that script again (a test checks it).
// The wording should be read once by a native speaker before go-live.

export const PAYSLIP_LANGUAGES = ['en', 'hi', 'ta', 'te', 'kn'] as const;
export type PayslipLanguage = (typeof PAYSLIP_LANGUAGES)[number];
export type LocalLanguage = Exclude<PayslipLanguage, 'en'>;

export const FONT_DIR = join(__dirname, '..', '..', 'assets', 'fonts');
export const FONT_FILE: Record<LocalLanguage, string> = {
  hi: 'NotoSansDevanagari-Regular.subset.ttf',
  ta: 'NotoSansTamil-Regular.subset.ttf',
  te: 'NotoSansTelugu-Regular.subset.ttf',
  kn: 'NotoSansKannada-Regular.subset.ttf',
};

/** The wage-slip particulars and headings, by language. */
export const LABELS: Record<LocalLanguage, Record<string, string>> = {
  hi: {
    payslip: 'वेतन पर्ची',
    employerName: 'नियोक्ता',
    employeeName: 'नाम',
    employeeCode: 'कर्मचारी कोड',
    designation: 'पदनाम',
    period: 'वेतन अवधि',
    paidDays: 'भुगतान के दिन',
    earnings: 'अर्जित वेतन',
    deductions: 'कटौतियाँ',
    grossPay: 'सकल वेतन',
    netPay: 'शुद्ध भुगतान',
    payDate: 'भुगतान की तारीख',
  },
  ta: {
    payslip: 'ஊதியச் சீட்டு',
    employerName: 'வேலையளிப்பவர்',
    employeeName: 'பெயர்',
    employeeCode: 'பணியாளர் குறியீடு',
    designation: 'பதவி',
    period: 'ஊதியக் காலம்',
    paidDays: 'ஊதியம் பெற்ற நாட்கள்',
    earnings: 'ஈட்டிய ஊதியம்',
    deductions: 'பிடித்தங்கள்',
    grossPay: 'மொத்த ஊதியம்',
    netPay: 'நிகர ஊதியம்',
    payDate: 'ஊதியம் வழங்கிய தேதி',
  },
  te: {
    payslip: 'వేతన చీటీ',
    employerName: 'యజమాని',
    employeeName: 'పేరు',
    employeeCode: 'ఉద్యోగి కోడ్',
    designation: 'హోదా',
    period: 'వేతన కాలం',
    paidDays: 'చెల్లించిన రోజులు',
    earnings: 'సంపాదించిన వేతనం',
    deductions: 'తగ్గింపులు',
    grossPay: 'స్థూల వేతనం',
    netPay: 'నికర వేతనం',
    payDate: 'చెల్లింపు తేదీ',
  },
  kn: {
    payslip: 'ವೇತನ ಚೀಟಿ',
    employerName: 'ಉದ್ಯೋಗದಾತ',
    employeeName: 'ಹೆಸರು',
    employeeCode: 'ನೌಕರರ ಸಂಕೇತ',
    designation: 'ಹುದ್ದೆ',
    period: 'ವೇತನ ಅವಧಿ',
    paidDays: 'ಪಾವತಿಸಿದ ದಿನಗಳು',
    earnings: 'ಗಳಿಸಿದ ವೇತನ',
    deductions: 'ಕಡಿತಗಳು',
    grossPay: 'ಒಟ್ಟು ವೇತನ',
    netPay: 'ನಿವ್ವಳ ವೇತನ',
    payDate: 'ಪಾವತಿ ದಿನಾಂಕ',
  },
};

/** The regional language of a layout's list (the first one that is not English), if any. */
export const localOf = (languages: readonly string[] | null | undefined): LocalLanguage | null => (languages ?? []).find((l): l is LocalLanguage => l !== 'en' && l in LABELS) ?? null;

/** Every character the labels of a language use (what the font subset must keep). */
export const labelText = (lang: LocalLanguage) => Object.values(LABELS[lang]).join('');

/** Writes "label: value", with the regional label first when the payslip has a second language. */
export function writeLabel(doc: PDFKit.PDFDocument, local: LocalLanguage | null, key: string, english: string, value: string) {
  const own = local ? LABELS[local][key] : undefined;
  if (own) {
    doc.font(join(FONT_DIR, FONT_FILE[local!])).text(`${own} `, { continued: true });
    doc.font('Helvetica').text(`/ ${english}${value ? `: ${value}` : ''}`);
  } else doc.font('Helvetica').text(value ? `${english}: ${value}` : english);
}
