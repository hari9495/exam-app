// Shared fictional sample data for all product screens. Lead-owned; builders import and extend locally.
// Fictional company: Kaveri Foods Pvt Ltd (FMCG, 248 people, Bengaluru HQ, Chennai office, Hosur plant, Coimbatore unit).
import { makeEmployees, type Employee } from '../../stories/sample-data';

export { makeEmployees, type Employee };

export const COMPANY = { name: 'Kaveri Foods Pvt Ltd', shortName: 'Kaveri Foods', employees: 248 };

export const ENTITIES = [
  { id: 'kf-ka', name: 'Kaveri Foods Pvt Ltd', gstin: '29AAECK1234F1Z5', state: 'Karnataka' },
  { id: 'kf-tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', gstin: '33AAECK1234F1Z9', state: 'Tamil Nadu' },
];

export const LOCATIONS = [
  { id: 'blr', name: 'Bengaluru head office', address: '4th Floor, Prestige Meridian, MG Road, Bengaluru 560001', state: 'Karnataka', lat: 12.9756, lng: 77.6068, radiusM: 150 },
  { id: 'maa', name: 'Chennai office', address: '5th floor, Kaveri Towers, Taramani, Chennai 600113', state: 'Tamil Nadu', lat: 12.9894, lng: 80.2481, radiusM: 200 },
  { id: 'hsr', name: 'Hosur plant', address: 'SIPCOT Phase II, Hosur 635109', state: 'Tamil Nadu', lat: 12.7409, lng: 77.8253, radiusM: 400 },
  // Packing unit under the Tamil Nadu entity (ENTITIES[1]); its kiosk is KF-CBE-K1 (TIM-14).
  { id: 'cbe', name: 'Coimbatore unit', address: 'Plot 12, SIDCO Industrial Estate, Kurichi, Coimbatore 641021', state: 'Tamil Nadu', lat: 10.9601, lng: 76.9628, radiusM: 300 },
  // Depot under the Tamil Nadu entity, opens 1 Nov 2026: no staff and no clock-in fence until then (TIM-26, TIM-42).
  { id: 'mdu', name: 'Madurai depot', address: 'Plot 7, Kappalur Industrial Estate, Madurai 625008', state: 'Tamil Nadu', lat: 9.8817, lng: 78.0469, radiusM: 200, opens: new Date(2026, 10, 1) },
];

export const DEPARTMENTS = ['Engineering', 'Operations', 'Finance', 'People', 'Sales', 'Quality'];

/** The signed-in person in most screens (an employee who is also a manager). Quality, reporting to the Quality head (founder decision C1). */
export const ME = {
  id: 'e1',
  code: 'KF-0001',
  name: 'Divya Raghunathan',
  email: 'divya.r@kaverifoods.in',
  role: 'Senior QA Engineer',
  department: 'Quality',
  location: 'Chennai office',
  manager: 'Divya Menon',
};

export const HR_ADMIN = { name: 'Lakshmi Venkatesan', role: 'HR Business Partner', email: 'lakshmi.v@kaverifoods.in' };
export const PAYROLL_ADMIN = { name: 'Suresh Pillai', role: 'Payroll Manager', email: 'suresh.p@kaverifoods.in' };
export const RECRUITER = { name: 'Neha Joshi', role: 'Talent Acquisition Lead', email: 'neha.j@kaverifoods.in' };

/**
 * The 248 employees used by every screen (founder review 1 Oct 2026): a wide name pool so sorted lists don't show ten
 * people with one first name, locations as named in Settings › Locations, and managers who are real department heads
 * (Settings › Structure masters). Hosur plant has 118 people; the Coimbatore unit (Tamil Nadu entity) about a dozen.
 */
