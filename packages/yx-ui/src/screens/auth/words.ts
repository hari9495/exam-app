import { createContext, useContext } from 'react';

/*
 * The words of the sign-in pages (SEC-01, "Confirm it's you", first sign-in set-up) in English and Hindi.
 *
 * !! NEEDS NATIVE REVIEW BEFORE GO-LIVE !!  The Hindi (hi) wording was written by the builder (3 Nov 2026, founder
 * answer 1 in docs/yukthix/security-design-map.md). A native Hindi reader must check every line before go-live.
 *
 * Rules for both languages: plain and polite (आप); never say more than the English does. In particular the messages
 * that must not reveal whether an account exists stay conditional ("If … can sign in by code, we sent …" /
 * "अगर … तो हमने … भेजा है"), and a wrong password and an unknown email keep the same words.
 */

export type AuthLang = 'en' | 'hi';

/** The languages the sign-in pages are written in (English first, the default). */
export const AUTH_LANGUAGES: { value: AuthLang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी (Hindi)' },
];

/**
 * The language picked on the sign-in pages (P04 Q4). The live sign-in pages provide it and keep the choice on that
 * device; without a provider (My security, the step-up dialog, staff sign-in) the words are English and no picker shows.
 */
export const AuthLanguageContext = createContext<{ value: string; onChange: (lang: string) => void } | null>(null);

