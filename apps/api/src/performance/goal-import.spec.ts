import { ImportFileProblem } from './competency-import';
import { parseGoalCsv } from './goal-import';

// T2-C item 71 (answer 2844): the goal CSV is checked row by row; file-wide problems stop it.
describe('goal import (71)', () => {
  it('reads KPI goals; weight and kind are optional', () => {
    const { rows, problems } = parseGoalCsv('Employee code,Title,Weight,Description\nKF-001,Cut scrap by 5%,40,On line 3\nKF-002,Close audits on time,,');
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { line: 2, employeeCode: 'KF-001', title: 'Cut scrap by 5%', description: 'On line 3', weight: 40 },
      { line: 3, employeeCode: 'KF-002', title: 'Close audits on time', description: null, weight: 0 },
    ]);
  });

  it('negative: each bad row says why; repeats, OKRs and bad weights are refused', () => {
    const { rows, problems } = parseGoalCsv('employee_code,title,weight,kind\n,Ok title,10,kpi\nKF-1,No,10,kpi\nKF-1,Grow sales,120,kpi\nKF-1,Grow exports,10,okr\nKF-2,Same goal,10,\nKF-2,same GOAL,10,');
    expect(rows.map((r) => r.line)).toEqual([6]);
    expect(problems.map((p) => [p.line, p.problems.join(' ')])).toEqual([
      [2, 'Give the employee code.'],
      [3, 'Give a title of 3 to 200 characters.'],
      [4, 'Weight is a number from 0 to 100.'],
      [5, 'Add an objective with key results on the Goals page; the file takes KPI goals.'],
      [7, 'This person has this goal twice in the file.'],
    ]);
  });

  it('negative: an unknown or missing column, or no rows, stops the whole file', () => {
    expect(() => parseGoalCsv('employee_code,title,salary\nKF-1,Goal one,1')).toThrow(ImportFileProblem);
    expect(() => parseGoalCsv('title\nGoal one')).toThrow(/Missing column: employee_code/);
    expect(() => parseGoalCsv('employee_code,title\n')).toThrow(/no rows/);
  });
});