const FIRST_NAMES = [
  'Divya', 'Arjun', 'Sana', 'Prakash', 'Thomas', 'Lakshmi', 'Rohit', 'Meera', 'Imran', 'Kavya', 'Vikram', 'Ananya', 'Suresh', 'Fatima', 'Rahul',
  'Priya', 'Joseph', 'Neha', 'Karthik', 'Aisha', 'Gurpreet', 'Deepa', 'Manoj', 'Sneha', 'Abdul', 'Bhavya', 'Chitra', 'Dinesh', 'Elango', 'Farida',
  'Gopal', 'Harini', 'Irfan', 'Janaki', 'Kiran', 'Latha', 'Mohan', 'Nirmala', 'Omkar', 'Pavithra', 'Rajesh', 'Saravanan', 'Tanvi', 'Uma', 'Varun',
  'Waseem', 'Yamuna', 'Zubair', 'Ashwin', 'Bindu', 'Charan', 'Devika', 'Govind', 'Hema', 'Jayanth', 'Kalpana', 'Lokesh', 'Madhavi', 'Naveen', 'Revathi',
  'Sandeep', 'Shobha', 'Tejas', 'Vani', 'Akash', 'Bharathi', 'Chandrika', 'Dhruv', 'Eshwar', 'Geetha', 'Hamid', 'Indira', 'Jagdish', 'Kamala',
  'Lalitha', 'Mahesh', 'Nandini', 'Pradeep', 'Radhika', 'Sadiq', 'Shalini', 'Sridhar', 'Swathi', 'Tarun', 'Usha', 'Venkat', 'Yashwant', 'Anil',
  'Bala', 'Farhan', 'Girish', 'Ishaan', 'Jyothi', 'Kumar', 'Mallika', 'Nikhil', 'Parvathi', 'Raghav', 'Sunita', 'Vinod',
];
const LAST_NAMES = [
  'Raghunathan', 'Kulkarni', 'Nizami', 'Menon', 'George', 'Venkatesan', 'Bhat', 'Iyer', 'Qureshi', 'Reddy', 'Singh', 'Das', 'Pillai', 'Shaikh', 'Sharma',
  'Nair', 'Mathew', 'Joshi', 'Subramanian', 'Khan', 'Kaur', 'Rao', 'Patil', 'Ghosh', 'Hegde', 'Murthy', 'Krishnan', 'Balan', 'Chandran', 'Fernandes',
  'Gowda', 'Prabhu', 'Selvam', 'Thomas', 'Varghese',
];
/** Department heads (Settings › Structure masters); everyone else reports to their department's head. */
export const DEPARTMENT_HEADS: Record<string, { name: string; role: string }> = {
  Operations: { name: 'Ramesh Gowda', role: 'Head of Operations' },
  Quality: { name: 'Divya Menon', role: 'Head of Quality' },
  Engineering: { name: 'Karthik Subramanian', role: 'Engineering Manager' },
  Finance: { name: 'Meera Iyer', role: 'Finance Manager' },
  People: { name: 'Lakshmi Venkatesan', role: 'HR Business Partner' },
  Sales: { name: 'Vikram Rao', role: 'Sales Manager, South' },
};
/** People who appear across the product, placed at the top of the list with their real roles. */
const KEY_PEOPLE: { name: string; role: string; department: string; location: string; manager: string }[] = [
  { name: 'Lakshmi Venkatesan', role: 'HR Business Partner', department: 'People', location: 'Bengaluru head office', manager: 'Ramesh Iyer' },
  { name: 'Suresh Pillai', role: 'Payroll Manager', department: 'Finance', location: 'Bengaluru head office', manager: 'Meera Iyer' },
  { name: 'Meera Iyer', role: 'Finance Manager', department: 'Finance', location: 'Bengaluru head office', manager: 'Anand Rao' },
  { name: 'Arjun Kulkarni', role: 'System Admin', department: 'Engineering', location: 'Bengaluru head office', manager: 'Karthik Subramanian' },
  { name: 'Karthik Subramanian', role: 'Engineering Manager', department: 'Engineering', location: 'Chennai office', manager: 'Ramesh Iyer' },
  { name: 'Neha Joshi', role: 'Talent Acquisition Lead', department: 'People', location: 'Chennai office', manager: 'Lakshmi Venkatesan' },
  { name: 'Ramesh Gowda', role: 'Head of Operations', department: 'Operations', location: 'Hosur plant', manager: 'Ramesh Iyer' },
  { name: 'Divya Menon', role: 'Head of Quality', department: 'Quality', location: 'Hosur plant', manager: 'Ramesh Gowda' },
  { name: 'Vikram Rao', role: 'Sales Manager, South', department: 'Sales', location: 'Chennai office', manager: 'Ramesh Iyer' },
];

/** Names that belong to one named person (ME, key people, department heads, admins): the generator never reuses them. */
const RESERVED_NAMES = new Set([ME.name, ME.manager, HR_ADMIN.name, PAYROLL_ADMIN.name, RECRUITER.name, ...KEY_PEOPLE.map((k) => k.name), ...Object.values(DEPARTMENT_HEADS).map((h) => h.name)]);

export const EMPLOYEES = makeEmployees(248).map((e, i) => {
  if (i === 0) return { ...e, role: ME.role, department: ME.department, location: ME.location, manager: ME.manager };
  const key = KEY_PEOPLE[i - 1];
  if (key) return { ...e, ...key, status: 'Active' };
  const first = FIRST_NAMES[(i * 37) % FIRST_NAMES.length];
  const lastAt = i * 13 + Math.floor(i / FIRST_NAMES.length);
  let name = `${first} ${LAST_NAMES[lastAt % LAST_NAMES.length]}`;
  // A generated name that matches a named person takes the next surname instead.
  for (let k = 1; RESERVED_NAMES.has(name); k++) name = `${first} ${LAST_NAMES[(lastAt + k) % LAST_NAMES.length]}`;
  // ~118 at Hosur plant, about a dozen at the Coimbatore unit; the rest split between the two offices.
  const location = i % 21 < 10 ? 'Hosur plant' : i % 21 === 20 ? 'Coimbatore unit' : i % 2 ? 'Bengaluru head office' : 'Chennai office';
  return { ...e, name, location, manager: DEPARTMENT_HEADS[e.department]?.name ?? 'Lakshmi Venkatesan' };
});

/** People at a location (LOCATIONS name), from EMPLOYEES: the one headcount every screen shows. */
export const locationHeadcount = (location: string) => EMPLOYEES.filter((e) => e.location === location).length;
/** People employed by a legal entity (ENTITIES id), from their location's state: the one entity headcount every screen shows. */
export const entityHeadcount = (entityId: string) => {
  const state = ENTITIES.find((x) => x.id === entityId)?.state;
  return EMPLOYEES.filter((e) => LOCATIONS.find((l) => l.name === e.location)?.state === state).length;
};

/** Fixed "today" for every screen so screenshots never change: Tue 29 Sep 2026, 9:42 am IST. */
export const TODAY = new Date(2026, 8, 29, 9, 42);

/**
 * September 2026 payroll calendar, the one source for Pay and Time: attendance inputs freeze and lock at the cut-off,
 * the run is approved after it and salaries are paid on the pay date.
 */
export const PAY_CALENDAR = { period: 'September 2026', cutOff: new Date(2026, 8, 25), lock: new Date(2026, 8, 25), payDate: new Date(2026, 8, 30) };

export const HOLIDAYS_2026 = [
  { date: new Date(2026, 9, 2), name: 'Gandhi Jayanti' },
  { date: new Date(2026, 9, 20), name: 'Ayudha Puja' },
  { date: new Date(2026, 10, 8), name: 'Deepavali' },
  { date: new Date(2026, 11, 25), name: 'Christmas' },
];
