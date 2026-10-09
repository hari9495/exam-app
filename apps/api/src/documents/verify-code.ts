import { randomBytes } from 'crypto';

// Shared pieces of issued documents (P05 YX-DOC-09 / 11): the public verify code printed on a document, and its
// reference number. The gap-free counter itself lives with each document table (a row locked by the issuing
// transaction), e.g. pay_document_counters.

const VERIFY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const VERIFY_CODE = /^[A-Z2-9]{10}$/;

/** 10 characters from 32 (50 bits): printed on the document, checked on the public page. */
export const verifyCode = () => Array.from(randomBytes(10), (b) => VERIFY_ALPHABET[b % VERIFY_ALPHABET.length]).join('');

/** "KFPL/PS/2026/000123" */
export const referenceNo = (prefix: string, code: string, year: number, n: number) => `${prefix}/${code}/${year}/${String(n).padStart(6, '0')}`;

/** Where a verify code is checked (the public page of the web app). */
export const verifyLink = (code: string) => `${(process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')}/yx/verify/${code}`;
