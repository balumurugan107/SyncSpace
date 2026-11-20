import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/infrastructure/database/pool.js';
import {
  addMember,
  as,
  createProject,
  createWorkspace,
  migrateTestDatabase,
  registerUser,
  resetDatabase,
  type TestUser, closeConnections } from './helpers.js';

beforeAll(migrateTestDatabase);
beforeEach(resetDatabase);
afterAll(closeConnections);

interface TaskDto {
  id: string;
  key: string;
  title: string;
  status: string;
  position: number;
  version: number;
  assignee: { id: string } | null;
  completedAt: string | null;
}

async function setup() {
  const owner = await registerUser();
  const member = await registerUser();
  const outsider = await registerUser();
  const ws = await createWorkspace(owner);
  const project = await createProject(owner, ws.id, 'WEB');
  await addMember(owner, ws.id, member);
  return { owner, member, outsider, ws, project };
}

async function createTask(user: TestUser, projectId: string, body: object = {}): Promise<TaskDto> {
  const res = await as(user).post(`/api/projects/${projectId}/tasks`, { title: 'Task', ...body }).expect(201);
  return res.body.task;
}

async function column(user: TestUser, projectId: string, status: string): Promise<string[]> {
  const res = await as(user).get(`/api/projects/${projectId}/tasks`).expect(200);
  return (res.body.tasks as TaskDto[])
    .filter((t) => t.status === status)
    .sort((a, b) => a.position - b.position)
    .map((t) => t.title);
}

describe('task CRUD', () => {
  it('creates tasks with sequential human-readable keys and defaults', async () => {
    const { owner, project } = await setup();
    const first = await createTask(owner, project.id, { title: 'Design homepage' });
    const second = await createTask(owner, project.id, { title: 'Write copy' });
    expect(first).toMatchObject({ key: 'WEB-1', status: 'TODO', priority: 'MEDIUM', version: 1, assignee: null });
    expect(second.key).toBe('WEB-2');
    expect(second.position).toBeGreaterThan(first.position);
  });

  it('gives unique numbers to concurrent creates', async () => {
    const { owner, project } = await setup();
    const created = await Promise.all(Array.from({ length: 8 }, (_, i) => createTask(owner, project.id, { title: `T${i}` })));
    expect(new Set(created.map((t) => t.key)).size).toBe(8);
  });

  it('only allows workspace members as assignees', async () => {
    const { owner, member, outsider, project } = await setup();
    const ok = await createTask(owner, project.id, { assigneeId: member.user.id });
    expect(ok.assignee?.id).toBe(member.user.id);
    const bad = await as(owner).post(`/api/projects/${project.id}/tasks`, { title: 'x', assigneeId: outsider.user.id }).expect(400);
    expect(bad.body.error.details[0].field).toBe('assigneeId');
  });

  it('validates input', async () => {
    const { owner, project } = await setup();
    const res = await as(owner)
      .post(`/api/projects/${project.id}/tasks`, { title: '', status: 'DONE', dueDate: '31/12/2026' })
      .expect(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['title', 'status', 'dueDate']));
  });

  it('outsiders get 404 for tasks and boards', async () => {
    const { owner, outsider, project } = await setup();
    const task = await createTask(owner, project.id);
    await as(outsider).get(`/api/projects/${project.id}/tasks`).expect(404);
    await as(outsider).get(`/api/tasks/${task.id}`).expect(404);
    await as(outsider).patch(`/api/tasks/${task.id}`, { title: 'hijack' }).expect(404);
    await as(outsider).post(`/api/tasks/${task.id}/move`, { status: 'COMPLETED', afterTaskId: null }).expect(404);
    await as(outsider).delete(`/api/tasks/${task.id}`).expect(404);
  });

  it('updates fields, bumps the version and records what changed', async () => {
    const { owner, member, project } = await setup();
    const task = await createTask(owner, project.id, { title: 'Draft' });
    const res = await as(member)
      .patch(`/api/tasks/${task.id}`, { title: 'Final', priority: 'URGENT', assigneeId: member.user.id, dueDate: '2026-12-31', version: 1 })
      .expect(200);
    expect(res.body.task).toMatchObject({ title: 'Final', priority: 'URGENT', dueDate: '2026-12-31', version: 2 });

    const activity = await as(owner).get(`/api/tasks/${task.id}/activity`).expect(200);
    const actions = activity.body.activity.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['task.created', 'task.assigned', 'task.updated']));
    const updated = activity.body.activity.find((a: { action: string }) => a.action === 'task.updated');
    expect(updated.metadata.fields.sort()).toEqual(['dueDate', 'priority', 'title']);
    expect(updated.actor.id).toBe(member.user.id);
  });

  it('rejects a stale edit with 409 instead of overwriting', async () => {
    const { owner, member, project } = await setup();
    const task = await createTask(owner, project.id);
    await as(owner).patch(`/api/tasks/${task.id}`, { title: 'Owner edit', version: 1 }).expect(200);
    const stale = await as(member).patch(`/api/tasks/${task.id}`, { title: 'Member edit', version: 1 }).expect(409);
    expect(stale.body.error).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: 2 } });
    const current = await as(owner).get(`/api/tasks/${task.id}`).expect(200);
    expect(current.body.task.title).toBe('Owner edit');
  });

  it('sets and clears completedAt as status changes', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project.id);
    const done = await as(owner).patch(`/api/tasks/${task.id}`, { status: 'COMPLETED' }).expect(200);
    expect(done.body.task.completedAt).toEqual(expect.any(String));
    const reopened = await as(owner).patch(`/api/tasks/${task.id}`, { status: 'IN_PROGRESS' }).expect(200);
    expect(reopened.body.task.completedAt).toBeNull();
  });

  it('only the reporter or an admin can delete', async () => {
    const { owner, member, project } = await setup();
    const ownersTask = await createTask(owner, project.id);
    const membersTask = await createTask(member, project.id);
    await as(member).delete(`/api/tasks/${ownersTask.id}`).expect(403);
    await as(member).delete(`/api/tasks/${membersTask.id}`).expect(204);
    await as(owner).delete(`/api/tasks/${ownersTask.id}`).expect(204);
  });
});

