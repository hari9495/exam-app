// Settings › Organisation screens (P01 §8). Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { LegalEntitiesScreen, entityInput, statutoryErrors, type LegalEntitiesScreenProps } from './entities';
export { LocationsScreen, locationInput, type LocationsScreenProps } from './locations';
export { StructureScreen, KINDS, CATEGORY_LABEL, masterInput, payRangeErrors, subtree, type PayAccess, type StructureScreenProps } from './structure';
export { ownershipLabel } from './org-kit';
export { CompanySettingsScreen, SETTING_SECTIONS, SCOPE_LABEL, companyValue, settingInput, valueLabel, type CompanySettingsScreenProps, type SettingsSection } from './settings';