const EN = {
  lang: 'en' as AuthLang,
  // frame
  note: 'For company staff only',
  footer: { privacy: 'Privacy notice', terms: 'Terms of use', accessibility: 'Accessibility statement', grievance: 'Grievance officer', openSource: 'Open-source notices' },
  // sign in
  signIn: 'Sign in',
  chooseCompany: 'Choose your company',
  subIdentifyPasskey: 'Use your passkey, or start with your work email.',
  subIdentify: 'Start with your work email. We take you to the right way in for your company.',
  subMobile: 'We send a 6-digit code to your mobile number.',
  subRedirecting: 'Your company signs in with single sign-on, so there is no YukthiX password.',
  subPassword: 'Your company lets you sign in with a password.',
  subChooseCompany: 'Your sign-in works for more than one company. Pick the one you want now.',
  change: 'Change',
  passkeyButton: 'Sign in with a passkey',
  otherWays: 'Other ways to sign in',
  mobile: 'Mobile',
  continueWith: (name: string) => `Continue with ${name}`,
  continueWithMobile: 'Continue with mobile',
  or: 'or',
  optionsFailed: "Couldn't load other sign-in methods",
  tryAgain: 'Try again',
  signingInTo: (company: string): [string, string, string] => ['Signing in to ', company, ''],
  notYourCompany: 'Not your company?',
  takingYouTo: (where: string) => `Taking you to ${where}…`,
  takingYouToCompany: "Taking you to your company's sign-in page…",
  companies: 'Companies',
  signInAnotherWay: 'Sign in another way',
  workEmail: 'Work email',
  continue: 'Continue',
  mobileNumber: 'Mobile number',
  mobileHelper: "Add the country code if it isn't an Indian number.",
  textMeACode: 'Text me a code',
  sendCodeWhatsApp: 'Send a code on WhatsApp',
  useEmailInstead: 'Use my work email instead',
  password: 'Password',
  emailMeCode: 'Email me a code instead',
  forgot: 'Forgot your password?',
  orCompanyAccount: 'Or sign in with your company account',
  codeSentEmail: (to: string) => `If ${to} can sign in by code, we sent it a 6-digit code. It expires in 5 minutes.`,
  codeSentMobile: (to: string, channel: string) => `If ${to} can sign in by code, we sent it a 6-digit code by ${channel}. It expires in 5 minutes.`,
  sixDigitCode: '6-digit code',
  sendNewCode: 'Send a new code',
  enterFullEmail: 'Enter your full email, like name@company.com',
  enterWorkEmail: 'Enter your work email.',
  enterFullMobile: 'Enter your full mobile number, like 98450 12345',
  enterMobile: 'Enter your mobile number.',
  enterPassword: 'Enter your password.',
  enterCode: 'Enter the 6-digit code.',
  // forgot / reset
  resetTitle: 'Reset your password',
  resetSub: 'We email a link to reset it. It works for 15 minutes.',
  linkSent: (email: string) => `If ${email} has a YukthiX account, we sent it a reset link. With accounts in more than one company, each gets its own link.`,
  emailResetLink: 'Email me a reset link',
  backToSignIn: 'Back to sign in',
  passwordChanged: 'Password changed',
  newPasswordWorks: 'Your new password works now. You were signed out on every device, so sign in again.',
  chooseNewPassword: 'Choose a new password',
  passwordRule: (n: number) => `At least ${n} characters. Passwords found in known breaches are refused.`,
  newPassword: 'New password',
  typeItAgain: 'Type it again',
  notSame: 'The two passwords are not the same',
  getNewLink: 'Get a new link',
  saveNewPassword: 'Save new password',
  enterNewPassword: 'Enter a new password.',
  typeNewAgain: 'Type the new password again.',
  // confirm it's you
  confirmTitle: "Confirm it's you",
  oneMoreStep: 'One more step to sign in.',
  startAgain: 'Start again',
  waysToConfirm: "Ways to confirm it's you",
  choices: {
    passkey: { title: 'Passkey', description: 'Use your face, fingerprint or PIN on this device, or your security key.' },
    totp: { title: 'Authenticator app', description: 'Enter the 6-digit code from your authenticator app.' },
    otp: { title: 'Text message', description: 'We text a 6-digit code to your phone.' },
    recovery_code: { title: 'Recovery code', description: 'Use one of the codes you saved when you set this up.' },
  },
  codeLabel: { totp: '6-digit code from your authenticator app', otp: '6-digit code we sent to your phone', recovery_code: 'Recovery code' },
  sendOnWhatsApp: 'Send on WhatsApp',
  sentBy: (channel: string) => `We sent a code by ${channel}. It expires in 5 minutes.`,
  recoveryHelper: 'Each recovery code works once.',
  useMyPasskey: 'Use my passkey',
  confirm: 'Confirm',
  chooseAnotherWay: 'Choose another way',
  enterRecoveryCode: 'Enter one of your recovery codes.',
  // recovery codes
  saveCodesNow: 'Save these recovery codes now',
  eachCodeOnce: "Each code works once, if you lose your passkey or phone. We won't show them again.",
  recoveryCodes: 'Recovery codes',
  copied: 'Copied',
  copyCodes: 'Copy codes',
  download: 'Download',
  codesCopied: 'Codes copied',
  savedCodes: 'I have saved my recovery codes',
  tickTheBox: 'Save the codes, then tick this box.',
  done: 'Done',
  // first sign-in set-up
  accountSecure: 'Your account is secure',
  lastStep: 'Last step: keep a way back in.',
  secureAccount: 'Secure your account',
  roleNeedsNow: 'Your role needs it before you can continue.',
  roleNeedsBy: (day: string) => `Your role needs it. Set it up by ${day}.`,
  remindLater: 'Remind me later',
  waysToSignIn: 'Ways to sign in',
  setup: {
    passkey: { title: 'Passkey', description: 'Sign in with your face, fingerprint or PIN. No password or code needed.', badge: 'Recommended' },
    totp: { title: 'Authenticator app', description: 'Enter a 6-digit code from Google or Microsoft Authenticator after your password.' },
  },
  scanThis: 'Scan this with your authenticator app, then enter the 6-digit code it shows.',
  qrAlt: 'QR code for your authenticator app',
  cantScan: "Can't scan it? Enter this key in the app instead:",
  copyKey: 'Copy key',
  turnOn: 'Turn on',
  cancel: 'Cancel',
  enterAppCode: 'Enter the 6-digit code your app shows.',
};

export type AuthWords = typeof EN;

