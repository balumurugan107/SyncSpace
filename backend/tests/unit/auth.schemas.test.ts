import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../../src/modules/auth/auth.schemas.js';
import { loadConfig } from '../../src/config/env.js';

describe('registerSchema', () => {
  const valid = { email: '  Ada@Example.COM ', password: 'correct-horse-1', displayName: '  Ada Lovelace ' };

  it('normalises email and trims the display name', () => {
    expect(registerSchema.parse(valid)).toEqual({
      email: 'ada@example.com',
      password: 'correct-horse-1',
      displayName: 'Ada Lovelace',
    });
  });

  it.each([
    ['short password', { password: 'a1' }],
    ['password without digit', { password: 'onlyletters' }],
    ['password without letter', { password: '1234567890' }],
    ['password over 72 bytes', { password: `a1${'x'.repeat(71)}` }],
    ['invalid email', { email: 'not-an-email' }],
    ['blank display name', { displayName: '   ' }],
  ])('rejects %s', (_label, override) => {
    expect(registerSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it('strips unknown fields', () => {
    const parsed = registerSchema.parse({ ...valid, isAdmin: true });
    expect(parsed).not.toHaveProperty('isAdmin');
  });
});

describe('loginSchema', () => {
  it('requires a password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('loadConfig', () => {
  it('fails fast with a readable message when required settings are missing', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://u:p@h/db', REDIS_URL: 'redis://h:6379', JWT_ACCESS_SECRET: 'short' })).toThrow(
      /at least 32 characters/,
    );
  });

  it('parses CORS origins and booleans', () => {
    const parsed = loadConfig({
      DATABASE_URL: 'postgres://u:p@h/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'x'.repeat(32),
      CORS_ORIGINS: 'http://a.test, http://b.test',
      COOKIE_SECURE: 'true',
    });
    expect(parsed.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(parsed.COOKIE_SECURE).toBe(true);
  });
});
