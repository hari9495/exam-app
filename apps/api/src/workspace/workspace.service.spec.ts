import { requestLine, requestRef, withType } from './workspace.service';

// Ctrl K rows (PLT-20): "Casual leave · Arjun Mehta · Waiting", the name moved out of a leave title, never repeated.
describe('search request rows', () => {
  it('moves the leading name of a leave title to after what it is', () => {
    expect(requestLine('Arjun Mehta: Casual leave, 1 Oct – 2 Oct (2 days)', 'Arjun Mehta', 'pending')).toBe('Casual leave, 1 Oct – 2 Oct (2 days) · Arjun Mehta · Waiting');
  });
  it('adds the name when the title lacks it, and leaves it out when the title already says it', () => {
    expect(requestLine('Laptop for the new joiner', 'Meera Iyer', 'approved')).toBe('Laptop for the new joiner · Meera Iyer · Approved');
    expect(requestLine('Travel for Meera Iyer', 'Meera Iyer', 'rejected')).toBe('Travel for Meera Iyer · Rejected');
    expect(requestLine('Laptop', null, 'odd')).toBe('Laptop · odd');
    expect(requestLine('Meera Iyer: Casual leave, 27 Oct (1 day)', null, 'pending')).toBe('Casual leave, 27 Oct (1 day) · Meera Iyer · Waiting');
  });
  it('names the type only when the line does not already say it', () => {
    expect(withType('Leave', 'Casual leave, 1 Oct · Waiting')).toBe('Casual leave, 1 Oct · Waiting');
    expect(withType('Overtime', 'Mon 28 Sept (1 h) · Approved')).toBe('Overtime · Mon 28 Sept (1 h) · Approved');
  });
  it('shows the reference as My requests does', () => {
    expect(requestRef('0a1b2c3d-1111-2222-3333-444455556666')).toBe('0A1B2C3D');
  });
});