const HI: AuthWords = {
  lang: 'hi',
  note: 'केवल कंपनी के कर्मचारियों के लिए',
  footer: { privacy: 'गोपनीयता सूचना', terms: 'उपयोग की शर्तें', accessibility: 'सुगम्यता विवरण', grievance: 'शिकायत अधिकारी', openSource: 'ओपन-सोर्स सूचनाएँ' },
  signIn: 'साइन इन करें',
  chooseCompany: 'अपनी कंपनी चुनें',
  subIdentifyPasskey: 'अपनी पासकी इस्तेमाल करें, या अपने कार्य ईमेल से शुरू करें।',
  subIdentify: 'अपने कार्य ईमेल से शुरू करें। हम आपको आपकी कंपनी के सही साइन-इन तरीके तक ले जाएँगे।',
  subMobile: 'हम आपके मोबाइल नंबर पर 6 अंकों का कोड भेजेंगे।',
  subRedirecting: 'आपकी कंपनी सिंगल साइन-ऑन से साइन इन करती है, इसलिए YukthiX का कोई अलग पासवर्ड नहीं है।',
  subPassword: 'आपकी कंपनी आपको पासवर्ड से साइन इन करने देती है।',
  subChooseCompany: 'आपका साइन-इन एक से ज़्यादा कंपनियों के लिए है। अभी जिस कंपनी में जाना है, उसे चुनें।',
  change: 'बदलें',
  passkeyButton: 'पासकी से साइन इन करें',
  otherWays: 'साइन इन करने के दूसरे तरीके',
  mobile: 'मोबाइल',
  continueWith: (name: string) => `${name} से आगे बढ़ें`,
  continueWithMobile: 'मोबाइल से आगे बढ़ें',
  or: 'या',
  optionsFailed: 'साइन इन के दूसरे तरीके लोड नहीं हो सके',
  tryAgain: 'फिर से कोशिश करें',
  signingInTo: (company: string): [string, string, string] => ['', company, ' में साइन इन हो रहा है'],
  notYourCompany: 'यह आपकी कंपनी नहीं है?',
  takingYouTo: (where: string) => `आपको ${where} पर ले जाया जा रहा है…`,
  takingYouToCompany: 'आपको आपकी कंपनी के साइन-इन पेज पर ले जाया जा रहा है…',
  companies: 'कंपनियाँ',
  signInAnotherWay: 'किसी दूसरे तरीके से साइन इन करें',
  workEmail: 'कार्य ईमेल',
  continue: 'आगे बढ़ें',
  mobileNumber: 'मोबाइल नंबर',
  mobileHelper: 'अगर नंबर भारत का नहीं है, तो देश का कोड जोड़ें।',
  textMeACode: 'मुझे SMS से कोड भेजें',
  sendCodeWhatsApp: 'WhatsApp पर कोड भेजें',
  useEmailInstead: 'इसके बजाय मेरा कार्य ईमेल इस्तेमाल करें',
  password: 'पासवर्ड',
  emailMeCode: 'इसके बजाय मुझे ईमेल पर कोड भेजें',
  forgot: 'पासवर्ड भूल गए?',
  orCompanyAccount: 'या अपनी कंपनी के खाते से साइन इन करें',
  codeSentEmail: (to: string) => `अगर ${to} कोड से साइन इन कर सकता है, तो हमने उस पर 6 अंकों का कोड भेजा है। यह 5 मिनट में समाप्त हो जाएगा।`,
  codeSentMobile: (to: string, channel: string) => `अगर ${to} कोड से साइन इन कर सकता है, तो हमने उस पर ${channel} से 6 अंकों का कोड भेजा है। यह 5 मिनट में समाप्त हो जाएगा।`,
  sixDigitCode: '6 अंकों का कोड',
  sendNewCode: 'नया कोड भेजें',
  enterFullEmail: 'अपना पूरा ईमेल लिखें, जैसे name@company.com',
  enterWorkEmail: 'अपना कार्य ईमेल लिखें।',
  enterFullMobile: 'अपना पूरा मोबाइल नंबर लिखें, जैसे 98450 12345',
  enterMobile: 'अपना मोबाइल नंबर लिखें।',
  enterPassword: 'अपना पासवर्ड लिखें।',
  enterCode: '6 अंकों का कोड लिखें।',
  resetTitle: 'अपना पासवर्ड रीसेट करें',
  resetSub: 'हम इसे रीसेट करने का लिंक ईमेल करेंगे। लिंक 15 मिनट तक काम करेगा।',
  linkSent: (email: string) => `अगर ${email} का YukthiX खाता है, तो हमने उस पर रीसेट लिंक भेजा है। एक से ज़्यादा कंपनियों में खाते हों, तो हर खाते को अलग लिंक मिलेगा।`,
  emailResetLink: 'मुझे रीसेट लिंक ईमेल करें',
  backToSignIn: 'साइन इन पर वापस जाएँ',
  passwordChanged: 'पासवर्ड बदल गया',
  newPasswordWorks: 'आपका नया पासवर्ड अब काम करेगा। आपको हर डिवाइस से साइन आउट कर दिया गया है, इसलिए फिर से साइन इन करें।',
  chooseNewPassword: 'नया पासवर्ड चुनें',
  passwordRule: (n: number) => `कम से कम ${n} अक्षर। जो पासवर्ड किसी जाने-माने डेटा लीक में मिल चुके हैं, वे स्वीकार नहीं किए जाते।`,
  newPassword: 'नया पासवर्ड',
  typeItAgain: 'इसे फिर से लिखें',
  notSame: 'दोनों पासवर्ड एक जैसे नहीं हैं',
  getNewLink: 'नया लिंक पाएँ',
  saveNewPassword: 'नया पासवर्ड सेव करें',
  enterNewPassword: 'नया पासवर्ड लिखें।',
  typeNewAgain: 'नया पासवर्ड फिर से लिखें।',
  confirmTitle: 'पुष्टि करें कि यह आप ही हैं',
  oneMoreStep: 'साइन इन करने के लिए एक और कदम।',
  startAgain: 'फिर से शुरू करें',
  waysToConfirm: 'पुष्टि करने के तरीके',
  choices: {
    passkey: { title: 'पासकी', description: 'इस डिवाइस पर अपना चेहरा, फ़िंगरप्रिंट या PIN, या अपनी सिक्योरिटी की इस्तेमाल करें।' },
    totp: { title: 'ऑथेंटिकेटर ऐप', description: 'अपने ऑथेंटिकेटर ऐप से 6 अंकों का कोड लिखें।' },
    otp: { title: 'SMS संदेश', description: 'हम आपके फ़ोन पर 6 अंकों का कोड SMS करेंगे।' },
    recovery_code: { title: 'रिकवरी कोड', description: 'सेट-अप करते समय सेव किए गए कोड में से कोई एक इस्तेमाल करें।' },
  },
  codeLabel: { totp: 'आपके ऑथेंटिकेटर ऐप का 6 अंकों का कोड', otp: 'आपके फ़ोन पर भेजा गया 6 अंकों का कोड', recovery_code: 'रिकवरी कोड' },
  sendOnWhatsApp: 'WhatsApp पर भेजें',
  sentBy: (channel: string) => `हमने ${channel} से कोड भेजा है। यह 5 मिनट में समाप्त हो जाएगा।`,
  recoveryHelper: 'हर रिकवरी कोड सिर्फ़ एक बार काम करता है।',
  useMyPasskey: 'मेरी पासकी इस्तेमाल करें',
  confirm: 'पुष्टि करें',
  chooseAnotherWay: 'कोई दूसरा तरीका चुनें',
  enterRecoveryCode: 'अपना कोई एक रिकवरी कोड लिखें।',
  saveCodesNow: 'ये रिकवरी कोड अभी सेव करें',
  eachCodeOnce: 'अगर आपकी पासकी या फ़ोन खो जाए, तो हर कोड एक बार काम करेगा। हम इन्हें दोबारा नहीं दिखाएँगे।',
  recoveryCodes: 'रिकवरी कोड',
  copied: 'कॉपी हो गया',
  copyCodes: 'कोड कॉपी करें',
  download: 'डाउनलोड करें',
  codesCopied: 'कोड कॉपी हो गए',
  savedCodes: 'मैंने अपने रिकवरी कोड सेव कर लिए हैं',
  tickTheBox: 'कोड सेव करें, फिर इस बॉक्स पर टिक करें।',
  done: 'हो गया',
  accountSecure: 'आपका खाता सुरक्षित है',
  lastStep: 'आखिरी कदम: खाते में वापस आने का एक तरीका रखें।',
  secureAccount: 'अपना खाता सुरक्षित करें',
  roleNeedsNow: 'आगे बढ़ने से पहले आपकी भूमिका के लिए यह ज़रूरी है।',
  roleNeedsBy: (day: string) => `आपकी भूमिका के लिए यह ज़रूरी है। इसे ${day} तक सेट करें।`,
  remindLater: 'मुझे बाद में याद दिलाएँ',
  waysToSignIn: 'साइन इन करने के तरीके',
  setup: {
    passkey: { title: 'पासकी', description: 'अपने चेहरे, फ़िंगरप्रिंट या PIN से साइन इन करें। पासवर्ड या कोड की ज़रूरत नहीं।', badge: 'सुझाया गया' },
    totp: { title: 'ऑथेंटिकेटर ऐप', description: 'पासवर्ड के बाद Google या Microsoft Authenticator से 6 अंकों का कोड लिखें।' },
  },
  scanThis: 'इसे अपने ऑथेंटिकेटर ऐप से स्कैन करें, फिर ऐप में दिखा 6 अंकों का कोड लिखें।',
  qrAlt: 'आपके ऑथेंटिकेटर ऐप के लिए QR कोड',
  cantScan: 'स्कैन नहीं हो रहा? इसके बजाय यह की ऐप में लिखें:',
  copyKey: 'की कॉपी करें',
  turnOn: 'चालू करें',
  cancel: 'रद्द करें',
  enterAppCode: 'ऐप में दिखा 6 अंकों का कोड लिखें।',
};