describe('Kanban moves', () => {
  it('moves a card to another column at the requested place', async () => {
    const { owner, project } = await setup();
    const a = await createTask(owner, project.id, { title: 'A', status: 'COMPLETED' });
    await createTask(owner, project.id, { title: 'B', status: 'COMPLETED' });
    const moving = await createTask(owner, project.id, { title: 'M' });

    const res = await as(owner).post(`/api/tasks/${moving.id}/move`, { status: 'COMPLETED', afterTaskId: a.id, version: 1 }).expect(200);
    expect(res.body.task).toMatchObject({ status: 'COMPLETED', version: 2 });
    expect(res.body.task.completedAt).toEqual(expect.any(String));
    expect(await column(owner, project.id, 'COMPLETED')).toEqual(['A', 'M', 'B']);
    expect(await column(owner, project.id, 'TODO')).toEqual([]);

    const activity = await as(owner).get(`/api/projects/${project.id}/activity`).expect(200);
    expect(activity.body.activity[0]).toMatchObject({ action: 'task.status_changed', metadata: { from: 'TODO', to: 'COMPLETED' } });
  });

  it('moves to the top of a column and reorders within a column', async () => {
    const { owner, project } = await setup();
    const a = await createTask(owner, project.id, { title: 'A' });
    await createTask(owner, project.id, { title: 'B' });
    const c = await createTask(owner, project.id, { title: 'C' });
    await as(owner).post(`/api/tasks/${c.id}/move`, { status: 'TODO', afterTaskId: null }).expect(200);
    expect(await column(owner, project.id, 'TODO')).toEqual(['C', 'A', 'B']);
    await as(owner).post(`/api/tasks/${c.id}/move`, { status: 'TODO', afterTaskId: a.id }).expect(200);
    expect(await column(owner, project.id, 'TODO')).toEqual(['A', 'C', 'B']);
  });

  it('re-spaces a column when repeated inserts exhaust the gap', async () => {
    const { owner, project } = await setup();
    const a = await createTask(owner, project.id, { title: 'A' });
    await createTask(owner, project.id, { title: 'B' });
    const titles = ['A'];
    for (let i = 0; i < 60; i += 1) {
      const t = await createTask(owner, project.id, { title: `X${i}`, status: 'IN_REVIEW' });
      await as(owner).post(`/api/tasks/${t.id}/move`, { status: 'TODO', afterTaskId: a.id }).expect(200);
      titles.splice(1, 0, `X${i}`);
    }
    expect(await column(owner, project.id, 'TODO')).toEqual([...titles, 'B']);
  });

  it('rejects anchors that are not in the target column, or the task itself', async () => {
    const { owner, project } = await setup();
    const a = await createTask(owner, project.id, { title: 'A' });
    const b = await createTask(owner, project.id, { title: 'B' });
    await as(owner).post(`/api/tasks/${b.id}/move`, { status: 'IN_PROGRESS', afterTaskId: a.id }).expect(400);
    await as(owner).post(`/api/tasks/${b.id}/move`, { status: 'TODO', afterTaskId: b.id }).expect(400);
  });

  it('rejects a move based on a stale version', async () => {
    const { owner, member, project } = await setup();
    const t = await createTask(owner, project.id);
    await as(owner).post(`/api/tasks/${t.id}/move`, { status: 'IN_PROGRESS', afterTaskId: null, version: 1 }).expect(200);
    const res = await as(member).post(`/api/tasks/${t.id}/move`, { status: 'COMPLETED', afterTaskId: null, version: 1 }).expect(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('handles concurrent moves and edits on one board without deadlocking', async () => {
    const { owner, member, project } = await setup();
    const tasks = await Promise.all(Array.from({ length: 6 }, (_, i) => createTask(owner, project.id, { title: `C${i}` })));
    const results = await Promise.all(
      tasks.flatMap((t, i) => [
        as(i % 2 ? owner : member).post(`/api/tasks/${t.id}/move`, { status: 'IN_PROGRESS', afterTaskId: null }),
        as(i % 2 ? member : owner).patch(`/api/tasks/${t.id}`, { priority: 'HIGH' }),
        as(owner).delete(`/api/tasks/${tasks[(i + 3) % 6]!.id}`),
      ]),
    );
    // Every request finishes with a definite answer (deletes may race with moves -> 404), never a 500.
    expect(results.every((r) => r.status < 500)).toBe(true);
  });
});

describe('/api/me', () => {
  it('lists my assigned open tasks across workspaces, soonest due first', async () => {
    const { owner, member, project } = await setup();
    const other = await createProject(owner, (await createWorkspace(owner, 'Second')).id, 'OPS');
    await createTask(owner, project.id, { title: 'Later', assigneeId: owner.user.id, dueDate: '2030-01-01' });
    await createTask(owner, other.id, { title: 'Sooner', assigneeId: owner.user.id, dueDate: '2029-01-01' });
    await createTask(owner, project.id, { title: 'Done', assigneeId: owner.user.id, status: 'COMPLETED' });
    await createTask(owner, project.id, { title: 'Not mine', assigneeId: member.user.id });

    const open = await as(owner).get('/api/me/tasks').expect(200);
    expect(open.body.tasks.map((t: TaskDto) => t.title)).toEqual(['Sooner', 'Later']);
    const all = await as(owner).get('/api/me/tasks?scope=all').expect(200);
    expect(all.body.tasks).toHaveLength(3);
  });

  it('summarises the dashboard', async () => {
    const { owner, project } = await setup();
    await createTask(owner, project.id, { assigneeId: owner.user.id, dueDate: '2000-01-01' });
    await createTask(owner, project.id, { assigneeId: owner.user.id, status: 'COMPLETED' });
    const res = await as(owner).get('/api/me/dashboard').expect(200);
    expect(res.body.summary).toMatchObject({
      workspaceCount: 1,
      projectCount: 1,
      assignedOpen: 1,
      overdue: 1,
      completedLast7Days: 1,
      byStatus: { TODO: 1, COMPLETED: 1 },
    });
    expect(res.body.recentActivity.length).toBeGreaterThan(0);
  });
});
