// T2-G 84b (answer 2743): the kit's own words in English (the default, and the fallback for every word not yet in Hindi)
// and Hindi. One namespace per screen. Hindi may leave any word out; it may never have a word English does not have
// (i18n.test.tsx guards both).
// !! NEEDS A NATIVE HINDI READER BEFORE GO-LIVE !! Plain, polite (आप) standard Hindi, written by the builder.

export const EN = {
  myLanguage: {
    group: 'Me',
    title: 'Language',
    description: "The language for your company's own words (leave names, job titles) and, in Hindi, for the menu of your own pages and your notification emails.",
    card: 'Your language',
    field: 'Show company words in',
    helper: 'Your company writes them in {company}. Where it has no translation, you see those words.',
    notChosen: "You have not chosen yet: this is your company's choice for you.",
    saved: 'Saved. Company words now show in {language} where translated.',
    hindi: 'Hindi also changes the menu of your own pages (Home, Me, leave, attendance, payslips, help and approvals) and your notification emails. Words not yet in Hindi stay in English.',
    notSaved: 'Not saved',
    save: 'Save',
  },
} as const;

type Words<T> = { readonly [K in keyof T]?: T[K] extends string ? string : Words<T[K]> };

export const HI: Words<typeof EN> = {
  myLanguage: {
    group: 'मैं',
    title: 'भाषा',
    description: 'आपकी कंपनी के अपने शब्दों (छुट्टी के नाम, पदनाम) की भाषा, और हिन्दी चुनने पर आपके अपने पेजों के मेन्यू और सूचना ईमेल की भाषा।',
    card: 'आपकी भाषा',
    field: 'कंपनी के शब्द इस भाषा में दिखाएँ',
    helper: 'आपकी कंपनी इन्हें {company} में लिखती है। जहाँ अनुवाद नहीं है, वहाँ वही शब्द दिखते हैं।',
    notChosen: 'आपने अभी कोई भाषा नहीं चुनी है: यह आपकी कंपनी की चुनी हुई भाषा है।',
    saved: 'सहेज लिया गया। जहाँ अनुवाद है, वहाँ कंपनी के शब्द अब {language} में दिखेंगे।',
    hindi: 'हिन्दी चुनने पर आपके अपने पेजों (होम, मैं, छुट्टी, हाज़िरी, वेतन पर्चियाँ, सहायता और अनुमोदन) का मेन्यू और सूचना ईमेल भी हिन्दी में दिखते हैं। जो शब्द अभी हिन्दी में नहीं हैं, वे अंग्रेज़ी में रहते हैं।',
    notSaved: 'सहेजा नहीं गया',
    save: 'सहेजें',
  },
};
