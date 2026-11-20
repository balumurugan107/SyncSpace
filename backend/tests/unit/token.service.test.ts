import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '../../src/modules/auth/token.service.js';
import { AppError } from '../../src/shared/errors/app-error.js';

const user = { id: '7b0c1c1e-8d5e-4a8e-9f3c-1a2b3c4d5e6f', email: 'ada@example.com' };

async function expectAuthError(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).statusCode).toBe(401);
  expect((error as AppError).code).toBe(code);
}

describe('access tokens', () => {
  it('round-trips the user identity', async () => {
    const token = await signAccessToken(user);
    await expect(verifyAccessToken(token)).resolves.toEqual(user);
  });

  it('rejects a tampered token', async () => {
    const token = await signAccessToken(user);
    const [header, payload, signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'someone-else', email: 'x@y.z' })).toString('base64url');
    await expectAuthError(verifyAccessToken(`${header}.${forgedPayload}.${signature}`), 'INVALID_TOKEN');
    expect(payload).toBeDefined();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('syncspace-api')
      .setAudience('syncspace-web')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('a-completely-different-secret-of-sufficient-length'));
    await expectAuthError(verifyAccessToken(token), 'INVALID_TOKEN');
  });

  it('reports expiry with a dedicated code so the client knows to refresh', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
    const expired = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('syncspace-api')
      .setAudience('syncspace-web')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);
    await expectAuthError(verifyAccessToken(expired), 'TOKEN_EXPIRED');
  });

  it('rejects garbage', async () => {
    await expectAuthError(verifyAccessToken('not-a-jwt'), 'INVALID_TOKEN');
  });
});

describe('refresh tokens', () => {
  it('are random and URL-safe', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hash deterministically and never equal the raw token', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toContain(token);
    expect(hashRefreshToken(token)).toHaveLength(64);
  });
});
