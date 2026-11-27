import { notFound } from 'next/navigation';

// Any /yx address that matches no page: without this, Next goes straight to the root global-not-found (Prudent
// Hire); here (inside the app frame, T2-G) it renders app/yx/(app)/not-found.tsx, the designed Not found.
export default function YxMissingPage() {
  notFound();
}
