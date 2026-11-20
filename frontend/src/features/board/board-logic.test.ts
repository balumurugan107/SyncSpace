import { describe, expect, it } from 'vitest';
import type { Task } from '@/features/work/types';
import { anchorFor, applyMove, findColumn, groupIntoColumns, matchesFilters, positionAfter } from './board-logic';

function task(id: string, status: Task['status'], position: number, extra: Partial<Task> = {}): Task {
  return {
    id, status, position, projectId: 'p', workspaceId: 'w', projectKey: 'WEB', projectName: 'Web', workspaceName: 'Acme',
    number: 1, key: `WEB-${id}`, title: `Task ${id}`, description: '', priority: 'MEDIUM', assignee: null, reporter: null,
    dueDate: null, version: 1, createdAt: '', updatedAt: '', completedAt: null, ...extra,
  };
}

const board = [task('a', 'TODO', 1024), task('c', 'TODO', 3072), task('b', 'TODO', 2048), task('x', 'COMPLETED', 1024)];

describe('board logic', () => {
  it('groups tasks into ordered columns', () => {
    const columns = groupIntoColumns(board);
    expect(columns.TODO).toEqual(['a', 'b', 'c']);
    expect(columns.COMPLETED).toEqual(['x']);
    expect(columns.IN_PROGRESS).toEqual([]);
  });

  it('finds the column of a card or a column id', () => {
    const columns = groupIntoColumns(board);
    expect(findColumn(columns, 'b')).toBe('TODO');
    expect(findColumn(columns, 'IN_REVIEW')).toBe('IN_REVIEW');
    expect(findColumn(columns, 'nope')).toBeNull();
  });

  it('uses the card above as the anchor, null at the top', () => {
    const columns = groupIntoColumns(board);
    expect(anchorFor(columns, 'TODO', 'a')).toBeNull();
    expect(anchorFor(columns, 'TODO', 'c')).toBe('b');
  });

  it('computes the same positions as the server rule', () => {
    expect(positionAfter(board, 'TODO', 'c', 'a')).toBe(1536); // between a and b
    expect(positionAfter(board, 'TODO', 'b', null)).toBe(0); // top: first - 1024
    expect(positionAfter(board, 'COMPLETED', 'a', 'x')).toBe(2048); // after last
    expect(positionAfter(board, 'IN_REVIEW', 'a', null)).toBe(1024); // empty column
  });

  it('applies a move for the optimistic update', () => {
    const moved = applyMove(board, 'c', 'COMPLETED', null);
    expect(groupIntoColumns(moved).COMPLETED).toEqual(['c', 'x']);
    expect(groupIntoColumns(moved).TODO).toEqual(['a', 'b']);
  });

  it('filters by text, priority and assignee', () => {
    const mine = task('m', 'TODO', 1, { title: 'Fix login', priority: 'URGENT', assignee: { id: 'me', displayName: 'Me', email: '' } });
    const none = { search: '', assignee: 'any', priority: 'any' } as const;
    expect(matchesFilters(mine, { ...none, search: 'LOGIN' }, 'me')).toBe(true);
    expect(matchesFilters(mine, { ...none, search: 'WEB-m' }, 'me')).toBe(true);
    expect(matchesFilters(mine, { ...none, search: 'signup' }, 'me')).toBe(false);
    expect(matchesFilters(mine, { ...none, priority: 'LOW' }, 'me')).toBe(false);
    expect(matchesFilters(mine, { ...none, assignee: 'me' }, 'me')).toBe(true);
    expect(matchesFilters(mine, { ...none, assignee: 'unassigned' }, 'me')).toBe(false);
    expect(matchesFilters(task('u', 'TODO', 1), { ...none, assignee: 'unassigned' }, 'me')).toBe(true);
  });
});
