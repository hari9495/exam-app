// Single point of change for the product identity. The product name is a WORKING name:
// when it finalizes, edit here and flip productNameStatus to 'final'. No v2 file may
// contain the literal product name except this one.
export const BRAND = {
  productName: 'Workfox',
  companyName: 'Yukthix Consulting',
  productNameStatus: 'working',
} as const;
