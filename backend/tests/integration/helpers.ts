import request from 'supertest';
import { config } from '../../src/config/env.js';
import { pool } from '../../src/infrastructure/database/pool.js';
import { closeRedis, redis } from '../../src/infrastructure/redis/redis.js';
import { runMigrations } from '../../src/infrastructure/database/migrator.js';
import { createApp } from '../../src/app.js';

export const app = createApp();

export async function migrateTestDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await runMigrations(client, config.MIGRATIONS_DIR);
  } finally {
    client.release();
  }
}

export async function resetDatabase(): Promise<void> {
  await pool.query(
    'TRUNCATE activity_logs, tasks, projects, workspace_members, workspaces, refresh_tokens, users RESTART IDENTITY CASCADE',
  );
  await redis.flushdb(); // test database (1) only
}

export async function closeConnections(): Promise<void> {
  await Promise.all([pool.end(), closeRedis()]);
}

export function extractRefreshCookie(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = cookies.find((value) => value.startsWith('syncspace_rt='));
  if (!cookie) throw new Error('No refresh cookie in response');
  return cookie.split(';')[0]!;
}

let counter = 0;
export async function registerUser(overrides: Partial<{ email: string; password: string; displayName: string }> = {}) {
  counter += 1;
  const body = {
    email: `user${counter}-${Date.now()}@example.com`,
    password: 'secret-pass-1',
    displayName: `User ${counter}`,
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body).expect(201);
  return {
    body,
    user: res.body.user as { id: string; email: string; displayName: string },
    accessToken: res.body.accessToken as string,
    cookie: extractRefreshCookie(res.headers['set-cookie']),
  };
}

export type TestUser = Awaited<ReturnType<typeof registerUser>>;

export function as(user: TestUser) {
  const auth = { Authorization: `Bearer ${user.accessToken}` };
  return {
    get: (url: string) => request(app).get(url).set(auth),
    post: (url: string, body?: object) => request(app).post(url).set(auth).send(body ?? {}),
    patch: (url: string, body: object) => request(app).patch(url).set(auth).send(body),
    delete: (url: string) => request(app).delete(url).set(auth),
  };
}

export async function createWorkspace(owner: TestUser, name = 'Acme') {
  const res = await as(owner).post('/api/workspaces', { name }).expect(201);
  return res.body.workspace as { id: string; name: string; role: string };
}

export async function createProject(owner: TestUser, workspaceId: string, key = 'WEB', name = 'Website') {
  const res = await as(owner).post(`/api/workspaces/${workspaceId}/projects`, { name, key }).expect(201);
  return res.body.project as { id: string; key: string; workspaceId: string };
}

export async function addMember(owner: TestUser, workspaceId: string, member: TestUser, role = 'member') {
  await as(owner).post(`/api/workspaces/${workspaceId}/members`, { email: member.body.email, role }).expect(201);
}