/**
 * The sign-in errors people see (from the API and apps/web lib/yx-auth-messages), English → Hindi. A wrong password
 * and an unknown email share one English sentence, so they share one Hindi sentence too. Anything not listed stays in
 * English (better a correct English sentence than a guessed Hindi one).
 */
const HI_ERRORS: Record<string, string> = {
  'Invalid email or password.': 'ईमेल या पासवर्ड गलत है।',
  'Invalid credentials': 'ईमेल या पासवर्ड गलत है।',
  'Wrong email or password. Try again.': 'ईमेल या पासवर्ड गलत है। फिर से कोशिश करें।',
  'Too many tries. Wait a minute and try again.': 'बहुत ज़्यादा कोशिशें हो गईं। एक मिनट रुककर फिर से कोशिश करें।',
  'Too many tries. Wait a few minutes and try again.': 'बहुत ज़्यादा कोशिशें हो गईं। कुछ मिनट रुककर फिर से कोशिश करें।',
  'Too many sign-in attempts. Please wait and try again.': 'बहुत ज़्यादा कोशिशें हो गईं। कृपया थोड़ा रुककर फिर से कोशिश करें।',
  "That code didn't work. Check it and try again.": 'यह कोड काम नहीं किया। इसे जाँचकर फिर से कोशिश करें।',
  "That recovery code didn't work. It may already be used — try another one.": 'यह रिकवरी कोड काम नहीं किया। हो सकता है यह पहले इस्तेमाल हो चुका हो — कोई दूसरा कोड आज़माएँ।',
  'That verification did not work. Try again.': 'पुष्टि नहीं हो सकी। फिर से कोशिश करें।',
  "We couldn't sign you in with that account. Try another way, or ask your admin.": 'हम उस खाते से आपको साइन इन नहीं कर सके। कोई दूसरा तरीका आज़माएँ, या अपने एडमिन से पूछें।',
  "We couldn't sign you in with that passkey. If you see more than one, pick the one you made for this site, or sign in with your email.":
    'हम उस पासकी से आपको साइन इन नहीं कर सके। अगर एक से ज़्यादा पासकी दिखें, तो इस साइट के लिए बनाई गई पासकी चुनें, या अपने ईमेल से साइन इन करें।',
  "This browser can't open a passkey here. Use your work email instead.": 'यह ब्राउज़र यहाँ पासकी नहीं खोल सकता। इसके बजाय अपना कार्य ईमेल इस्तेमाल करें।',
  'The passkey prompt was closed or timed out. Try again.': 'पासकी की विंडो बंद हो गई या उसका समय खत्म हो गया। फिर से कोशिश करें।',
  'That did not work. Try again.': 'यह काम नहीं किया। फिर से कोशिश करें।',
  'This reset link is invalid or has expired': 'यह रीसेट लिंक अमान्य है या इसका समय खत्म हो गया है',
  'This sign-in link is invalid or has expired': 'यह साइन-इन लिंक अमान्य है या इसका समय खत्म हो गया है',
  'This account has been deactivated': 'यह खाता बंद कर दिया गया है',
  'That code is not right or has expired. Ask for a new one.': 'यह कोड सही नहीं है या इसका समय खत्म हो गया है। नया कोड मँगाएँ।',
  'That code is not right. Check the time on your phone and try again.': 'यह कोड सही नहीं है। अपने फ़ोन का समय जाँचें और फिर से कोशिश करें।',
  'This passkey could not be verified. Try again.': 'इस पासकी की पुष्टि नहीं हो सकी। फिर से कोशिश करें।',
  'Codes by text message are not available right now': 'SMS से कोड अभी उपलब्ध नहीं हैं',
  'One-time codes are temporarily unavailable. Please try again shortly.': 'वन-टाइम कोड अभी कुछ देर के लिए उपलब्ध नहीं हैं। कृपया थोड़ी देर बाद कोशिश करें।',
  'Sign-in is temporarily unavailable. Please try again shortly.': 'साइन इन अभी कुछ देर के लिए उपलब्ध नहीं है। कृपया थोड़ी देर बाद कोशिश करें।',
  'This way of signing in is not available': 'साइन इन का यह तरीका उपलब्ध नहीं है',
  'Enter a valid mobile number, with the country code if it is not an Indian number': 'सही मोबाइल नंबर लिखें; अगर नंबर भारत का नहीं है, तो देश का कोड भी लिखें',
  'Could not send a code': 'कोड नहीं भेजा जा सका',
  'Passkey setup has expired. Start again.': 'पासकी सेट-अप का समय खत्म हो गया। फिर से शुरू करें।',
  'Authenticator setup has expired. Start again.': 'ऑथेंटिकेटर सेट-अप का समय खत्म हो गया। फिर से शुरू करें।',
  'Your sign-in has expired. Please sign in again.': 'आपके साइन-इन का समय खत्म हो गया है। कृपया फिर से साइन इन करें।',
};

