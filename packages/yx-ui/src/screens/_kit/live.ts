// The designed app frame and Home, for the live app (design audit steps 0 and 1).
export { DesktopFrame, SCREEN_RAIL, type AreaId, type DesktopFrameProps, type LiveFrame, type PanelItem, type PanelSection } from './frames';
export { PALETTE_PLACEHOLDER, RoleHomeScreen, type LiveHome, type RoleHomeScreenProps } from '../platform-a/shell-home';
// The Home panel's pages (design audit step 2): notifications, search, my requests, delegation, notification preferences.
export { NotificationsInboxScreen, MyRequestsScreen, DelegationScreen, type LiveInbox, type LiveMyRequests, type LiveDelegation, type NotificationsInboxProps } from '../platform-a/inbox';
export { SearchResultsScreen, type LiveSearchResults, type SearchHit } from '../platform-a/shell-home';
export { NotificationPreferencesScreen, type DigestMode, type NotificationPreference, type NotificationPreferencesProps } from '../platform-a/preferences';
export type { MyRequest, NotifCategory, PlatformNotification } from '../platform-a/platform-data';
