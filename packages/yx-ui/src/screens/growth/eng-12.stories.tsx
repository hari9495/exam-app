import type { Meta, StoryObj } from '@storybook/react-vite';
import { PerksScreen } from './engage-recognition';
import { PERKS } from './engage-data';

const meta: Meta = { title: 'Screens/Engage/ENG-12 · Perks', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const CATS = ['Phones', 'Travel', 'Learning', 'Groceries'] as const;

export const Offers: S = { name: 'Category tabs with partner offers', render: () => <PerksScreen offers={PERKS} categories={[...CATS]} /> };
export const Detail: S = { name: 'Offer detail', render: () => <PerksScreen offers={PERKS} categories={[...CATS]} openId="o1" /> };
export const Consent: S = { name: 'Consent at redemption (fields to share)', render: () => <PerksScreen offers={PERKS} categories={[...CATS]} openId="o1" consentOpen /> };
export const Code: S = { name: 'Code issued', render: () => <PerksScreen offers={PERKS} categories={[...CATS]} openId="o1" code="KAVERI-PERK-7Q2M" /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <PerksScreen device="phone" offers={PERKS} categories={[...CATS]} /> };
export const PhoneConsent: S = { name: 'Phone · consent sheet', globals: PHONE, render: () => <PerksScreen device="phone" offers={PERKS} categories={[...CATS]} openId="o4" consentOpen /> };
export const PerksOff: S = { name: 'Perks switched off (no tab)', render: () => <PerksScreen enabled={false} offers={PERKS} categories={[...CATS]} /> };