const hiWait = (parts: string) =>
  parts
    .replace(/(\d+) h\b/g, '$1 घंटे')
    .replace(/(\d+) hours?\b/g, '$1 घंटे')
    .replace(/(\d+) min\b/g, '$1 मिनट')
    .replace(/(\d+) minutes?\b/g, '$1 मिनट')
    .replace(/(\d+) sec\b/g, '$1 सेकंड')
    .replace(/(\d+) seconds?\b/g, '$1 सेकंड');

/** One error sentence in the chosen language (unknown sentences stay as they are). */
export function authError(lang: string, message: string): string {
  if (lang !== 'hi') return message;
  if (HI_ERRORS[message]) return HI_ERRORS[message];
  const wait = /^Too many tries\. Try again in (.+)\.$/.exec(message);
  if (wait) return `बहुत ज़्यादा कोशिशें हो गईं। ${hiWait(wait[1]!)} बाद फिर से कोशिश करें।`;
  const paused = /^Your access is paused for block leave until (.+)\. Ask HR if you need access sooner\.$/.exec(message);
  if (paused) return `ब्लॉक लीव के कारण आपकी पहुँच ${paused[1]} तक रोकी गई है। अगर आपको पहले पहुँच चाहिए, तो HR से पूछें।`;
  return message;
}

export const authWords = (lang: string | null | undefined): AuthWords => (lang === 'hi' ? HI : EN);

/** The sign-in words for the language picked (English without a provider), and `err` for error sentences. */
export function useAuthWords(): AuthWords & { err: (message: string) => string } {
  const lang = useContext(AuthLanguageContext)?.value;
  const w = authWords(lang);
  return { ...w, err: (m: string) => authError(w.lang, m) };
}
