import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, refreshSession, setAccessToken } from './api-client';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const session = { user: { id: 'u1', email: 'a@b.co', displayName: 'A', createdAt: '', lastLoginAt: null }, accessToken: 'new-token', expiresIn: 900 };

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('old-token');
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('sends the bearer token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await api.get('/users/me');
    const headers = fetchMock.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer old-token');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/users/me');
  });

  it('refreshes once on TOKEN_EXPIRED and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }))
      .mockResolvedValueOnce(json(200, session))
      .mockResolvedValueOnce(json(200, { user: session.user }));

    await expect(api.get('/users/me')).resolves.toEqual({ user: session.user });
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/auth/refresh');
    expect((fetchMock.mock.calls[2]![1]!.headers as Headers).get('authorization')).toBe('Bearer new-token');
  });

  it('shares one in-flight refresh between concurrent callers', async () => {
    fetchMock.mockResolvedValue(json(200, session));
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(a).toEqual(session);
    expect(b).toEqual(session);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a refresh that lost a benign multi-tab race', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'REFRESH_TOKEN_STALE', message: 'stale' } }))
      .mockResolvedValueOnce(json(200, session));
    await expect(refreshSession()).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('exposes validation errors per field', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, { error: { code: 'VALIDATION_ERROR', message: 'bad', details: [{ field: 'email', message: 'Enter a valid email address' }] } }),
    );
    const error = await api.post('/auth/register', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fieldErrors).toEqual({ email: 'Enter a valid email address' });
  });
});
