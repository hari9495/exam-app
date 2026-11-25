import { notFound } from 'next/navigation';

// Any /yx address that matches no page: without this, Next goes straight to the root global-not-found (Prudent
// Hire); here it renders app/yx/not-found.tsx, the YukthiX one.
export default function YxMissingPage() {
  notFound();
}
