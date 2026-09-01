import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn class-merge helper for the v2 component layer.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
