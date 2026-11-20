import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/infrastructure/database/pool.js';
import { addMember, as, createProject, createWorkspace, migrateTestDatabase, registerUser, resetDatabase, closeConnections } from './helpers.js';

beforeAll(migrateTestDatabase);
beforeEach(resetDatabase);
afterAll(closeConnections);

describe('workspaces', () => {
  it('creator becomes owner; list shows only my workspaces with counts', async () => {
    const ada = await registerUser();
    const bob = await registerUser();
    const ws = await createWorkspace(ada, 'Analytical');
    expect(ws.role).toBe('owner');
    await createWorkspace(bob, 'Bob’s');

    const list = await as(ada).get('/api/workspaces').expect(200);
    expect(list.body.workspaces).toHaveLength(1);
    expect(list.body.workspaces[0]).toMatchObject({ name: 'Analytical', role: 'owner', memberCount: 1, projectCount: 0 });
  });

  it('hides workspaces from non-members with 404 (not 403)', async () => {
    const ada = await registerUser();
    const eve = await registerUser();
    const ws = await createWorkspace(ada);
    await as(eve).get(`/api/workspaces/${ws.id}`).expect(404);
    await as(eve).get(`/api/workspaces/${ws.id}/members`).expect(404);
    await as(eve).get(`/api/workspaces/${ws.id}/projects`).expect(404);
    await as(eve).patch(`/api/workspaces/${ws.id}`, { name: 'Pwned' }).expect(404);
  });

  it('returns 404 for malformed ids instead of a database error', async () => {
    const ada = await registerUser();
    await as(ada).get('/api/workspaces/not-a-uuid').expect(404);
  });

  it('only admins rename; only the owner deletes', async () => {
    const ada = await registerUser();
    const bob = await registerUser();
    const ws = await createWorkspace(ada);
    await addMember(ada, ws.id, bob);

    await as(bob).patch(`/api/workspaces/${ws.id}`, { name: 'Bob rules' }).expect(403);
    await as(ada).patch(`/api/workspaces/${ws.id}`, { name: 'Renamed' }).expect(200);

    await as(ada).patch(`/api/workspaces/${ws.id}/members/${bob.user.id}`, { role: 'admin' }).expect(200);
    await as(bob).patch(`/api/workspaces/${ws.id}`, { description: 'now allowed' }).expect(200);
    await as(bob).delete(`/api/workspaces/${ws.id}`).expect(403);
    await as(ada).delete(`/api/workspaces/${ws.id}`).expect(204);
    await as(ada).get(`/api/workspaces/${ws.id}`).expect(404);
  });
});

