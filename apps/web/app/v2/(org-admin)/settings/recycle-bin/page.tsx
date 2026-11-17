import { redirect } from 'next/navigation';

// Retired (answer 2369): the recycle bin is Settings › Recycle bin in YukthiX, with hiring's deleted records in the same
// list. Old bookmarks land there.
export default function V2RecycleBinSettingsPage() {
  redirect('/yx/settings/recycle-bin');
}
