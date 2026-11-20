import { describe, expect, it } from 'vitest';
import { eventQueryKeys, rememberEvent } from './realtime-logic';
const event = { id: 'event', type: 'task.moved', workspaceId: 'workspace', projectId: 'project', taskId: 'task', actorId: 'user' };
describe('real-time reconciliation', () => {
  it('refreshes task, project/board, dashboard and activity after task changes', () => {
    expect(eventQueryKeys(event)).toEqual(expect.arrayContaining([['projects', 'project'], ['tasks', 'task'], ['me'], ['activity']]));
  });
  it('chat refreshes only its workspace history', () => {
    expect(eventQueryKeys({ ...event, type: 'chat.message' })).toEqual([['chat', 'workspace']]);
  });
  it('removal reconciles tasks and chat as well as membership', () => {
    expect(eventQueryKeys({ ...event, type: 'member.removed', projectId: null, taskId: null })).toEqual(expect.arrayContaining([['tasks'], ['chat', 'workspace'], ['projects']]));
  });
  it('deduplicates events and bounds retained IDs', () => {
    const seen = new Set<string>();
    expect(rememberEvent(seen, 'a')).toBe(true);
    expect(rememberEvent(seen, 'a')).toBe(false);
    for (let n=0;n<5100;n++) rememberEvent(seen, String(n));
    expect(seen.size).toBe(5000);
  });
});