describe('membership', () => {
  it('adds an existing user by email and rejects unknown emails and duplicates', async () => {
    const ada = await registerUser();
    const bob = await registerUser();
    const ws = await createWorkspace(ada);

    const missing = await as(ada).post(`/api/workspaces/${ws.id}/members`, { email: 'nobody@example.com' }).expect(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');

    const added = await as(ada).post(`/api/workspaces/${ws.id}/members`, { email: bob.body.email.toUpperCase() }).expect(201);
    expect(added.body.member).toMatchObject({ userId: bob.user.id, role: 'member' });

    const dup = await as(ada).post(`/api/workspaces/${ws.id}/members`, { email: bob.body.email }).expect(409);
    expect(dup.body.error.code).toBe('ALREADY_MEMBER');

    const members = await as(bob).get(`/api/workspaces/${ws.id}/members`).expect(200);
    expect(members.body.members.map((m: { role: string }) => m.role)).toEqual(['owner', 'member']);
  });

  it('members cannot manage members; owner cannot be demoted, removed or leave', async () => {
    const ada = await registerUser();
    const bob = await registerUser();
    const cy = await registerUser();
    const ws = await createWorkspace(ada);
    await addMember(ada, ws.id, bob);

    await as(bob).post(`/api/workspaces/${ws.id}/members`, { email: cy.body.email }).expect(403);
    await as(ada).patch(`/api/workspaces/${ws.id}/members/${ada.user.id}`, { role: 'member' }).expect(403);
    await as(ada).delete(`/api/workspaces/${ws.id}/members/${ada.user.id}`).expect(403);
    // "owner" cannot be granted through the API at all
    await as(ada).patch(`/api/workspaces/${ws.id}/members/${bob.user.id}`, { role: 'owner' }).expect(400);
  });

  it('a member can leave; their tasks in that workspace are unassigned', async () => {
    const ada = await registerUser();
    const bob = await registerUser();
    const ws = await createWorkspace(ada);
    const project = await createProject(ada, ws.id);
    await addMember(ada, ws.id, bob);
    const task = await as(ada).post(`/api/projects/${project.id}/tasks`, { title: 'Hand-off', assigneeId: bob.user.id }).expect(201);

    await as(bob).delete(`/api/workspaces/${ws.id}/members/${bob.user.id}`).expect(204);
    await as(bob).get(`/api/workspaces/${ws.id}`).expect(404);
    const after = await as(ada).get(`/api/tasks/${task.body.task.id}`).expect(200);
    expect(after.body.task.assignee).toBeNull();

    const activity = await as(ada).get(`/api/workspaces/${ws.id}/activity`).expect(200);
    expect(activity.body.activity[0]).toMatchObject({ action: 'member.left', entityTitle: bob.user.displayName });
  });
});

describe('projects', () => {
  it('admins create projects with unique upper-cased keys', async () => {
    const ada = await registerUser();
    const ws = await createWorkspace(ada);
    const res = await as(ada).post(`/api/workspaces/${ws.id}/projects`, { name: 'Website', key: 'web' }).expect(201);
    expect(res.body.project).toMatchObject({ key: 'WEB', role: 'owner', taskCounts: { TODO: 0, COMPLETED: 0 } });

    const dup = await as(ada).post(`/api/workspaces/${ws.id}/projects`, { name: 'Other', key: 'WEB' }).expect(409);
    expect(dup.body.error.code).toBe('PROJECT_KEY_TAKEN');
    await as(ada).post(`/api/workspaces/${ws.id}/projects`, { name: 'Bad', key: '1X' }).expect(400);
  });

  it('members can read but not create, rename or delete projects', async () => {
    const ada = await registerUser();
    const bob = await registerUser();
    const ws = await createWorkspace(ada);
    const project = await createProject(ada, ws.id);
    await addMember(ada, ws.id, bob);

    await as(bob).get(`/api/projects/${project.id}`).expect(200);
    await as(bob).post(`/api/workspaces/${ws.id}/projects`, { name: 'X', key: 'XX' }).expect(403);
    await as(bob).patch(`/api/projects/${project.id}`, { name: 'Renamed' }).expect(403);
    await as(bob).delete(`/api/projects/${project.id}`).expect(403);
  });

  it('GET /api/projects lists projects across all my workspaces only', async () => {
    const ada = await registerUser();
    const eve = await registerUser();
    const a = await createWorkspace(ada, 'A');
    const b = await createWorkspace(ada, 'B');
    await createProject(ada, a.id, 'ONE');
    await createProject(ada, b.id, 'TWO');
    await createProject(eve, (await createWorkspace(eve, 'E')).id, 'EVE');

    const res = await as(ada).get('/api/projects').expect(200);
    expect(res.body.projects.map((p: { key: string }) => p.key).sort()).toEqual(['ONE', 'TWO']);
    await as(eve).get(`/api/projects/${res.body.projects[0].id}`).expect(404);
  });

  it('deleting a project removes its tasks and leaves a workspace-level history entry', async () => {
    const ada = await registerUser();
    const ws = await createWorkspace(ada);
    const project = await createProject(ada, ws.id);
    const task = await as(ada).post(`/api/projects/${project.id}/tasks`, { title: 'Gone soon' }).expect(201);

    await as(ada).delete(`/api/projects/${project.id}`).expect(204);
    await as(ada).get(`/api/tasks/${task.body.task.id}`).expect(404);
    const activity = await as(ada).get(`/api/workspaces/${ws.id}/activity`).expect(200);
    expect(activity.body.activity[0]).toMatchObject({ action: 'project.deleted', entityTitle: 'Website' });
  });
});
