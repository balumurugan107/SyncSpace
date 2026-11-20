import { describe, expect, it } from 'vitest';
import { suggestKey } from '@/features/projects/create-project-dialog';
import { groupMyTasks } from '@/features/tasks/my-tasks-page';
import { dueState, parseDateOnly, todayIso } from './task-meta';
import type { Task } from './types';

const now = new Date(2026, 10, 3, 15, 0); // 3 Nov 2026, local time

describe('dates', () => {
  it('parses date-only strings without a timezone shift', () => {
    const d = parseDateOnly('2026-11-03');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 3]);
    expect(todayIso(now)).toBe('2026-11-03');
  });

  it('classifies due dates', () => {
    expect(dueState('2026-11-02', now)).toBe('overdue');
    expect(dueState('2026-11-03', now)).toBe('today');
    expect(dueState('2026-11-10', now)).toBe('soon');
    expect(dueState('2026-11-11', now)).toBe('later');
  });
});

describe('groupMyTasks', () => {
  const t = (id: string, dueDate: string | null, status: Task['status'] = 'TODO') => ({ id, dueDate, status }) as Task;
  it('groups by urgency in a fixed order', () => {
    const groups = groupMyTasks([t('later', '2027-01-01'), t('done', null, 'COMPLETED'), t('none', null), t('late', '2026-01-01'), t('today', '2026-11-03')], now);
    expect(groups.map(([name, tasks]) => [name, tasks.map((x) => x.id)])).toEqual([
      ['Overdue', ['late']],
      ['Due today', ['today']],
      ['Later', ['later']],
      ['No due date', ['none']],
      ['Completed', ['done']],
    ]);
  });
});

describe('suggestKey', () => {
  it.each([
    ['Website', 'WEB'],
    ['Mobile App', 'MA'],
    ['  data platform v2 ', 'DPV'],
    ['2026 Launch', 'P2L'],
    ['', ''],
  ])('%s -> %s', (name, key) => {
    expect(suggestKey(name)).toBe(key);
  });
});
