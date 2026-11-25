import { redirect } from 'next/navigation';

// Retired in Settings S-10 (answer 1327): each person connects their work calendar on Settings › Calendar & chat.
export default function V2CalendarPage() {
  redirect('/yx/settings/integrations/calendar-and-chat');
}
