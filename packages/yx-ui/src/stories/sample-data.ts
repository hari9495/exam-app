// Deterministic sample data for stories (fictional people and companies).

const FIRST = ['Divya', 'Arjun', 'Sana', 'Prakash', 'Thomas', 'Lakshmi', 'Rohit', 'Meera', 'Imran', 'Kavya', 'Vikram', 'Ananya', 'Suresh', 'Fatima', 'Rahul', 'Priya', 'Joseph', 'Neha', 'Karthik', 'Aisha', 'Gurpreet', 'Deepa', 'Manoj', 'Sneha'];
const LAST = ['Raghunathan', 'Kulkarni', 'Nizami', 'Menon', 'George', 'Venkatesan', 'Bhat', 'Iyer', 'Qureshi', 'Reddy', 'Singh', 'Das', 'Pillai', 'Shaikh', 'Sharma', 'Nair', 'Mathew', 'Joshi', 'Subramanian', 'Khan', 'Kaur', 'Rao', 'Patil', 'Ghosh'];
const DEPTS = ['Engineering', 'Operations', 'Finance', 'People', 'Sales', 'Quality'];
const ROLES: Record<string, string[]> = {
  Engineering: ['Software Engineer', 'Senior QA Engineer', 'Engineering Manager', 'DevOps Engineer'],
  Operations: ['Plant Supervisor', 'Warehouse Associate', 'Shift Lead', 'Maintenance Technician'],
  Finance: ['Payroll Executive', 'Accountant', 'Finance Manager'],
  People: ['HR Business Partner', 'Recruiter', 'HR Executive'],
  Sales: ['Sales Manager, South', 'Account Executive', 'Sales Associate'],
  Quality: ['Quality Inspector', 'Quality Manager'],
};
const LOCS = ['Bengaluru', 'Chennai', 'Hosur plant'];
const STATUSES = ['Active', 'Active', 'Active', 'Active', 'Active', 'Probation', 'On leave', 'Notice period'];

export interface Employee {
  id: string;
  code: string;
  name: string;
  role: string;
  department: string;
  location: string;
  joined: Date;
  ctc: number;
  status: string;
  manager: string;
}

// Small LCG so stories are identical on every load (needed for screenshot tests).
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

export function makeEmployees(n: number, seed = 7): Employee[] {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  return Array.from({ length: n }, (_, i) => {
    const department = pick(DEPTS);
    const role = pick(ROLES[department]);
    const base = role.includes('Manager') ? 140000 : role.includes('Senior') || role.includes('Lead') ? 95000 : department === 'Operations' ? 26000 : 58000;
    return {
      id: `e${i + 1}`,
      code: `KF-${String(i + 1).padStart(4, '0')}`,
      name: `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11 + Math.floor(i / FIRST.length)) % LAST.length]}`,
      role,
      department,
      location: pick(LOCS),
      joined: new Date(2016 + Math.floor(r() * 10), Math.floor(r() * 12), 1 + Math.floor(r() * 27)),
      ctc: Math.round((base * (0.85 + r() * 0.4)) / 100) * 100,
      status: pick(STATUSES),
      manager: `${pick(FIRST)} ${pick(LAST)}`,
    };
  });
}

export const statusTone = (v: unknown) =>
  v === 'Active' ? ('success' as const) : v === 'Probation' || v === 'Notice period' ? ('warning' as const) : ('neutral' as const);

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string;
  pm: string;
  status: 'Active' | 'On hold' | 'Draft' | 'Closed';
  billing: 'Time & material' | 'Fixed fee' | 'Retainer' | 'Non-billable';
  budgetHours: number;
  usedHours: number;
  contract: number;
  utilisation: number;
  end: Date;
}

export const PROJECTS: Project[] = [
  { id: 'p1', code: 'ACME-WEB', name: 'Website rebuild', client: 'Acme Retail', pm: 'Rohit Bhat', status: 'Active', billing: 'Time & material', budgetHours: 1200, usedHours: 742, contract: 2400000, utilisation: 82, end: new Date(2026, 11, 20) },
  { id: 'p2', code: 'ACME-MOB', name: 'Mobile app', client: 'Acme Retail', pm: 'Meera Iyer', status: 'Active', billing: 'Fixed fee', budgetHours: 900, usedHours: 810, contract: 1800000, utilisation: 91, end: new Date(2026, 10, 30) },
  { id: 'p3', code: 'NOVA-ERP', name: 'ERP integration', client: 'Nova Logistics', pm: 'Vikram Singh', status: 'Active', billing: 'Time & material', budgetHours: 600, usedHours: 655, contract: 1320000, utilisation: 77, end: new Date(2026, 9, 31) },
  { id: 'p4', code: 'NOVA-SUP', name: 'Support retainer', client: 'Nova Logistics', pm: 'Kavya Reddy', status: 'Active', billing: 'Retainer', budgetHours: 80, usedHours: 34, contract: 150000, utilisation: 64, end: new Date(2027, 2, 31) },
  { id: 'p5', code: 'SHRI-DSN', name: 'Brand and design system', client: 'Shri Textiles', pm: 'Ananya Das', status: 'On hold', billing: 'Fixed fee', budgetHours: 320, usedHours: 118, contract: 720000, utilisation: 0, end: new Date(2027, 0, 15) },
  { id: 'p6', code: 'INT-HIRE', name: 'Campus hiring drive', client: '', pm: 'Lakshmi Venkatesan', status: 'Active', billing: 'Non-billable', budgetHours: 200, usedHours: 96, contract: 0, utilisation: 0, end: new Date(2026, 11, 1) },
  { id: 'p7', code: 'GAIA-AUD', name: 'Security audit', client: 'Gaia Health', pm: 'Imran Qureshi', status: 'Draft', billing: 'Fixed fee', budgetHours: 160, usedHours: 0, contract: 480000, utilisation: 0, end: new Date(2027, 1, 28) },
  { id: 'p8', code: 'GAIA-OPS', name: 'Cloud operations', client: 'Gaia Health', pm: 'Rohit Bhat', status: 'Closed', billing: 'Time & material', budgetHours: 400, usedHours: 392, contract: 880000, utilisation: 79, end: new Date(2026, 7, 31) },
];

export const projectTone = (v: unknown) =>
  v === 'Active' ? ('success' as const) : v === 'On hold' ? ('warning' as const) : ('neutral' as const);
