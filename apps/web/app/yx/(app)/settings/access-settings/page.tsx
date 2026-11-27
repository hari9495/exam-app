import { MovedPage } from '../../moved-page';

// Settings S-7 (answer 1321): access and privacy settings are on 2.2 Directory and privacy.
// T2-F 82 (answer 2887): the old address shows the moved-page stub for 6 months, then opens the new page.
export default function YxAccessSettingsPage() {
  return <MovedPage from="/yx/settings/access-settings" />;
}
