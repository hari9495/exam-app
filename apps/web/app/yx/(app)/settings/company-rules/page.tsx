import { redirect } from 'next/navigation';

// Settings S-7 (answer 1321): Company rules is retired; each of its settings is on its drawn settings page now (search
// finds any of them). The old address opens Settings.
export default function YxCompanyRulesPage() {
  redirect('/yx/settings');
}
