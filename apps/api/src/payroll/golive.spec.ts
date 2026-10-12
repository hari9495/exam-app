import { compareRegister, parseRegister } from './golive.service';

describe('parallel run (PAY-10.07): the old register against a YukthiX run', () => {
  it('reads the register strictly: header, three amounts, one row a person', () => {
    expect(parseRegister('employee_code,name,gross,deductions,net\nKF-0142,Arjun,"46,800.00",2000,44800\nKF-0117,Divya,74867,2000,72867\n').rows).toEqual([
      { employeeCode: 'KF-0142', gross: '46800.00', deductions: '2000', net: '44800' },
      { employeeCode: 'KF-0117', gross: '74867', deductions: '2000', net: '72867' },
    ]);
    expect(parseRegister('code,gross\n').problems).toEqual(['The header needs employee_code, deductions, net.']);
    expect(parseRegister('employee_code,gross,deductions,net\nKF-1,1,1,x\nKF-2,1,1,1\nKF-2,1,1,1').problems).toEqual(['Line 2: an employee code and three amounts are needed.', 'Line 4: KF-2 is listed twice.']);
  });

  it('lists amounts more than a rupee apart, and people on one side only', () => {
    const ours = [
      { employeeCode: 'KF-1', name: 'Arjun', gross: '46800.00', deductions: '2000.00', net: '44800.00' },
      { employeeCode: 'KF-2', name: 'Divya', gross: '74867.00', deductions: '2000.00', net: '72867.00' },
      { employeeCode: 'KF-3', name: 'Meera', gross: '33320.00', deductions: '1880.00', net: '31440.00' },
    ];
    const theirs = [
      { employeeCode: 'KF-1', gross: '46800.50', deductions: '2000', net: '44800.50' },
      { employeeCode: 'KF-2', gross: '74867', deductions: '2200', net: '72667' },
      { employeeCode: 'KF-9', gross: '10000', deductions: '0', net: '10000' },
    ];
    const r = compareRegister(ours, theirs);
    expect(r.matched).toBe(1);
    expect(r.rows.map((x) => [x.employeeCode, x.field, x.difference])).toEqual([
      ['KF-2', 'deductions', '-200.00'],
      ['KF-2', 'net', '200.00'],
      ['KF-9', 'missing_in_yukthix', null],
      ['KF-3', 'missing_in_register', null],
    ]);
  });
});
