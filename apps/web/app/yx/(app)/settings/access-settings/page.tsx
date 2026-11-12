import { redirect } from 'next/navigation';

// Settings S-7 (answer 1321): Access and privacy is retired; its settings are on 2.1 Roles & access, 2.2 Directory &
// privacy, 2.3 Security and 2.10 Audit & data retention. The old address opens 2.2.
export default function YxAccessSettingsPage() {
  redirect('/yx/settings/people/directory-and-privacy');
}
