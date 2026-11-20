import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/infrastructure/database/pool.js';
import { app, extractRefreshCookie, migrateTestDatabase, registerUser, resetDatabase, closeConnections } from './helpers.js';

beforeAll(migrateTestDatabase);
beforeEach(resetDatabase);
afterAll(closeConnections);

describe('POST /api/auth/register', () => {
  it('creates the user, returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'Grace@Example.com', password: 'hopper-1906', displayName: 'Grace Hopper' })
      .expect(201);

    expect(res.body.user).toMatchObject({ email: 'grace@example.com', displayName: 'Grace Hopper' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('refreshToken');

    const cookie = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('syncspace_rt='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/auth/);

    const { rows } = await pool.query('SELECT password_hash, (SELECT count(*) FROM refresh_tokens)::int AS tokens FROM users');
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    expect(rows[0].tokens).toBe(1);
  });

  it('rejects a duplicate email regardless of case', async () => {
    await registerUser({ email: 'dup@example.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'DUP@example.com', password: 'another-pass-1', displayName: 'Dup' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns field-level validation errors', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'nope', password: 'short', displayName: '' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'displayName']));
  });

  it('rejects malformed JSON cleanly', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('content-type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with correct credentials', async () => {
    const { body } = await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: body.email.toUpperCase(), password: body.password })
      .expect(200);
    expect(res.body.user.email).toBe(body.email);
    expect(res.body.user.lastLoginAt).toEqual(expect.any(String));
  });

  it('returns the same error for a wrong password and an unknown email', async () => {
    const { body } = await registerUser();
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: body.email, password: 'wrong-1' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'x' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });
});

describe('protected routes', () => {
  it('reject requests without a token', async () => {
    const res = await request(app).get('/api/users/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('return and update the current profile', async () => {
    const { accessToken, user } = await registerUser();
    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(me.body.user.id).toBe(user.id);

    const updated = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ displayName: '  Renamed  ' })
      .expect(200);
    expect(updated.body.user.displayName).toBe('Renamed');
  });
});

describe('refresh token rotation', () => {
  it('issues a new token pair and invalidates the old refresh token', async () => {
    const { cookie } = await registerUser();

    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    const rotatedCookie = extractRefreshCookie(first.headers['set-cookie']);
    expect(rotatedCookie).not.toBe(cookie);
    expect(first.body.accessToken).toEqual(expect.any(String));

    await request(app).post('/api/auth/refresh').set('Cookie', rotatedCookie).expect(200);
  });

  it('treats immediate reuse of a just-rotated token as a benign race (no revocation)', async () => {
    const { cookie } = await registerUser();
    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    const rotatedCookie = extractRefreshCookie(first.headers['set-cookie']);

    const stale = await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    expect(stale.body.error.code).toBe('REFRESH_TOKEN_STALE');

    // The newer token is still valid.
    await request(app).post('/api/auth/refresh').set('Cookie', rotatedCookie).expect(200);
  });

  it('revokes the whole session family when an old token is replayed after the grace window', async () => {
    const { cookie } = await registerUser();
    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    const rotatedCookie = extractRefreshCookie(first.headers['set-cookie']);

    // Simulate time passing beyond the grace window.
    await pool.query(`UPDATE refresh_tokens SET revoked_at = now() - interval '1 hour' WHERE revoked_reason = 'rotated'`);

    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // The legitimate holder's newer token was revoked too.
    const after = await request(app).post('/api/auth/refresh').set('Cookie', rotatedCookie).expect(401);
    expect(after.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a missing or unknown refresh token', async () => {
    await request(app).post('/api/auth/refresh').expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', 'syncspace_rt=made-up').expect(401);
  });

  it('only allows one of two concurrent refreshes of the same token to succeed', async () => {
    const { cookie } = await registerUser();
    const results = await Promise.all([
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });
});

describe('sessions and logout', () => {
  it('lists active sessions and marks the current one', async () => {
    const { body, accessToken, cookie } = await registerUser();
    await request(app).post('/api/auth/login').send({ email: body.email, password: body.password }).expect(200);

    const res = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const { cookie } = await registerUser();
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    expect([res.headers['set-cookie']].flat().join(';')).toMatch(/syncspace_rt=;/);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('logout-all revokes every session of the user', async () => {
    const { body, accessToken, cookie } = await registerUser();
    const other = await request(app).post('/api/auth/login').send({ email: body.email, password: body.password });
    const otherCookie = extractRefreshCookie(other.headers['set-cookie']);

    await request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${accessToken}`).expect(204);

    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', otherCookie).expect(401);
  });
});
