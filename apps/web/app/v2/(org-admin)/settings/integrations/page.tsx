import { redirect } from 'next/navigation';

// Retired in Settings S-10 (answer 1327): Integrations, AI and Developers are drawn YukthiX pages now. Old bookmarks land
// on Settings › Integrations.
export default function V2IntegrationsPage() {
  redirect('/yx/settings/integrations/integrations');
}
