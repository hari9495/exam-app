// India's states and union territories, ISO 3166-2:IN (the 2020 codes: IN-OD Odisha, IN-TS Telangana, IN-CG Chhattisgarh,
// IN-UK Uttarakhand). The API's copy is apps/api/src/org-structure/org-validation.ts IN_STATES; a test there checks the two
// agree and that every state in the rule packs is listed, and the kit's india-states.test.ts checks every state code a
// screen uses is one of these.
export const IN_STATES: Readonly<Record<string, string>> = {
  'IN-AN': 'Andaman and Nicobar Islands',
  'IN-AP': 'Andhra Pradesh',
  'IN-AR': 'Arunachal Pradesh',
  'IN-AS': 'Assam',
  'IN-BR': 'Bihar',
  'IN-CH': 'Chandigarh',
  'IN-CG': 'Chhattisgarh',
  'IN-DH': 'Dadra and Nagar Haveli and Daman and Diu',
  'IN-DL': 'Delhi',
  'IN-GA': 'Goa',
  'IN-GJ': 'Gujarat',
  'IN-HR': 'Haryana',
  'IN-HP': 'Himachal Pradesh',
  'IN-JK': 'Jammu and Kashmir',
  'IN-JH': 'Jharkhand',
  'IN-KA': 'Karnataka',
  'IN-KL': 'Kerala',
  'IN-LA': 'Ladakh',
  'IN-LD': 'Lakshadweep',
  'IN-MP': 'Madhya Pradesh',
  'IN-MH': 'Maharashtra',
  'IN-MN': 'Manipur',
  'IN-ML': 'Meghalaya',
  'IN-MZ': 'Mizoram',
  'IN-NL': 'Nagaland',
  'IN-OD': 'Odisha',
  'IN-PY': 'Puducherry',
  'IN-PB': 'Punjab',
  'IN-RJ': 'Rajasthan',
  'IN-SK': 'Sikkim',
  'IN-TN': 'Tamil Nadu',
  'IN-TS': 'Telangana',
  'IN-TR': 'Tripura',
  'IN-UP': 'Uttar Pradesh',
  'IN-UK': 'Uttarakhand',
  'IN-WB': 'West Bengal',
};

/** The states as Select options, by name. */
export const IN_STATE_OPTIONS: { value: string; label: string }[] = Object.entries(IN_STATES)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label));
