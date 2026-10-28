// Lifecycle batch 6a, wired to the API (M01-LIFECYCLE-BUILD-DESIGN §14): the onboarding board, checklists, my tasks,
// the document verification queue, "Joining soon" and the checklist templates in settings.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export {
  AddJoinerDrawer,
  ImportDrawer,
  FirstThirtyDaysScreen,
  type FirstThirtyDaysScreenProps,
  type TaskActions,
} from './lifecycle';
export { JourneyTemplatesScreen, type JourneyTemplatesScreenProps } from './templates';
export {
  JoinerPanel,
  PortalScreen,
  SignatoriesDrawer,
  type JoinerPanelProps,
  type PortalScreenProps,
  type SignatoriesDrawerProps,
} from './joining';
export {
  MyAssetsScreen,
  StartExitDialog,
  AddAssetDrawer,
  type MyAssetsScreenProps,
  type ExitCasesScreenProps,
  type ExitCaseScreenProps,
  type AssetsScreenProps,
} from './exits';
export {
  RehireCard,
  BuddyCard,
  BatchDialog,
  AddMembersDialog,
  PayeesDialog,
  ContractDialog,
  VrsCard,
  type BatchesScreenProps,
  type UpcomingExitsScreenProps,
  type RetrenchmentScreenProps,
} from './special';
// The alumni login and the joining portal render the designed T9-02 portal and T9 sign-in with their live paths.
export { AlumniPortalScreen, NomineePortalScreen, type AlumniPortalScreenProps, type LiveAlumniPortal, type LivePortalDoc } from '../../portals/t9-workforce';
export { PortalSignInScreen, type LiveOtpSignIn } from '../../portals/portals-kit';
